// ============================================================
// 卡片與比較項目主檔（前端與 Worker 共用）
// 新增卡片：在對應銀行的 cards 陣列加一筆即可。
// 網址可在網站的「管理者後台」修改，修改值會覆蓋這裡的預設值。
// ============================================================

export const BANKS = [
  { id: 'fubon', name: '台北富邦銀行', short: '台北富邦', cards: [
    { id: 'fb-j', name: 'Ｊ卡', tier: '主力卡', feature: '旅遊', type: '免切換', kind: '銀行卡', official: 'https://www.fubon.com/banking/personal/credit_card/all_card/omiyage/omiyage.htm', event: '' },
    { id: 'fb-imperial', name: '尊御卡', tier: '主力卡', feature: '財管', type: '免切換', kind: '銀行卡', official: 'https://www.fubon.com/banking/personal/credit_card/all_card/imperial/imperial.htm', event: '' },
    { id: 'fb-digital', name: '數位生活卡', tier: '主力卡', feature: '數位生活', type: '免切換', kind: '銀行卡', official: '', event: '' },
    { id: 'fb-costco', name: 'Costco卡', tier: '主力卡', feature: '量販', type: '免切換', kind: '聯名卡', official: '', event: '' },
    { id: 'fb-momo', name: 'Momo卡', tier: '主力卡', feature: '電商', type: '免切換', kind: '聯名卡', official: '', event: '' },
    { id: 'fb-op', name: 'Openpossible卡', tier: '主力卡', feature: '電信', type: '免切換', kind: '聯名卡', official: '', event: '' },
  ], addons: {
    home: 'https://www.fubon.com/banking/personal/credit_card/benefits/benefits.htm',
    ride: 'https://www.fubon.com/banking/personal/credit_card/airport_ride/airport_ride.htm',
    lounge: 'https://www.fubon.com/banking/personal/credit_card/airport_VIP/airport_VIP.htm',
    apark: 'https://www.fubon.com/banking/personal/credit_card/airport_parking/airport_parking.htm',
    cpark: 'https://www.fubon.com/banking/personal/credit_card/local_parking/local_parking.htm',
    road: 'https://www.fubon.com/banking/personal/credit_card/roadside_help/roadside_help.htm',
    golf: 'https://www.fubon.com/banking/personal/credit_card/golf/golf.htm',
    rail: 'https://www.fubon.com/banking/personal/credit_card/golf/golf.htm',
    tins: 'https://www.fubon.com/banking/personal/credit_card/trip_insurance/trip_insurance.htm',
    tinc: 'https://www.fubon.com/banking/personal/credit_card/trip_insurance/trip_insurance.htm',
  } },
  { id: 'cathay', name: '國泰世華銀行', short: '國泰世華', cards: [
    { id: 'ct-cube', name: 'Cube卡', tier: '主力卡', feature: '萬用卡', type: '免切換', kind: '銀行卡', official: 'https://www.cathay-cube.com.tw/cathaybk/personal/product/credit-card/cards/cube', event: '' },
    { id: 'ct-world', name: '國泰世界卡', tier: '主力卡', feature: '財管', type: '免切換', kind: '銀行卡', official: 'https://www.cathay-cube.com.tw/cathaybk/personal/product/credit-card/cards/world', event: '' },
  ], addons: {} },
  { id: 'ctbc', name: '中國信託銀行', short: '中國信託', cards: [
    { id: 'cb-uniopen', name: 'uniopen聯名卡', tier: '主力卡', feature: '旅遊', type: '免切換', kind: '聯名卡', official: 'https://www.ctbcbank.com/twrbo/zh_tw/cc_index/cc_product/cc_introduction_index/C_uniopen.html', event: 'https://mkt.ctbcbank.com/long/creditcard/N2025052600033_01/index.html' },
    { id: 'cb-top', name: '財管鼎鑽卡', tier: '主力卡', feature: '財管', type: '免切換', kind: '銀行卡', official: 'https://www.ctbcbank.com/twrbo/zh_tw/cc_index/cc_product/cc_introduction_index/B_Top_F.html', event: 'https://mkt.ctbcbank.com/long/creditcard/WMmember/index.html' },
  ], addons: {} },
];

// local: true 表示直接使用主檔資料，不需呼叫 Gemini
// ask：交給 Gemini 擷取時的欄位說明
export const ITEMS = {
  product: [
    { id: 'feature', label: '產品特色', hint: '旅遊、財管、萬用卡、量販、電商、電信…', local: true },
    { id: 'kind', label: '銀行卡/聯名卡', local: true },
    { id: 'tier', label: '主力/非主力', local: true },
    { id: 'fee', label: '年費機制', hint: '正附卡年費、首年優惠、免年費條件', ask: '正卡與附卡年費金額、首年優惠、次年免年費條件' },
    { id: 'elig', label: '辦卡資格', hint: '年收入門檻、財管會員等級', ask: '申辦年齡、年收入或財力門檻、是否需財管會員資格與等級' },
    { id: 'reward', label: '基本回饋權益', hint: '國內外基本回饋、指定通路', ask: '國內一般消費與國外一般消費的回饋率及達成條件、主要指定通路加碼' },
    { id: 'mech', label: '權益類型與機制', hint: '免切換/權益切換、回饋上限', ask: '回饋形式（現金/點數/哩程）、是否需要切換權益方案、回饋上限' },
    { id: 'gift', label: '首刷禮與新戶活動', hint: '依活動網址解析', ask: '目前新戶首刷禮的活動期間、達成門檻與贈品' },
  ],
  addon: [
    { id: 'home', label: '附加權益首頁', ask: '附加權益總覽中與此卡相關的主要權益' },
    { id: 'ride', label: '機場接送', ask: '機場接送的適用卡別、刷卡門檻（機票/團費）、免費次數或優惠價' },
    { id: 'lounge', label: '機場貴賓室', ask: '機場貴賓室的適用卡別、使用門檻與免費次數' },
    { id: 'apark', label: '機場外圍停車', ask: '機場外圍停車的適用卡別、刷卡門檻與免費天數' },
    { id: 'cpark', label: '市區停車', ask: '市區停車的適用卡別、消費門檻與免費時數' },
    { id: 'road', label: '道路救援', ask: '道路救援的適用卡別、登錄條件與免費拖吊里程' },
    { id: 'golf', label: '高爾夫球', ask: '高爾夫球優惠的適用卡別、門檻與優惠內容' },
    { id: 'rail', label: '高鐵購票', ask: '高鐵購票優惠的適用卡別與優惠內容' },
    { id: 'tins', label: '旅遊平安險', ask: '旅遊平安險的適用卡別、刷卡條件與保額' },
    { id: 'tinc', label: '旅遊不便險', ask: '旅遊不便險的適用卡別、刷卡條件與主要保障項目' },
  ],
};

export const GROUP_LABEL = { product: '產品權益', addon: '附加權益' };

// 依主檔與管理者覆蓋值取得實際網址
export function defaultUrl(key) {
  const [kind, a, b] = key.split(':');
  if (kind === 'card') {
    for (const bank of BANKS) { const c = bank.cards.find(x => x.id === a); if (c) return c[b] || ''; }
    return '';
  }
  if (kind === 'addon') return BANKS.find(x => x.id === a)?.addons[b] || '';
  return '';
}
export function resolveUrl(key, overrides) {
  return overrides && Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : defaultUrl(key);
}
export function allUrlKeys() {
  const keys = [];
  for (const b of BANKS) {
    for (const c of b.cards) keys.push(`card:${c.id}:official`, `card:${c.id}:event`);
    for (const it of ITEMS.addon) keys.push(`addon:${b.id}:${it.id}`);
  }
  return keys;
}
