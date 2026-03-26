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

## Line-height 改為固定 rem 值

**決策**：`#code-input` 和 `.gutter-num` 的 `line-height` 都改為固定 `1.52rem`（非倍數）。

**Why**：兩者 font-size 不同時（e.g. 0.82rem vs 0.72rem），倍數 line-height 換算後絕對高度不同，導致行號與程式碼越往下越錯位。

**How to apply**：調整 font-size 或 line-height 時，確保兩者 `line-height` 為相同的**固定 rem 值**。Current-line highlight overlay 的 `top` 計算依賴此值（`PADDING_TOP_REM + lineIndex * LINE_HEIGHT_REM`）。
