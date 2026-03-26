# Technical Decisions

記錄重要的架構與設計決策，以及當時的原因。

---

## Amber Phosphor Terminal 主題

**決策**：捨棄 Tailwind + slate/indigo 配色，改用純 CSS + JetBrains Mono + 琥珀色磷光顯示器主題。

**Why**：CLAUDE.md 的 Frontend Design Principle 要求避免 AI slop 美學。Amber phosphor 主題脈絡上合理（Unix 終端機是 C 語言誕生地），視覺上完全不同於常見 AI 輸出。

**How to apply**：未來新增頁面時，延續 `--amber` / `--bg` 等 CSS variables，不引入新顏色體系。

---

## 不使用 Tailwind

**決策**：完全移除 Tailwind CDN，改用純 CSS custom properties。

**Why**：Tailwind utility class 會鎖定顏色選擇，難以實現精確主題控制；CDN 引入在離線環境不可靠。

**How to apply**：所有新頁面只引入 `css/style.css`，佈局用 CSS Grid/Flex，顏色全部用 CSS variables。

---

## Inline Script 必須用 IIFE

**決策**：`*-vis.html` 的 inline script 必須包在 IIFE 中。

**Why**：inline script 與外部 `.js` 都在全域作用域執行。若兩者都宣告 `const codeInput`，瀏覽器拋出 SyntaxError，導致整個 JS 停止執行。（曾發生：Step 按鈕完全無反應。）

**How to apply**：所有 `*-vis.html` 的 inline script 一律用 IIFE；跨 script 通訊只透過 `window.*` 暴露介面（e.g. `window.setActiveLine`）。

---

## 多陣列架構（state.arrays map）

**決策**：JS state 從單一 `arrayName/arraySize/values` 改為 `arrays: { name → { size, values[], baseAddr } }` map。

**Why**：COPY 操作需同時顯示 `src` 和 `dst` 兩個陣列；INSERT/DELETE 要在同一陣列內看到元素搬移。

**How to apply**：Cell ID 慣例為 `cell-${arrayName}-${index}`；error-shake 作用於 `.array-cells`（per-array），不作用於 `#array-container`（全域）。

---

## 上一步功能：快照法 + 共用 history.js

**決策**：以「執行前快照」實作 undo，共用工具抽出為 `js/history.js`（`StepHistory` class）。

**Why**：
- 解譯器是純函式式的（無非同步 I/O），state 是純 JSON 物件，`JSON.parse(JSON.stringify(...))` 即可完整深拷貝。
- Console 以 `innerHTML` 字串快照，還原時直接覆寫，不需要逐筆 log 追蹤。
- 抽成獨立 module 讓未來單元直接複用，不重複設計。

**快照欄位規格（以 Array 單元為例）**：
```js
{
  currentLine, arrays, arrayOrder, addrCounter,  // interpreter state
  consoleHTML,   // console DOM 的 innerHTML 字串
  cppEquivText,  // null = 隱藏，string = 顯示內容
}
```

**How to apply（新單元開發規範）**：
1. 在 `*-vis.html` 引入 `<script src="js/history.js"></script>`（放在 unit script 之前）
2. 在 unit JS 頂層建立 `const history = new StepHistory()`
3. `stepOneLine()` 第一行：`history.push({...state, consoleHTML: ...})`；同時 `btnStepBack.disabled = false`
4. `stepBack()`：`history.pop()` → 還原 state → 呼叫 `renderAll()` → 同步 UI indicators
5. `reset()`：`history.clear()`；`btnStepBack.disabled = true`
6. State 設計原則：**所有欄位必須是 JSON-serialisable**（不放 DOM ref、不放 Function）

---

## 響應式設計策略：clamp() + 900px 單欄切換

**決策**：不用 viewport-relative 單位做全局縮放，而是對各元件個別使用 `clamp(min, preferred, max)` 實現流體縮放。

**Why**：全局 `vw`/`vh` 縮放會讓所有元素等比縮小，在大型桌面螢幕上反而太小。`clamp()` 讓每個元件有自己的縮放範圍，在桌面最大尺寸維持設計上限。

**How to apply**：
- 左欄寬度：`clamp(300px, 36%, 460px)`（900–1278px 間線性縮放）
- 格子/節點大小：`clamp(下限px, Xvw, 上限px)`，上限即桌面設計尺寸
- ≤900px 單欄時：`page-wrapper` 改 `height: auto; overflow-y: auto`，兩欄改 `height: auto; overflow-y: visible`，否則 App Shell 的 overflow:hidden 會截斷內容

---

## Linked List：while 迴圈控制流

**決策**：在 `stepOneLine()` 內實作真實的 while 迴圈跳躍，而非展開（unrolled）程式碼。

**Why**：教學目標是讓學生看到他們實際會寫的 C++ 程式碼；`while (curr != nullptr)` 的條件 check → 進入/離開 的視覺過程本身就是教學重點。

**How to apply**：
- `findMatchingBrace(whileLineIndex)`：從 while 行往後掃，計算 `{}` 深度，回傳對應 `}` 的行號
- `findLoopStart(closingBraceIndex)`：從 `}` 往前掃，找對應的 while 行號
- while 行：條件為 true → `currentLine++` 進入 body；條件為 false → `currentLine = findMatchingBrace(...) + 1` 跳出
- `}` 行：`currentLine = findLoopStart(...)` 跳回 while
- 目前只支援 `ptr != nullptr` 一種條件（查 `state.ptrs[ptrName]` 是否為 null）
- undo（StepHistory）快照含 `currentLine`，迴圈內回退完全正確

---

## Linked List：Empty State 必須在 heap region 外部

**決策**：`#ll-empty-state` 是 `#ll-heap-region` 的**兄弟節點**，不是子節點。

**Why**：`renderAllNodes()` 每次都執行 `llHeapRegion.innerHTML = ''`。若 empty state 是子節點，會被清除並脫離 DOM；之後對 `llEmptyState`（預先快取的 DOM ref）操作 `classList` 只影響脫離文件的節點，視覺上永遠不會顯示。

**How to apply**：新單元的 empty state 一律放在渲染容器**外部**，與容器同層。

---

## Linked List：Heap Scatter 佈局 + SVG 箭頭

**決策**：節點改用 `position: absolute` 在 `#ll-heap-region` 內定位；X 依鏈結邏輯順序等間距排列，Y 依建立順序取預設 `Y_OFFSETS` 陣列（模擬 heap 不連續分配）；節點間箭頭改為 SVG `<path>` 弧線。

**Why**：原本 `display: flex` 佈局讓所有節點黏在同一高度，無法直覺呈現 linked list 「節點散落在 heap 各處、靠指標串起」的核心特性。斜向 SVG 箭頭也能更清楚表達「next 指標跨越不連續位址」的概念。

**How to apply**：
- `Y_OFFSETS` 陣列以建立順序決定垂直位置，cycle 可支援超過 10 個節點
- SVG 箭頭用二次 Bezier 曲線（`Q` 命令）：水平方向向上弧，斜向方向接近直線
- Arrow/NULL 終止符的座標基於數學常數（`ND_*`），**不讀取 DOM rect**，避免 `node-spawn` transform 動畫期間座標錯位
- 所有節點的 `node-ptr-indicator` 行（28px）一律保留，確保 box 中心 Y 固定，SVG 箭頭始終對準

---

## Linked List：走訪指標與宣告指標分層顯示

**決策**：`curr` / `prev` 等走訪指標顯示在節點**上方** badge；`head` / `second` 等宣告指標顯示在節點**下方**標籤。兩者以「是否為節點 varName（`state.nodes[name]` 存在）」區分。

**Why**：原本所有指標混在同一標籤列，TRAVERSE 操作中 `curr` 移動時視覺變化不明顯，學生難以追蹤。分層後 `curr` badge 加上脈衝動畫和綠色 glow，節點當下被走訪的狀態一目了然。

**How to apply**：
- `traversalPtrs = pointingPtrs.filter(p => !state.nodes[p])`
- `nodePtrs = pointingPtrs.filter(p => state.nodes[p])`
- badge 有 `node-has-traverse-ptr` class 觸發 `.node-box` 的綠色邊框
- `--success` (#00c87a) 作為走訪指標的語義色，與 amber 系列（宣告指標）區分

---

## Linked List：if 巢狀於 while 的控制流

**決策**：`}` 行改用 `findMatchingOpener()` 往前掃描找對應開括號，判斷是 `while` 還是 `if`，再決定跳回迴圈頭或直接往下。

**Why**：原本 `RE_CLOSE_BRACE` 直接呼叫 `findLoopStart()`，隱含假設所有 `}` 都關閉 while。新增 `if (...) { break; }` 後，if 的 `}` 也會被誤判為迴圈結尾並跳回 while，造成無限迴圈或邏輯錯誤。

**How to apply**：
- `findMatchingOpener(i)`：從 `}` 往前計算 `{}`深度，回傳對應開括號所在行
- 若開括號行匹配 `RE_WHILE` → 跳回 while（迴圈結尾）
- 否則 → `currentLine++` 繼續往下（if / 其他區塊結尾）
- 新增 `findEnclosingWhile(fromLine)`：從當前行往前找最近的 while，供 `break` 使用

---

## Linked List：插入操作的預留 slotMap 佈局

**決策**：`insert_head` 和 `insert_mid` 在 `getNodePositions()` 使用固定 slotMap，替代預設的 chainIdx 順序排列。

**Why**：預設佈局在 `new Node()` 執行後，新節點出現在最右側孤立位置；下一步 `head = newNode` 或鏈結操作完成後才跳到正確位置，視覺上突然竄位，讓學生措手不及。

**How to apply**：
- `insert_head`：`{ newNode:0, head:1, second:2, third:3 }`，newNode 生成即在最左側
- `insert_mid`：`{ head:0, newNode:1, second:2, third:3 }`，newNode 生成即在預留的插入位置
- 兩者使用 `stepWide = 265px`（vs 全局 `X_STEP = 225px`），節點間距較寬，箭頭弧線更清晰
- 容器寬度固定按 4 slots 計算，即使 newNode 尚未建立也維持相同寬度，不會版面跳動

---

## Line-height 改為固定 rem 值

**決策**：`#code-input` 和 `.gutter-num` 的 `line-height` 都改為固定 `1.75rem`（非倍數）。

**Why**：兩者 font-size 不同時（e.g. 0.82rem vs 0.72rem），倍數 line-height 換算後絕對高度不同，導致行號與程式碼越往下越錯位。

**How to apply**：調整 font-size 或 line-height 時，確保兩者 `line-height` 為相同的**固定 rem 值**，並同步更新 JS 的 `LINE_HEIGHT_REM` 常數（目前為 `1.75`）。Current-line highlight overlay 的 `top` 計算依賴此值（`PADDING_TOP_REM + lineIndex * LINE_HEIGHT_REM`）。
