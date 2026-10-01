// ============================================================
// 比較項目與預設設定（前端與 Worker 共用）
// 卡片與網址一律從 Google 試算表讀取，不寫在程式裡。
// ============================================================

// 預設設定（管理者後台可修改，修改後存在 Cloudflare KV）
export const DEFAULT_CONFIG = {
  sheetUrl: 'https://docs.google.com/spreadsheets/d/1DOp28OxxRUlKhwMvMj-Z-gzV4J-Bi-RLVA5Ni7DYHH8/edit?usp=sharing',
  // 每家銀行對應試算表中的兩個分頁：卡片清單、附加權益
  banks: [
    { id: 'fubon', name: '台北富邦銀行', short: '台北富邦', cardSheet: '富邦', addonSheet: '富邦-附加權益' },
    { id: 'cathay', name: '國泰世華銀行', short: '國泰世華', cardSheet: '國泰', addonSheet: '國泰-附加權益' },
    { id: 'ctbc', name: '中國信託銀行', short: '中國信託', cardSheet: '中信', addonSheet: '中信-附加權益' },
  ],
  texts: {
    title: '信用卡競品比較產生器',
    subtitle: '選銀行、選卡、選比較細項，拖曳調整表格後產生比較表與洞察。',
    tagline: '每次產生都直接讀取指定官方網址，不使用外部搜尋',
  },
};

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

