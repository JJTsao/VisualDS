# Exam 模組（互動式計分考試 — 原型）

把 VisualDS 的視覺化資產延伸成**過程式作答的計分考試**。完整方向與決策見
`docs`/memory 與 `~/.claude/plans/application-synchronous-squid.md`。

## 目前進度

### 共用邏輯層 — `../shared/algorithms/`（無 DOM,ESM,瀏覽器/Node 共用）

- `trace-engine.js` — **通用**軌跡引擎:每章節把演算法化為一串「原子步驟」
  (`{key,phase,kind,prompt,answer,options?,focusNode?}`),引擎統一判分
  (`gradeStep`/`scoreSteps`/`groupByPhase`)。新章節只需提供「步進器 + 各 kind 的 UI」。
- Dijkstra:`dijkstra.js`(參考步進器,釘死規則:平手取小 id、嚴格才鬆弛、鄰居按 id 升冪)、
  `graph-gen.js`(可重現隨機連通帶權圖)、`trace-grader.js`(Dijkstra 專用逐步比對)。
- BST 刪除:`bst.js`(buildBST + layoutTree + `bstDeleteTrace` 吐原子步驟)、
  `bst-gen.js`(可重現隨機 BST + 優先選兩子情況的刪除目標)。
- 自測:`node _selftest.mjs`(Dijkstra)、`node _bst_selftest.mjs`(BST + 通用引擎),皆全綠。

### 題型前端原型 — 純前端可玩

- `dijkstra.html` — 鎖步兩階段:① 點 extract 節點 → ② 填鄰居新 dist。
- `bst-delete.html` — 逐步:① 搜尋(往左/右/找到)→ ② 分類(葉/一子/兩子)→
  ③ 解決(依 case:點取代節點 / 點中序後繼 + 填交換值 + 後繼移除分類)。**驗證了
  通用引擎能套到結構與 Dijkstra 完全不同的演算法**(分支控制流 + 多種步驟型別)。
- 共同點:每步**允許重試**、分數遞減(1→0.5→0.25→揭曉0)、一步錯不連坐(揭曉後續作)、
  計時 + 即時得分;`?seed=123` 指定題目,完成後可「換一題 / 重做本題」。

## 設計註記 — 圖渲染：權重標籤放置（碰撞避讓）

圓形佈局下,所有弦的中點都集中在畫布中央交會,因此**不能把邊權重放在中點**——
近直徑的兩條邊標籤會重疊,且標籤常落在別條線的交點上,讓人讀不出該權重屬於哪條邊。

`placeWeightLabels()` 的做法:每條邊準備一組候選錨點(沿邊 0.3/0.7 偏向**端點**、
垂直偏移 13/20/27px、左右兩側),挑第一個**同時**滿足「不與已放置標籤重疊」且
「中心距其他任何邊線 >11px」的位置;偏好靠端點以離開中央交會區。每個標籤再加一個
以 `getBBox` 量身的**不透明圓角底框**並畫在所有線之上。
→ 換句話說:標籤落在邊「自己那一段」、不壓交點、彼此不疊。新增題型沿用此放置器即可。

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
