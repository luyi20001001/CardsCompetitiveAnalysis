// ============================================================
// 信用卡競品比較產生器 — Cloudflare Worker
// 1. 提供網站靜態檔（public/）
// 2. /api/state     讀取網址覆蓋值與缺漏紀錄
// 3. /api/login     管理者登入（密碼存在 Worker secret）
// 4. /api/urls      管理者儲存網址
// 5. /api/generate  讀取官方網址並產出比較表與洞察
//    預設使用內建爬蟲（不需任何金鑰）；若有設定 GEMINI_API_KEY 則改用 Gemini 擷取
// ============================================================
import { BANKS, ITEMS, resolveUrl, allUrlKeys } from '../public/data.js';
import { fetchPage, pick, ruleInsights } from './crawler.js';

const CARD = {}, BANK_OF = {}, ITEM = {};
BANKS.forEach(b => b.cards.forEach(c => { CARD[c.id] = c; BANK_OF[c.id] = b; }));
Object.entries(ITEMS).forEach(([g, list]) => list.forEach(it => { ITEM[it.id] = { ...it, group: g }; }));
const URL_KEYS = new Set(allUrlKeys());

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (url.pathname === '/api/state' && request.method === 'GET') return json(await getState(env));
      if (url.pathname === '/api/login' && request.method === 'POST') return login(request, env);
      if (url.pathname === '/api/urls' && request.method === 'PUT') return saveUrls(request, env);
      if (url.pathname === '/api/generate' && request.method === 'POST') return generate(request, env, ctx);
      return json({ error: 'not_found' }, 404);
    } catch (err) {
      return json({ error: 'server_error', message: String(err?.message || err) }, 500);
    }
  },
};

/* ---------------- 狀態 ---------------- */
async function getState(env) {
  const [overrides, hits] = await Promise.all([
    env.STORE.get('urls', 'json'), env.STORE.get('hits', 'json'),
  ]);
  return { overrides: overrides || {}, hits: hits || {} };
}

/* ---------------- 管理者登入 ---------------- */
const enc = new TextEncoder();
async function hmac(text, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function login(request, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json({ error: 'not_configured' }, 500);
  const { password } = await request.json().catch(() => ({}));
  if (typeof password !== 'string' || !safeEqual(password, env.ADMIN_PASSWORD)) {
    await new Promise(r => setTimeout(r, 600)); // 減緩暴力猜測
    return json({ error: 'wrong_password' }, 401);
  }
  const exp = Date.now() + 8 * 3600 * 1000; // 8 小時
  const payload = `admin.${exp}`;
  return json({ token: `${payload}.${await hmac(payload, env.SESSION_SECRET)}`, exp });
}
async function isAdmin(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'admin') return false;
  if (Number(parts[1]) < Date.now()) return false;
  return safeEqual(parts[2], await hmac(`${parts[0]}.${parts[1]}`, env.SESSION_SECRET));
}

/* ---------------- 儲存網址 ---------------- */
async function saveUrls(request, env) {
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  const { overrides } = await request.json().catch(() => ({}));
  if (!overrides || typeof overrides !== 'object') return json({ error: 'bad_request' }, 400);
  const clean = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (!URL_KEYS.has(k) || typeof v !== 'string') continue;
    const s = v.trim();
    if (s && !/^https?:\/\//i.test(s)) return json({ error: 'bad_url', key: k }, 400);
    clean[k] = s;
  }
  await env.STORE.put('urls', JSON.stringify(clean));
  return json({ ok: true, overrides: clean });
}

/* ---------------- 產生比較表 ---------------- */
async function generate(request, env, ctx) {
  const body = await request.json().catch(() => ({}));
  const cardIds = (body.cards || []).filter(id => CARD[id]).slice(0, 12);
  const itemIds = (body.items || []).filter(id => ITEM[id]);
  if (!cardIds.length || !itemIds.length) return json({ error: 'bad_request' }, 400);
  const force = body.force === true && await isAdmin(request, env);

  const { overrides, hits } = await getState(env);
  const askItems = itemIds.filter(id => !ITEM[id].local);
  const useGemini = !!env.GEMINI_API_KEY && env.USE_GEMINI !== 'false';
  const ttl = Math.max(60, Math.round(Number(env.CACHE_MINUTES ?? 60) * 60)); // KV 最短 60 秒
  const plans = Object.fromEntries(cardIds.map(cid => [cid, buildPlan(cid, askItems, overrides)]));

  const perCard = useGemini
    ? await runGemini(env, ctx, cardIds, plans, ttl, force)
    : await runCrawler(env, ctx, cardIds, plans, ttl, force);

  const results = {}, errors = {}, failed = {};
  perCard.forEach(r => {
    results[r.cid] = r.items || {};
    if (r.error) errors[r.cid] = r.error;
    if (r.failedUrls?.length) failed[r.cid] = r.failedUrls;
  });

  // 記錄「有網址但官網查無資料」的項目，供後台待補清單使用
  const now = new Date().toISOString();
  let changed = false;
  perCard.forEach(r => (r.asked || []).forEach(iid => {
    if (errors[r.cid] || results[r.cid]?.[iid]?.value) return;
    const k = `${r.cid}|${iid}`;
    const h = hits[k] || { cid: r.cid, rid: iid, count: 0 };
    h.count++; h.last = now; hits[k] = h; changed = true;
  }));
  if (changed) ctx.waitUntil(env.STORE.put('hits', JSON.stringify(hits)));

  let insights = null;
  if (useGemini) { try { insights = await makeInsights(env, env.GEMINI_MODEL || 'gemini-2.5-flash', cardIds, itemIds, results); } catch (e) { insights = null; } }
  if (!insights) {
    insights = ruleInsights(cardIds.map(cid => {
      const c = CARD[cid], cells = {};
      askItems.forEach(iid => { cells[iid] = results[cid]?.[iid]?.value || null; });
      return { name: `${BANK_OF[cid].short} ${c.name}`, feature: c.feature, kind: c.kind, type: c.type, cells };
    }));
  }

  return json({
    results, errors, failed, insights, mode: useGemini ? 'gemini' : 'crawler',
    fetchedAt: now, cached: perCard.every(r => r.cached),
  });
}

/* 內建爬蟲：每個網址只讀一次，結果快取 CACHE_MINUTES 分鐘 */
async function runCrawler(env, ctx, cardIds, plans, ttl, force) {
  const urls = [...new Set(cardIds.flatMap(cid => plans[cid].urls))];
  const pages = {}, pageErr = {};
  let allCached = true;
  await Promise.all(urls.map(async u => {
    const key = 'page:' + await sha(u);
    if (!force) {
      const hit = await env.STORE.get(key, 'json');
      if (hit) { pages[u] = hit; return; }
    }
    allCached = false;
    try {
      pages[u] = await fetchPage(u);
      ctx.waitUntil(env.STORE.put(key, JSON.stringify(pages[u]), { expirationTtl: ttl }));
    } catch (err) { pageErr[u] = String(err?.message || err); }
  }));
  return cardIds.map(cid => {
    const plan = plans[cid], items = {};
    for (const it of plan.items) {
      let found = null;
      for (const u of it.urls) {
        const v = pick(pages[u], it.id, CARD[cid].name);
        if (v) { found = { value: v, source: u }; break; }
      }
      items[it.id] = found;
    }
    const failedUrls = plan.urls.filter(u => pageErr[u]).map(u => `${u}（${pageErr[u]}）`);
    const allFailed = plan.urls.length > 0 && plan.urls.every(u => pageErr[u]);
    return { cid, asked: plan.items.map(i => i.id), items, failedUrls, cached: allCached,
      ...(allFailed ? { error: pageErr[plan.urls[0]] } : {}) };
  });
}

/* Gemini：每張卡一次呼叫（平行），結果依「模型＋網址＋項目」快取 */
async function runGemini(env, ctx, cardIds, plans, ttl, force) {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  return Promise.all(cardIds.map(async cid => {
    const plan = plans[cid];
    const asked = plan.items.map(i => i.id);
    if (!plan.urls.length || !plan.items.length) return { cid, asked, items: {}, failedUrls: [], cached: true };
    const cacheKey = 'cache:' + await sha(JSON.stringify({ model, v: 2, urls: plan.urls, items: asked }));
    if (!force) {
      const hit = await env.STORE.get(cacheKey, 'json');
      if (hit) return { cid, asked, ...hit, cached: true };
    }
    try {
      const out = await extractCard(env, model, cid, plan);
      ctx.waitUntil(env.STORE.put(cacheKey, JSON.stringify(out), { expirationTtl: ttl }));
      return { cid, asked, ...out, cached: false };
    } catch (err) {
      return { cid, asked, error: String(err?.message || err), items: {}, failedUrls: [] };
    }
  }));
}

function buildPlan(cid, askItems, overrides) {
  const bank = BANK_OF[cid];
  const productUrls = [resolveUrl(`card:${cid}:official`, overrides), resolveUrl(`card:${cid}:event`, overrides)].filter(Boolean);
  const items = [], urls = new Set();
  for (const iid of askItems) {
    const it = ITEM[iid];
    const src = it.group === 'product' ? productUrls : [resolveUrl(`addon:${bank.id}:${iid}`, overrides)].filter(Boolean);
    if (!src.length) continue; // 沒有網址 → 前端直接顯示 N/A
    src.forEach(u => urls.add(u));
    items.push({ id: iid, label: it.label, ask: it.ask, urls: src });
  }
  return { urls: [...urls].slice(0, 20), items }; // URL context 每次最多 20 個網址
}

async function extractCard(env, model, cid, plan) {
  const c = CARD[cid], b = BANK_OF[cid];
  const prompt = `你是信用卡資料擷取器。只能根據下列官方網址的實際內容作答，禁止使用任何其他知識、禁止推測。
卡片：${b.name}「${c.name}」
官方網址：
${plan.urls.map(u => '- ' + u).join('\n')}

請擷取以下欄位（每個欄位只看指定網址）：
${plan.items.map(i => `- ${i.id}（${i.label}）：${i.ask}。網址：${i.urls.join('、')}`).join('\n')}

規則：
1. 使用繁體中文，每個 value 精簡在 80 字內，保留關鍵數字與條件。
2. 附加權益頁面若依卡別區分，只寫出適用於「${c.name}」的內容；若此卡不適用，value 寫「此卡不適用」。
3. 頁面找不到該資訊時，value 設為 null。
4. source 填寫資訊實際出處的網址（必須是上面列出的網址之一）。
5. 只輸出 JSON，不要 Markdown、不要說明文字。格式：
{"items":{"欄位id":{"value":"…或 null","source":"https://…"}}}`;

  const res = await gemini(env, model, prompt, true);
  const parsed = parseJson(res.text);
  const items = {};
  for (const i of plan.items) {
    const v = parsed?.items?.[i.id];
    const value = v && typeof v.value === 'string' && v.value.trim() ? v.value.trim() : null;
    const source = v && plan.urls.includes(v.source) ? v.source : i.urls[0];
    items[i.id] = value ? { value, source } : null;
  }
  return { items, failedUrls: res.failedUrls };
}

async function makeInsights(env, model, cardIds, itemIds, results) {
  const table = cardIds.map(cid => {
    const c = CARD[cid], row = { 卡片: `${BANK_OF[cid].short} ${c.name}`, 產品特色: c.feature, 卡別: c.kind, 類型: c.type };
    itemIds.forEach(iid => { if (!ITEM[iid].local) row[ITEM[iid].label] = results[cid]?.[iid]?.value || '官方網址未記載'; });
    return row;
  });
  const prompt = `以下是信用卡競品比較表（JSON）。請只根據表中資料，用繁體中文寫出 3 組策略洞察，每組 2 至 4 點，每點 60 字內。
不可引用表外資訊；表中是「官方網址未記載」的項目不可推測，可指出資料缺口。
- core：核心回饋優勢分析（最高回饋率、通路覆蓋、機制彈性）
- threshold：申辦門檻與資格評估（年費減免、財管門檻、申辦資格難易）
- addon：附加權益覆蓋度洞察（若表中沒有附加權益欄位，寫一點說明即可）
只輸出 JSON：{"core":["…"],"threshold":["…"],"addon":["…"]}

${JSON.stringify(table)}`;
  const res = await gemini(env, model, prompt, false);
  const p = parseJson(res.text);
  if (!p || !Array.isArray(p.core)) return null;
  const clip = a => (Array.isArray(a) ? a : []).filter(x => typeof x === 'string').slice(0, 4);
  return { core: clip(p.core), threshold: clip(p.threshold), addon: clip(p.addon) };
}

/* ---------------- Gemini API ---------------- */
async function gemini(env, model, prompt, useUrlContext) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1 },
  };
  if (useUrlContext) body.tools = [{ url_context: {} }];
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map(p => p.text || '').join('');
  const meta = cand?.urlContextMetadata || cand?.url_context_metadata;
  const list = meta?.urlMetadata || meta?.url_metadata || [];
  const failedUrls = list
    .filter(m => { const s = m.urlRetrievalStatus || m.url_retrieval_status || ''; return s && !/SUCCESS/.test(s); })
    .map(m => m.retrievedUrl || m.retrieved_url);
  return { text, failedUrls };
}

function parseJson(text) {
  if (!text) return null;
  const t = text.replace(/```json|```/g, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}
