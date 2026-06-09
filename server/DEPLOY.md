# 部署到雲端（免費常駐主機）+ Google Sheet 存成績

考試當天的主線:把考試站架在**公開網址**,學生用瀏覽器直接開,不碰學校內網設定。
成績寫進你的 **Google Sheet**(因為免費雲端磁碟多半是暫時的,重啟會清空 `results.json`)。

整體只有兩步:**A. 設好 Google Sheet 收成績** → **B. 部署到 Render**。

---

## A. Google Sheet 成績收集（Apps Script,免 API 金鑰)

1. 開一個新的 Google 試算表(這就是你的成績簿)。
2. 上方選單 **擴充功能 → Apps Script**。
3. 把編輯器內容整段換成下面這段,存檔:

```javascript
// 綁定在成績試算表上的 Apps Script。發布為「網頁應用程式」。
const SHEET_NAME = 'Results';
const TOKEN = '';   // 若伺服器設了 SHEETS_TOKEN,這裡填一樣的字串;留空 = 不檢查

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (TOKEN && d.token !== TOKEN) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'bad token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sh.getLastRow() === 0) {
      sh.appendRow(['finishedAt', 'studentId', 'chapter', 'percent', 'earned', 'total', 'durationSec', 'seed']);
    }
    sh.appendRow([d.finishedAt, d.studentId, d.chapter, d.percent, d.earned, d.total, d.durationSec, d.seed]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

4. 右上 **部署 → 新增部署作業 → 類型選「網頁應用程式」**。
   - 「執行身分」:**我**;「誰可以存取」:**任何人**。
   - 部署 → 授權(第一次會要你同意權限)→ 複製那串 **網頁應用程式 URL**(結尾是 `/exec`)。
5. 這串 `/exec` URL 就是下一步要填的 `SHEETS_WEBHOOK_URL`。

> 想加一層保護:把上面 `TOKEN` 設成一個只有你知道的字串,並在 Render 設一樣的 `SHEETS_TOKEN`。

---

## B. 部署到 Render（免費,免信用卡)

1. 把這個 repo 推到 GitHub(若還沒):

```bash
git push -u origin feat/exam-dijkstra      # 或先合併到 main 再推
```

2. 到 https://render.com → 用 GitHub 登入 → **New → Blueprint**,選這個 repo。
   它會讀根目錄的 `render.yaml` 自動建立一個免費 Web Service。
   (或 **New → Web Service**,Build:`npm install`,Start:`node server/server.js`。)
3. 在該服務的 **Environment** 設三個變數:
   - `TEACHER_TOKEN` = 你自訂的看成績密碼
   - `SHEETS_WEBHOOK_URL` = 上面 A 步驟的 `/exec` URL
   - `SHEETS_TOKEN` = 與 Apps Script `TOKEN` 相同(沒設就留空)
4. 部署完成後得到公開網址,例如 `https://visualds-exam.onrender.com`。

考試用網址:
- 學生:`https://<你的網址>/exam/play.html?chapter=bst-delete`(或 `?chapter=dijkstra`)
- 老師看成績:你的 Google Sheet(即時)+ `https://<你的網址>/api/results?token=<TEACHER_TOKEN>`

> ⚠️ **免費方案會在閒置 ~15 分鐘後休眠**,第一個連線要冷啟動約 30–60 秒,之後考試期間保持喚醒。
> **考前先自己開一次網址把它叫醒**即可。

---

## 替代平台（若不想用 Render)

- **Koyeb**:免費 1 個 Web Service、**不休眠**、免信用卡;用本 repo 的 `Dockerfile` 部署。
- **Fly.io**:免費額度,需綁卡;`fly launch` 走 `Dockerfile`。
- **自己的 VPS**:`git clone` 後 `node server/server.js`(可配 `pm2`/`systemd` 常駐)。

任何平台都記得設上面三個環境變數。

---

## 注意事項（正式計分)

- **成績持久化**:已完成的成績即時寫進 Google Sheet,不受雲端磁碟清空影響。`results.json` 僅本機備份。
- **單一實例**:session 存在記憶體 → 請只跑**一個**實例(別開自動擴充)。若考試中途伺服器重啟,
  **已完成**的成績已在 Sheet,但**作答到一半**的學生 session 會遺失(需重做)。免費常駐主機通常不會中途重啟。
- **冷啟動**:見上方,考前先喚醒。
