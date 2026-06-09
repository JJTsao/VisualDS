# Exam Server（正式計分後端）

**零依賴** Node 伺服器:只用 Node 內建模組,不需 `npm install`。把考試前端與
**伺服器端判分**合在一起 —— 標準答案與分數都在伺服器,前端拿不到完整答案、也無法竄改分數。

## 執行

```bash
node server/server.js
# 預設 http://0.0.0.0:8090(0.0.0.0 ⇒ 同區網的其他電腦可連)
```

啟動後終端會印出學生要開的網址。學生端只需**瀏覽器**,零安裝。

環境變數:
- `PORT`(預設 8090)、`HOST`(預設 `0.0.0.0`)
- `TEACHER_TOKEN`(預設 `teacher`)— 看成績用
- `SHEETS_WEBHOOK_URL`(選用)— Google Apps Script 網頁應用程式 URL,設了就把完成成績 POST 過去
- `SHEETS_TOKEN`(選用)— 與 Apps Script 端共享的密鑰

**雲端部署(免費常駐主機 + Google Sheet 存成績):見 [DEPLOY.md](DEPLOY.md)。**

## 教室區網部署(離線、不碰學校網路)

1. 老師筆電執行 `node server/server.js`,連上教室網路或自開熱點。
2. 查本機區網 IP(`ipconfig`/`ip addr`),把 `http://<IP>:8090/exam/play.html?chapter=bst-delete` 寫白板。
3. 學生用瀏覽器開該網址 → 輸入學號 → 作答。全程不經學校對外網路。
   - 注意:學校 WiFi 若開「用戶端隔離」會擋裝置互連,需事先測;老師自開熱點可繞過。
   - 老師筆電防火牆需放行該埠一次。

雲端部署:同一份碼直接放任何能跑 Node 的主機即可(學生連公開網址)。

## 端點

- `POST /api/start` `{ chapter, studentId, seed? }` → 建立 session,回傳題目(**不含答案**)+ 步驟外殼。
- `POST /api/step`  `{ sessionId, stepIndex, answer }` → 伺服器判該步、回對錯;**提交後才揭曉該步正解**。
  重試分數遞減(1 → 0.5 → 0.25 → 揭曉 0),一步錯不連坐。分數累計在伺服器。
- `GET  /api/results?token=<TEACHER_TOKEN>` → 老師看成績(已完成 + 進行中)。完成成績寫入 `server/data/results.json`。

## 防弊模型(首版)

- **分數在伺服器,不可竄改**;**答案逐步揭曉**(學生提交後才給該步答案,且該步分數已定)。
- 每生**隨機題目** + 計時。標準演算法(Dijkstra/BST)本就是學生該會的,目的不是藏答案,而是
  「不可偽造分數 + 互動過程難以複製貼上給 AI 速成」。
- **身分**:首版用學號欄位(現場監考 + 各自電腦,冒名風險低);需要更嚴可改老師發存取碼。

## 章節(可擴充)

`server/chapters/<id>.js` 匯出 `generate(seed) → { instance(呈現用,無答案), steps(含答案,留伺服器) }`,
重用 `shared/algorithms/`。目前:`bst-delete`、`dijkstra`。前端在 `exam/play.html?chapter=<id>`,
渲染器 `exam/render-tree.js` / `exam/render-graph.js`。學生網址:
`.../exam/play.html?chapter=bst-delete` 或 `?chapter=dijkstra`。

## 尚未做

- 老師成績**看板頁**(目前是 JSON 端點 + Google Sheet)、單一執行檔打包(免裝 node)、
  存取碼身分、題目時間限制強制、更多章節(BFS 等)。
