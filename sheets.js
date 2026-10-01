// ============================================================
// 讀取 Google 試算表（需設定為「知道連結的任何人都能檢視」）
// 每家銀行兩個分頁：
//   卡片分頁欄位：主力/非主力、卡片名稱、特色、類型、銀行卡/聯名卡、官網、活動網址
//   附加權益分頁欄位：主題、網址
// ============================================================
import { ITEMS } from '../public/data.js';

export function sheetId(url) {
  const m = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// 解析 CSV（支援引號、逗號與換行）
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

async function fetchTab(id, tab, fresh) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}` + (fresh ? `&_=${Date.now()}` : '');
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    cf: fresh ? { cacheTtl: 0 } : { cacheTtl: 60, cacheEverything: true }, // 一般讀取快取 60 秒
  });
  const type = res.headers.get('content-type') || '';
  if (!res.ok) throw new Error(res.status === 404 ? '找不到試算表' : `讀取失敗（HTTP ${res.status}）`);
  if (/html/i.test(type)) throw new Error('試算表未開放檢視：請設為「知道連結的任何人都能檢視」');
  const rows = parseCsv(await res.text());
  if (!rows.length) throw new Error('分頁沒有資料');
  return rows;
}

const clean = v => { const s = String(v ?? '').trim(); return /^(nan|無|-|－|n\/a|none)$/i.test(s) ? '' : s; };
const isUrl = v => /^https?:\/\//i.test(v);
function col(header, ...names) {
  const h = header.map(x => x.replace(/\s/g, ''));
  for (const n of names) { const i = h.findIndex(x => x.includes(n)); if (i >= 0) return i; }
  return -1;
}
// 卡片 id 由「銀行 id + 卡片名稱」產生，名稱不變 id 就不變
function hash(s) { let h = 5381; for (const c of s) h = ((h << 5) + h + c.codePointAt(0)) >>> 0; return h.toString(36); }

// gviz 讀取時，若同一個分頁名稱不存在，Google 會回傳第一個分頁；用表頭欄位檢查避免讀錯分頁
function parseCards(rows, bankId) {
  const header = rows[0];
  const iName = col(header, '卡片名稱', '卡名');
  if (iName < 0) throw new Error('找不到「卡片名稱」欄位：分頁名稱可能打錯（或分頁不存在），或表頭名稱不同');
  const iTier = col(header, '主力'), iFeat = col(header, '特色'), iType = col(header, '類型');
  const iKind = col(header, '銀行卡/聯名卡', '聯名卡', '卡別'), iOff = col(header, '官網'), iEv = col(header, '活動');
  const seen = new Set(), cards = [];
  for (const r of rows.slice(1)) {
    const name = clean(r[iName]); if (!name || seen.has(name)) continue;
    seen.add(name);
    const off = clean(r[iOff]), ev = clean(r[iEv]);
    cards.push({
      id: `${bankId}-${hash(name)}`, name,
      tier: clean(r[iTier]) || '—', feature: clean(r[iFeat]) || '—', type: clean(r[iType]) || '—', kind: clean(r[iKind]) || '—',
      official: isUrl(off) ? off : '', event: isUrl(ev) ? ev : '',
    });
  }
  return cards;
}
function parseAddons(rows) {
  const header = rows[0];
  const iTopic = col(header, '主題', '權益'), iUrl = col(header, '網址', '連結', 'URL', 'url');
  if (iTopic < 0 || iUrl < 0) throw new Error('找不到「主題」「網址」欄位：分頁名稱可能打錯（或分頁不存在），或表頭名稱不同');
  const map = {}, unknown = [];
  for (const r of rows.slice(1)) {
    const topic = clean(r[iTopic]).replace(/\s/g, ''); const url = clean(r[iUrl]);
    if (!topic) continue;
    const it = ITEMS.addon.find(x => x.label === topic) || ITEMS.addon.find(x => topic.includes(x.label) || x.label.includes(topic));
    if (!it) { unknown.push(topic); continue; }
    if (isUrl(url)) map[it.id] = url;
  }
  return { map, unknown };
}

// 讀取整份目錄：每家銀行的卡片與附加權益網址，並回報每個分頁的讀取狀態
export async function loadCatalog(config, fresh = false) {
  const id = sheetId(config.sheetUrl);
  if (!id) return { banks: [], error: '試算表網址格式不正確', syncedAt: new Date().toISOString() };
  const banks = await Promise.all(config.banks.map(async b => {
    const out = { id: b.id, name: b.name, short: b.short || b.name, cards: [], addons: {}, status: {} };
    try {
      out.cards = parseCards(await fetchTab(id, b.cardSheet, fresh), b.id);
      out.status.cards = { ok: true, text: `讀到 ${out.cards.length} 張卡` };
    } catch (e) { out.status.cards = { ok: false, text: e.message }; }
    if (b.addonSheet) {
      try {
        const { map, unknown } = parseAddons(await fetchTab(id, b.addonSheet, fresh));
        out.addons = map;
        out.status.addons = { ok: true, text: `讀到 ${Object.keys(map).length} 個主題網址` + (unknown.length ? `；無法對應：${unknown.join('、')}` : '') };
      } catch (e) { out.status.addons = { ok: false, text: e.message }; }
    } else out.status.addons = { ok: true, text: '未設定分頁' };
    return out;
  }));
  // 分頁名稱打錯時 Google 會回傳第一個分頁，用內容是否重複來提醒
  banks.forEach((b, i) => {
    const sig = b.cards.map(c => c.name).join('|');
    const dup = sig && banks.slice(0, i).find(x => x.cards.map(c => c.name).join('|') === sig);
    if (dup) { b.status.cards = { ok: false, text: `內容與「${dup.name}」完全相同，可能是分頁名稱打錯` }; b.cards = []; }
  });
  return { banks, syncedAt: new Date().toISOString() };
}
