# Exam 模組（互動式計分考試 — 原型）

把 VisualDS 的視覺化資產延伸成**過程式作答的計分考試**。完整方向與決策見
`docs`/memory 與 `~/.claude/plans/application-synchronous-squid.md`。

## 目前進度

- **階段 1（純邏輯層,已完成）** — `../shared/algorithms/`
  - `dijkstra.js` — 參考步進器,吐出逐輪標準軌跡(extract + relax),無 DOM。
    兩條釘死規則:平手取較小 id、鬆弛只在嚴格較小時更新;鄰居按 id 升冪。
  - `graph-gen.js` — 可重現(seed)的隨機連通帶權圖生成器。
  - `trace-grader.js` — 逐步比對學生答案 vs 標準軌跡,逐單元給分。
  - `_selftest.mjs` — Node 自測(`node _selftest.mjs`,全綠)。
- **階段 2（純前端可玩原型,本檔）** — `dijkstra.html`
  - 鎖步兩階段作答:① 點選該輪 extract 的節點 → ② 填每個未拜訪鄰居的新 dist。
  - 每步**允許重試**,分數逐次遞減(1 → 0.5 → 0.25 → 揭曉 0);**逐項部分分**。
  - 一步錯不連坐:揭曉正解後從正確狀態續作。計時 + 即時得分 + 完成後標最短路徑樹。
  - `?seed=123` 指定題目;完成後可「換一題 / 重做本題」。

## 如何開啟（重要）

本頁用原生 ES module(`import`),**必須經 HTTP 開啟,不能直接 file:// 點開**
(Chrome 會擋 file:// 的模組載入)。在專案根目錄起一個靜態伺服器即可:

```bash
python3 -m http.server 8000
# 然後瀏覽器開: http://localhost:8000/exam/dijkstra.html
```

(WSL 下用 Windows 瀏覽器開 `http://localhost:8000/...` 即可。)

## 尚未做（後續階段)

- 階段 3:`server/` 後端 —— 出題、標準答案只存伺服器端、伺服器端判分、存成績;
  同一份碼可部署雲端或打包成老師本機/區網單一執行檔。**正式計分前必須有這層**
  (目前原型的標準答案在前端,僅供體驗,尚不能防弊)。
- 階段 4:每生隨機 seed + 計時納入計分 + 身分對應;擴充 BST 刪除 / BFS 等章節
  (各只需補「步進器 + 步驟 UI」,共用同一套軌跡判分引擎)。
