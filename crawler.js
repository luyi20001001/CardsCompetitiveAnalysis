// ============================================================
// 內建爬蟲：不需要任何 AI 金鑰
// 1. 由 Worker 直接讀取官方網址（伺服器端，沒有瀏覽器的跨站限制）
// 2. 把網頁轉成純文字句子
// 3. 依各比較項目的關鍵字規則，挑出最相關的 1～2 句放進表格
// 規則可在下方 RULES 調整，不需要改其他程式。
// ============================================================

// must：句子至少要包含其中一個詞才會被考慮
// all：句子必須同時包含這些詞（選填）
// none：包含這些詞的句子不採用（選填）
// bonus：每多包含一個詞就加分，用來挑出最有資訊量的句子
export const RULES = {
  fee:    { must: ['年費'], bonus: ['免年費', '首年', '次年', '正卡', '附卡', '元', '減免'] },
  elig:   { must: ['年收入', '年滿', '財力', '申請條件', '申辦資格', '理財會員', '資產'], bonus: ['萬', '歲', '正卡', '等級', '以上'] },
  reward: { must: ['回饋'], all: ['%'], bonus: ['國內', '國外', '海外', '一般消費', '無上限', '最高', '基本'] },
  mech:   { must: ['切換', '回饋上限', '上限', '現金回饋', '點數', '哩程', 'LINE POINTS', '刷卡金'], bonus: ['上限', '切換', '每月', '每期', '無上限', '回饋方式'] },
  gift:   { must: ['首刷', '新戶', '新卡友', '首刷禮'], bonus: ['贈', '活動期間', '禮', '核卡', '內', '滿'] },
  home:   { must: ['權益', '禮遇'], bonus: ['機場', '停車', '保險', '道路救援', '貴賓室'] },
  ride:   { must: ['機場接送', '接機', '送機'], bonus: ['免費', '次', '機票', '團費', '%', '元', '預約'] },
  lounge: { must: ['貴賓室'], bonus: ['免費', '次', '機票', '團費', '登機證', '同行'] },
  apark:  { must: ['機場'], all: ['停車'], bonus: ['免費', '天', '機票', '團費', '次'] },
  cpark:  { must: ['停車'], none: ['機場'], bonus: ['小時', '免費', '市區', '消費', '滿', '次'] },
  road:   { must: ['道路救援', '拖吊'], bonus: ['公里', '免費', '次', '登錄', '車號'] },
  golf:   { must: ['高爾夫', '果嶺'], bonus: ['免費', '優惠', '次', '球場', '擊球'] },
  rail:   { must: ['高鐵'], bonus: ['優惠', '折', '購票', '免費'] },
  tins:   { must: ['旅遊平安', '旅行平安', '旅平險'], bonus: ['萬', '保額', '機票', '團費', '%', '死亡'] },
  tinc:   { must: ['不便險', '旅遊不便', '旅行不便'], bonus: ['延誤', '行李', '小時', '元', '班機'] },
};

// 法律條款類句子扣分，避免挑到「本行保留…權利」這種內容
const NEG = ['保留', '權利', '不得', '恕不', '詳見', '請參閱', '依本行', '以本行', '未盡事宜', '個人資料', 'Cookies'];

/* ---------------- 讀取網頁 ---------------- */
export async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-TW,zh;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!/html|text/i.test(type)) throw new Error('不是網頁格式（' + type.split(';')[0] + '）');
  const lines = typeof HTMLRewriter !== 'undefined' ? await textByRewriter(res) : textByRegex(await res.text());
  if (lines.join('').length < 200) throw new Error('頁面內容過少，可能需要 JavaScript 才能顯示');
  return lines;
}

// Cloudflare 原生 HTML 解析（速度快、省 CPU）
async function textByRewriter(res) {
  let skip = 0;
  const parts = [], jsonParts = [];
  const rewriter = new HTMLRewriter()
    .on('script,style,noscript,svg,nav,header,footer,template,iframe,select', {
      element(el) { skip++; el.onEndTag(() => { skip--; }); },
    })
    .on('script#__NEXT_DATA__,script[type="application/json"],script[type="application/ld+json"]', {
      text(t) { jsonParts.push(t.text); },
    })
    .on('p,li,tr,br,h1,h2,h3,h4,h5,h6,div,td,th,dt,dd,section,article,table,ul,ol', {
      element() { parts.push('\n'); },
    })
    .on('*', { text(t) { if (!skip) parts.push(t.text); } });
  await rewriter.transform(res).arrayBuffer();
  return toLines(parts.join(''), jsonParts.join(''));
}

// 備用：一般正規表示式解析（本機測試用）
function textByRegex(html) {
  const json = [...html.matchAll(/<script[^>]*(?:__NEXT_DATA__|application\/(?:ld\+)?json)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('');
  const body = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|template|iframe|select)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/li|\/tr|\/h\d|\/div|\/td|\/th|\/dt|\/dd|\/section|\/article|\/table)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return toLines(body, json);
}

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function toLines(text, jsonText) {
  let all = decode(text);
  // 以 JavaScript 產生內容的網站（如 Next.js），文字常藏在 JSON 裡
  if (jsonText) {
    const strs = [...jsonText.matchAll(/"((?:[^"\\]|\\.){6,}?)"/g)]
      .map(m => { try { return JSON.parse('"' + m[1] + '"'); } catch { return ''; } })
      .filter(s => /[\u4e00-\u9fff]/.test(s))
      .map(s => s.replace(/<[^>]+>/g, '\n'));
    all += '\n' + strs.join('\n');
  }
  // 全形英數字與 ％ 轉半形，保留中文標點
  all = all.replace(/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF05]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ');
  const seen = new Set(), out = [];
  for (let line of all.split(/\n+/)) {
    line = line.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const pieces = line.length > 160 ? line.split(/(?<=[。；;])/) : [line];
    for (let p of pieces) {
      p = p.trim();
      if (p.length < 6 || p.length > 400 || seen.has(p)) continue;
      if (!/[\u4e00-\u9fff]/.test(p)) continue;
      seen.add(p); out.push(p);
    }
  }
  return out;
}

/* ---------------- 挑選句子 ---------------- */
export function pick(lines, itemId, cardName) {
  const rule = RULES[itemId];
  if (!rule || !lines?.length) return null;
  const core = cardName.normalize('NFKC').replace(/聯名卡|卡$/g, '').trim();
  const cands = [];
  lines.forEach((l, i) => {
    if (!rule.must.some(k => l.includes(k))) return;
    if (rule.all && !rule.all.every(k => l.includes(k))) return;
    if (rule.none && rule.none.some(k => l.includes(k))) return;
    let sc = 0;
    rule.bonus.forEach(k => { if (l.includes(k)) sc += 1; });
    if (/\d/.test(l)) sc += 2;
    if (core && core.length >= 1 && l.includes(core)) sc += 2;
    NEG.forEach(k => { if (l.includes(k)) sc -= 2; });
    if (l.length > 160) sc -= 1;
    sc -= i / lines.length; // 同分時，頁面前段（通常是重點摘要）優先
    cands.push({ l, sc });
  });
  cands.sort((a, b) => b.sc - a.sc);
  const chosen = [];
  for (const c of cands) {
    if (chosen.length >= 2) break;
    if (chosen.some(x => x.includes(c.l) || c.l.includes(x))) continue;
    chosen.push(c.l);
  }
  if (!chosen.length) return null;
  return chosen.map(s => (s.length > 110 ? s.slice(0, 108) + '…' : s)).join('；');
}

/* ---------------- 規則式 3 大洞察 ---------------- */
export function ruleInsights(rows) {
  // rows: [{ name, feature, kind, type, cells: { itemId: value|null } }]
  const pct = s => { const m = [...(s || '').matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(x => +x[1]); return m.length ? Math.max(...m) : null; };
  const core = [], threshold = [], addon = [];

  const rw = rows.map(r => ({ n: r.name, p: pct(r.cells.reward) })).filter(x => x.p != null).sort((a, b) => b.p - a.p);
  if (rw.length) {
    core.push(`官網標示的最高回饋率：${rw.map(x => `${x.n} ${x.p}%`).join('、')}。`);
    if (rw.length > 1 && rw[0].p > rw[rw.length - 1].p) core.push(`${rw[0].n} 在最高回饋率領先 ${+(rw[0].p - rw[rw.length - 1].p).toFixed(1)} 個百分點，但需核對是否附帶登錄或上限條件。`);
  } else core.push('所選卡片的官網未擷取到明確回饋率，請點來源連結核對。');
  const types = [...new Set(rows.map(r => r.type))];
  core.push(types.length === 1 ? `所選卡片的主檔類型皆為「${types[0]}」，機制彈性相近。` : `主檔類型包含 ${types.join('、')}，可比較切換帶來的通路彈性。`);
  const capped = rows.filter(r => /(?<!無)上限/.test(r.cells.mech || '') || /(?<!無)上限/.test(r.cells.reward || '')).map(r => r.name);
  if (capped.length) core.push(`官網提到回饋上限的卡片：${capped.join('、')}。`);

  const fees = rows.map(r => { const m = (r.cells.fee || '').match(/正卡\s*([\d,]+)\s*元/) || (r.cells.fee || '').match(/([\d,]{3,})\s*元/); return { n: r.name, f: m ? +m[1].replace(/,/g, '') : null, free1: /首年免年費/.test(r.cells.fee || '') }; });
  const withFee = fees.filter(x => x.f != null).sort((a, b) => a.f - b.f);
  if (withFee.length) threshold.push(`正卡年費：${withFee.map(x => `${x.n} ${x.f.toLocaleString()} 元`).join('、')}。`);
  const f1 = fees.filter(x => x.free1).map(x => x.n);
  if (f1.length) threshold.push(`首年免年費：${f1.join('、')}。`);
  const inc = rows.map(r => { const m = (r.cells.elig || '').match(/年收入[^\d]{0,6}(\d+)\s*萬/); return m ? `${r.name} ${m[1]} 萬` : null; }).filter(Boolean);
  if (inc.length) threshold.push(`年收入門檻：${inc.join('、')}。`);
  const wm = rows.filter(r => r.feature === '財管' || /理財會員|資產/.test(r.cells.elig || '')).map(r => r.name);
  if (wm.length) threshold.push(`需留意財管會員資格的卡片：${wm.join('、')}。`);
  if (!threshold.length) threshold.push('官網未擷取到年費與資格的明確數字，請點來源連結核對。');

  const addonIds = Object.keys(rows[0]?.cells || {}).filter(k => !['fee', 'elig', 'reward', 'mech', 'gift'].includes(k));
  if (!addonIds.length) addon.push('本次未勾選附加權益項目。');
  else {
    rows.forEach(r => {
      const ok = addonIds.filter(k => r.cells[k]).length;
      addon.push(`${r.name}：${ok}/${addonIds.length} 項附加權益在官網有明確說明。`);
    });
  }
  return { core: core.slice(0, 4), threshold: threshold.slice(0, 4), addon: addon.slice(0, 4) };
}
