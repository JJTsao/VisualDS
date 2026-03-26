# Development Progress

## 已完成

### 基礎架構
- [x] 專案目錄結構（index.html / array-vis.html / css/style.css / js/array-vis.js）
- [x] Git 初始化，使用 conventional commits
- [x] CLAUDE.md 工作指引

### index.html（首頁）
- [x] Amber Phosphor Terminal 主題
- [x] bootFlicker + staggered fadeSlideUp 開場動畫
- [x] Array 卡片可點擊；Stack / Queue 卡片顯示 LOCKED
- [x] Linked List 卡片解鎖（card-active）
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

### linked-list-vis.html（Linked List 單元）
- [x] 同 array-vis 的 App Shell 佈局（3 個 op tab：BUILD / LINK / TRAVERSE）
- [x] Heap 節點視覺化：data | next 雙欄格子 + NULL 終點
- [x] 走訪指標追蹤區（`#ll-ptr-region`）：顯示 curr 等走訪指標的當前位址
- [x] `while (curr != nullptr)` 真實迴圈：條件求值 + 行號跳躍
- [x] 圖例說明、Memory Model 概念卡、Console output
- [x] **Heap scatter 佈局**：節點改用 absolute 定位，Y 位置由建立順序決定，視覺呈現 heap 不連續分配；節點間箭頭改為 SVG（支援斜向、弧線）
- [x] **走訪指標 badge**：`curr` / `prev` 等走訪指標在節點上方顯示綠色 badge + 下向三角，同時節點框變綠色 glow；與節點宣告指標（`head` 等）分層顯示
- [x] **APPLICATIONS 操作組**（FIND / INS HEAD / INS MID / DELETE）：新增第二段操作選單，支援搜尋值、頭部插入、中間插入、刪除中間節點四個操作

### js/history.js（共用 undo 工具）
- [x] `StepHistory` class：`push` / `pop` / `clear` / `isEmpty`
- [x] JSON deep-copy 快照（state 純物件，無 DOM ref）

### js/array-vis.js（Array Parser & 視覺化）
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
- [x] 上一步（◀ BACK）：快照法 undo，使用 `StepHistory`

### js/linked-list-vis.js（Linked List Parser & 視覺化）
- [x] state：`nodes`、`nodeOrder`、`ptrs`（統一管理所有 Node* 變數）、`vars`（int/bool 簡單變數）、`addrCounter`
- [x] 支援語法：
  - `Node* x = new Node(val);` → heap 配置、spawn 動畫
  - `Node* x = y;` / `Node* x = nullptr;` → 指標賦值（帶型別宣告）
  - `x = y;` → 指標重新指向（無型別宣告，`RE_PTR_REASSIGN`）
  - `x->next = y;` / `x->next = nullptr;` → 設定 next（ptr-update 動畫）
  - `x->next = y->next;` → 複製 next 指標（`RE_SET_NEXT_NEXT`）
  - `Node* x = y->next;` → 宣告新指標並指向某節點的 next（`RE_PTR_FROM_NEXT`）
  - `delete ptr;` → 釋放節點記憶體，從 heap 移除（node-delete 動畫）
  - `x->data = val;` → 修改 data
  - `cout << x->data;` → 讀取並輸出
  - `x = x->next;` → 走訪指標移動
  - `int v = val;` → 整數變數宣告（存入 `state.vars`）
  - `bool f = true/false;` → 布林變數宣告／賦值
  - `while (x != nullptr) { ... }` → 實際迴圈控制流
  - `if (x->data == val/var) { ... }` → 條件判斷（支援 vars 中的變數）
  - `break;` → 跳出最近的 while 迴圈
  - 空行 / 純註解 → 略過
- [x] `findMatchingBrace()` / `findMatchingOpener()` / `findEnclosingWhile()`：正確處理 while + if 巢狀控制流
- [x] `RE_CLOSE_BRACE` 改用 `findMatchingOpener` 判斷 `}` 屬於 while 或 if，避免 if 區塊結尾誤跳回迴圈頭
- [x] `getChainOrder()`：按 linked list 邏輯順序渲染（跟著 nextName 走）
- [x] `ptrsPointingTo()`：節點標籤列顯示所有指向它的指標名
- [x] 上一步（◀ BACK）：含 while/if 巢狀迴圈內回退，快照含 `vars`
- [x] `getNodePositions()`：依鏈結順序分配 X，依建立順序取 `Y_OFFSETS` 分配 Y，模擬 heap scatter；`insert_head` / `insert_mid` / `delete_mid` 使用固定 slotMap 鎖住節點位置，操作過程中只有箭頭改變，節點不跑位
- [x] `renderArrows()`：SVG 覆蓋層繪製節點間箭頭（弧線）與 NULL 終止符
- [x] 走訪/宣告指標分類：`traversalPtrs`（非節點名稱）顯示為上方 badge；`nodePtrs` 顯示為下方標籤
- [x] **Head pointer 視覺區分**：鏈結頭節點的 `head` 標籤以 cyan (#40d0ff + glow) 顯示，與其他 amber 標籤明確區分

### css/style.css（設計系統）
- [x] 全站 CSS custom properties（`--amber`, `--text-dim` 等）
- [x] JetBrains Mono via Google Fonts
- [x] Array 動畫：highlight / value-change / error-shake
- [x] Linked List 動畫：node-spawn / node-highlight / node-ptr-update / node-delete
- [x] array-group / array-cells 多陣列佈局
- [x] ll-node-group / node-box / ll-ptr-tracker 佈局（node-arrow / node-null 已由 SVG 取代）
- [x] op-btn / op-grid / op-desc 操作選單
- [x] 文字對比度修正（`--text-muted` #6b5020→#9a7530，符合 WCAG AA）
- [x] 響應式：`clamp()` 縮放（格子、節點、字型）；≤900px 整頁可捲動單欄
- [x] `.node-ptr-indicator` / `.node-ptr-badge`：走訪指標綠色 badge + ptrBadgePulse 動畫
- [x] `.node-has-traverse-ptr .node-box`：被走訪指標指向的節點綠色邊框 glow

## 已知問題 / 限制

- Array parser 只支援 `int` 型別（intentional scope limit）
- Linked list parser 只支援 `while (ptr != nullptr)` 一種 while 條件
- 沒有「自動執行全部」模式，只有 step-by-step

## 下一步

- [ ] Stack 單元（stack-vis.html）
- [ ] Queue 單元（queue-vis.html）
- [ ] Linked List 補充操作（INSERT BACK 等）
- [ ] Auto Run 模式（自動逐行執行，可調速）
- [ ] 更多 Array 操作（Search / Sort 等）

> **新單元開發提醒**：上一步功能已有通用實作，接入方式見 `docs/decisions.md`。while 迴圈控制流實作見 `js/linked-list-vis.js`。
