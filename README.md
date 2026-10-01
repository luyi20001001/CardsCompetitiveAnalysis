# 信用卡競品比較產生器：部署說明

## 架構

```
使用者瀏覽器（public/index.html）
        │  按下「確定產生」
        ▼
Cloudflare Worker（worker/）
        │  直接讀取後台登錄的官方網址（伺服器端，沒有瀏覽器的跨站限制）
        ▼
內建爬蟲（worker/crawler.js）── 依關鍵字規則挑出年費、資格、回饋等句子 → 填入比較表
```

- **不需要任何 AI 金鑰或外部服務串接**，只要一個免費的 Cloudflare 帳號。
- 每次按「確定產生」都會讀取官網；同一個網址 60 分鐘內重複查詢會用快取，避免對銀行網站造成負擔（`CACHE_MINUTES` 可調）。
- 只讀後台登錄的網址，不使用搜尋引擎。頁面沒寫的項目顯示「N/A（官方網址未記載）」。
- 表格每格都附來源連結，3 大洞察依擷取到的數字（回饋率、年費、年收入門檻等）自動彙整。
- （選用）日後設定 `GEMINI_API_KEY`，會自動改用 Gemini 擷取，摘要品質更好；不設定就一直使用內建爬蟲。

## 內建爬蟲怎麼運作

1. 讀取網頁，去掉選單、頁尾、程式碼，只留內文句子。
2. 每個比較項目有一組關鍵字規則（在 `worker/crawler.js` 的 `RULES`）。例如「年費機制」必須包含「年費」，含「免年費、首年、正卡、元」會加分，含「本行保留…權利」這類條款會扣分。
3. 每格取分數最高的 1～2 句原文放進表格。

因為放的是官網原句，不會有 AI 編造的問題；缺點是句子較長、偶爾會挑到不夠精準的句子。發現某個項目常挑錯時，調整該項目的 `RULES` 關鍵字即可。

## 費用

| 項目 | 方案 | 說明 |
| --- | --- | --- |
| Cloudflare Workers | 免費 | 每日 10 萬次請求 |
| Cloudflare KV | 免費 | 每日 10 萬次讀取、1,000 次寫入 |
| Gemini API（選用） | 免費或付費 | 不設定就完全不會用到 |

## 部署步驟（約 15 分鐘）

### 1. 準備

- 安裝 [Node.js](https://nodejs.org/) 18 以上版本。
- 註冊 [Cloudflare](https://dash.cloudflare.com/sign-up) 帳號（免費）。

### 2. 安裝

解壓縮後，在資料夾內開啟終端機：

```bash
npm install
npx wrangler login          # 會開瀏覽器請你登入 Cloudflare
```

### 3. 建立 KV 儲存空間

```bash
npx wrangler kv namespace create STORE
```

指令會回傳一段 `id = "xxxxxxxx"`，把這個 id 貼到 `wrangler.toml` 中 `請貼上你的 KV namespace id` 的位置。

### 4. 設定管理者密碼

```bash
npx wrangler secret put ADMIN_PASSWORD    # 自訂管理者密碼（建議 12 字以上）
npx wrangler secret put SESSION_SECRET    # 任意長亂數字串，用來簽發登入憑證
```

`SESSION_SECRET` 可用這個指令產生：`openssl rand -hex 32`

（選用）要改用 Gemini 擷取時，再執行：`npx wrangler secret put GEMINI_API_KEY`

### 5. 部署

```bash
npm run deploy
```

完成後會顯示網址，例如 `https://card-compare.你的帳號.workers.dev`，打開就能用。

## 日常使用

- **一般使用者**：選銀行與卡片、勾選比較項目，按「確定產生」，通常數秒內完成。
- **管理者**：點右上角「管理者登入」輸入密碼，即可修改網址、查看待補清單。登入 8 小時後失效。
- **強制重抓**：管理者登入後，產生按鈕旁會出現「忽略快取，重新抓取」，適合銀行剛更新活動時使用。

## 常見調整

| 想做的事 | 修改位置 |
| --- | --- |
| 新增或刪除卡片、修改卡片屬性 | `public/data.js` 的 `BANKS`，改完重新執行 `npm run deploy` |
| 某個項目常挑錯句子 | `worker/crawler.js` 的 `RULES` |
| 新增比較項目 | `public/data.js` 的 `ITEMS`，並在 `RULES` 加一組同 id 的規則 |
| 調整快取時間 | `wrangler.toml` 的 `CACHE_MINUTES` |
| 修改網址 | 直接在網站的管理者後台修改，不用重新部署 |

## 本機測試（選用）

```bash
cp .dev.vars.example .dev.vars   # 填入金鑰與密碼
npm run dev                      # 開啟 http://localhost:8787
```

## 已知限制

- 有些銀行頁面要執行 JavaScript 才會顯示內容。爬蟲會嘗試讀取頁面內嵌的資料，仍讀不到時，該卡會顯示「抓取失敗」，後台待補清單也會列出。可改填內容較完整的網址（例如卡片的權益說明頁）。
- 少數銀行網站會擋雲端伺服器的連線，同樣會顯示抓取失敗。
- PDF 權益手冊目前不支援，請填網頁網址。
- 表格放的是官網原句，重要數字仍建議點來源連結核對。

## 疑難排解

| 狀況 | 處理方式 |
| --- | --- |
| 某張卡顯示「抓取失敗」 | 在瀏覽器直接打開該網址確認；若頁面要點擊才顯示內容，換成內容直接可見的網址 |
| 表格內容都是 N/A | 該頁面可能沒有這些資訊，或需調整 `RULES` 關鍵字 |
| 管理者登入一直失敗 | 確認 `ADMIN_PASSWORD` 與 `SESSION_SECRET` 都已設定 |
| 下載 Excel/PDF 按鈕不能按 | 瀏覽器無法連到 cdnjs.cloudflare.com，檢查公司網路是否封鎖 |
| 出現 Error 1102 | 免費方案單次運算時間超限，減少一次比較的卡片數，或把 `CACHE_MINUTES` 調高 |
