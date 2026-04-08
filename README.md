# Data Structure Visualizer

大二資工系教學輔助工具。在左側輸入 C++ 程式碼，逐行步進執行，右側即時呈現記憶體佈局、指標關係與動畫效果。

**[→ 線上 Demo](https://visual-ds-xi.vercel.app)**

---

## 功能

每個資料結構各自是一個獨立頁面，左右分割版面：左側程式碼編輯器 + 操作選單，右側視覺化 canvas。

### Array
- 宣告、賦值、讀取、陣列間複製
- 多陣列同時顯示，各自有模擬記憶體位址
- 越界存取：error-shake 動畫 + console 警告

### Linked List
- 節點配置（`new Node`）、串接（`->next`）、走訪（`while` 迴圈）
- 支援：搜尋值（FIND）、頭部插入、中間插入、刪除節點（含 `delete` 釋放記憶體）
- Heap scatter 佈局：節點以 absolute 定位模擬不連續的 heap 配置
- SVG 箭頭：節點間連線支援斜向與弧線，NULL 終止符明確標示
- 走訪指標 badge：`curr` / `prev` 在節點上方顯示綠色 badge，`head` 以 cyan 區分
- 上一步（◀ BACK）：快照法 undo，可逐步回退

---

## 本地執行

無需安裝任何套件或 build step，直接用瀏覽器開啟：

```
open index.html
```

或直接把 `index.html` 拖進瀏覽器視窗。

---

## 技術棧

| 層面 | 選擇 |
|------|------|
| 語言 | Vanilla JS（ES6+）、HTML5、CSS3 |
| 樣式 | 純 CSS custom properties，無框架 |
| 字型 | JetBrains Mono（Google Fonts） |
| 主題 | Amber Phosphor Terminal |
| 部署 | Vercel |

無 bundler、無 npm、無框架依賴。

---

## 專案結構

```
index.html              → 首頁導覽
array-vis.html          → Array 單元
linked-list-vis.html    → Linked List 單元
css/style.css           → 全站設計系統（tokens、動畫）
js/array-vis.js         → Array 解析器與視覺化
js/linked-list-vis.js   → Linked List 解析器與視覺化
js/history.js           → 共用 undo stack（StepHistory）
docs/progress.md        → 開發進度
docs/decisions.md       → 技術決策記錄
```

## 進行中 / 規劃中

- [ ] Stack 單元
- [ ] Queue 單元
- [ ] Auto Run 模式（自動逐行，可調速）
