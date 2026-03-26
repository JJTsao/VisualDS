# Development Progress

## 已完成

### 基礎架構
- [x] 專案目錄結構（index.html / array-vis.html / css/style.css / js/array-vis.js）
- [x] Git 初始化，使用 conventional commits
- [x] CLAUDE.md 工作指引

### index.html（首頁）
- [x] Amber Phosphor Terminal 主題
- [x] bootFlicker + staggered fadeSlideUp 開場動畫
- [x] Array 卡片可點擊；Linked List / Stack / Queue 卡片顯示 LOCKED
- [x] CRT 掃描線 + 點陣背景（CSS only）

### array-vis.html（Array 單元）
- [x] 左右分割版面（control panel + canvas）
- [x] Operation Selector（5 個 tab 按鈕）
- [x] 仿 VS Code 的 code editor（含 line gutter，JS 同步高亮當前行）
- [x] 當前執行行 highlight overlay（amber 背景 + 左側邊框）
- [x] Console output 面板
- [x] Memory Layout canvas（支援多陣列同時顯示）
- [x] C++ pointer arithmetic 等效顯示
- [x] 圖例說明

### js/array-vis.js（Parser & 視覺化）
- [x] 多陣列狀態管理（`state.arrays` map）
- [x] 支援語法：
  - `int name[size];` → 宣告＋渲染陣列格子
  - `name[i] = value;` → 賦值（含越界偵測）
  - `dst[i] = src[j];` → 陣列間/陣列內元素複製
  - `int x = arr[i];` → 讀取（highlight，不修改值）
  - 空行 / 純註解 → 略過
- [x] 5 個 OPERATIONS 預設範例（ACCESS / WRITE / COPY / INSERT / DELETE）
- [x] `triggerAnimation()` reflow 重觸發機制
- [x] error-shake 作用於 `.array-cells`（per-array）

### css/style.css（設計系統）
- [x] 全站 CSS custom properties（`--amber`, `--text-dim` 等）
- [x] JetBrains Mono via Google Fonts
- [x] 動畫：highlight / value-change / error-shake
- [x] array-group / array-cells 多陣列佈局
- [x] op-btn / op-grid / op-desc 操作選單

## 已知問題 / 限制

- Parser 只支援 `int` 型別（intentional scope limit）
- 沒有「自動執行全部」模式，只有 step-by-step

## 下一步

- [ ] Linked List 單元（linked-list-vis.html）
- [ ] Stack 單元（stack-vis.html）
- [ ] Queue 單元（queue-vis.html）
- [ ] Auto Run 模式（自動逐行執行，可調速）
- [ ] 更多 Array 操作（Search / Sort 等）
