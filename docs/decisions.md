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

## Line-height 改為固定 rem 值

**決策**：`#code-input` 和 `.gutter-num` 的 `line-height` 都改為固定 `1.52rem`（非倍數）。

**Why**：兩者 font-size 不同時（e.g. 0.82rem vs 0.72rem），倍數 line-height 換算後絕對高度不同，導致行號與程式碼越往下越錯位。

**How to apply**：調整 font-size 或 line-height 時，確保兩者 `line-height` 為相同的**固定 rem 值**。Current-line highlight overlay 的 `top` 計算依賴此值（`PADDING_TOP_REM + lineIndex * LINE_HEIGHT_REM`）。
