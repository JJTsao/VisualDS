# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Data Structure Visualizer** — 大二資工系教學輔助 Web App。使用者在 Textarea 輸入 C++ 程式碼，逐行步進執行，右側 Canvas 以動畫呈現記憶體佈局與操作效果。

No build system, no package manager. Open `index.html` directly in a browser.

- 開發進度與待辦：[docs/progress.md](docs/progress.md)
- 技術決策記錄：[docs/decisions.md](docs/decisions.md)

## Architecture

Multi-page application — each data structure gets its own standalone HTML page:

```
index.html              → navigation hub (card grid)
array-vis.html          → Array unit
linked-list-vis.html    → Linked List unit
stack-vis.html          → Stack unit (LIFO)
queue-vis.html          → Queue unit (FIFO)
tree-vis.html           → Binary Search Tree unit (interactive, no code editor)
sorting-vis.html        → Sorting Algorithms unit (Bubble/Selection/Insertion/Merge/Quick)
graph-vis.html          → Graph unit (interactive builder)
css/style.css           → shared design tokens + component styles + all animation classes
js/array-vis.js         → Array parser + visualizer (self-contained, no framework)
js/linked-list-vis.js   → Linked List parser + visualizer
js/stack-vis.js         → Stack parser + visualizer (push/pop/peek)
js/queue-vis.js         → Queue parser + visualizer (enqueue/dequeue)
js/tree-vis.js          → BST builder + insert/search/delete/traversals/invert/depth/rotate
js/sorting-vis.js       → Sorting visualizer (5 algorithms, AUTO + STEP modes)
js/graph-vis.js         → Graph builder + BFS / DFS / Dijkstra animations
js/history.js           → shared StepHistory class (undo stack, JSON deep-copy snapshots)
```

**Note:** there are 7 units (Array, Linked List, Stack, Queue, BST, Sorting, Graph), all active on `index.html`. Two units break the "C++ code-stepper" mould: **Tree** (BST) and **Graph** are interactive builders with no `#code-input` textarea — the user manipulates the structure via buttons / canvas clicks instead of stepping through code. **Sorting** is a self-running visualizer (with an optional manual STEP mode), also no code editor.

### Page pattern for each `*-vis.html`

Layout: CSS Grid, two columns — left control panel (`minmax(360px, 460px)`) / right canvas (`1fr`).

Page uses App Shell pattern: `page-wrapper` is `height: 100vh; overflow: hidden`. Both columns are `overflow-y: auto; height: 100%` for independent scrolling.

Required DOM IDs (consumed by the JS):
- `#code-input` — textarea
- `#btn-step`, `#btn-reset`, `#btn-clear-console`
- `#console-output`, `#step-indicator`
- `#array-container`, `#array-wrapper`, `#empty-state`, `#array-info`
- `#cpp-equivalent`, `#cpp-equiv-text`
- `#op-desc` — operation description text

Panel layout — left col: Op selector + code editor + buttons. Right col: Memory Layout (含內嵌 Legend sidebar) + Memory Model + Console Output.

Inline `<script>` in the HTML handles the line-gutter only. It must be wrapped in an IIFE to avoid `const` redeclaration conflicts with the external JS file. It exposes `window.setActiveLine(n)` for the JS to call.

### JS architecture

Each unit script is self-contained. Common structure across all units:

```
OPERATIONS  → preset code snippets keyed by op name
state       → unit-specific state object
stepOneLine() → main parser, called on each Step click
stepBack()    → pop snapshot from history, restore state + re-render
reset()       → clears state + DOM + history
window.loadOperation(key) → loads preset, resets, syncs gutter
```

**`js/array-vis.js`** — `state` holds `{ currentLine, lines, arrays{}, arrayOrder[], addrCounter }`. Multi-array support: `state.arrays` is a map `name → { size, values[], baseAddr }`. Cell IDs follow `cell-${arrayName}-${index}`. Regex parse order matters — check `RE_DECLARE_INIT` before `RE_READ`, and `RE_ASSIGN_ARR` before `RE_ASSIGN_LIT`.

**`js/linked-list-vis.js`** — `state` holds `{ currentLine, lines, nodes{}, nodeOrder[], ptrs{}, vars{}, addrCounter }`. Key distinctions:
- `nodes` — heap objects `{ addr, data, nextName, freed }`
- `ptrs` — all `Node*` variables → target node var name or null
- `vars` — simple `int`/`bool` variables
- Supports real control flow: `while (ptr != nullptr)`, `if (ptr->data == val)`, `break`
- `findMatchingBrace()` / `findMatchingOpener()` / `findEnclosingWhile()` handle nested while+if
- `RE_CLOSE_BRACE` uses `findMatchingOpener()` to distinguish `}` of while vs if (avoids incorrect loop-back jump)
- Node layout: `getNodePositions()` assigns X by linked-list order, Y by creation order via `Y_OFFSETS[]` (simulates heap scatter); `insert_head/mid/delete_mid` use a fixed `slotMap` so nodes don't shift during operation
- `renderArrows()` draws SVG overlay for inter-node arrows (arcs) and NULL terminators

**`js/graph-vis.js`** — interactive builder, not a code-stepper (no `#code-input`). `state` holds `{ nodes(Map id→{id,x,y,el,idEl,distEl}), edges[], adj(Map id→[{to,weight,edge}]), nextId, mode, weightMode, selected, busy }`. Undirected weighted graph; adjacency list is the model of record (each edge pushed into both endpoints' lists, sharing one `edge` ref). Same two-layer canvas as BST: SVG `#graph-edges` (lines + weight `<text>`) beneath DOM `#graph-nodes` (absolutely-positioned circles, centre via `translate(-50%,-50%)`). Interaction: canvas click adds a node (node mode); node click selects endpoints (edge mode) — node clicks `stopPropagation` so they don't also fire the canvas add-node handler. BFS (queue), DFS (recursion), Dijkstra (array min-extract) are `async/await`, paced by `stepDelay()` from the speed slider; `setControlsDisabled` + `state.busy` lock the UI mid-run. Dijkstra reveals per-node distance badges (`#graph-nodes.dijkstra .graph-node-dist`) and highlights the shortest-path tree via the `prev` map.

**`js/stack-vis.js`** — code-stepper like Array. `state` holds `{ currentLine, lines, cells[], top, residual, vars{}, addrCounter }`. Models a fixed-capacity LIFO: `top` is the index of the current top cell; `residual` tracks popped-but-still-drawn cells (灰格, simulating that popped memory isn't zeroed). Push/pop/peek with overflow (`top` past capacity) and underflow (`top < 0`) detection → shake/flash animations.

**`js/queue-vis.js`** — code-stepper like Array. `state` holds `{ currentLine, lines, cells[], front, rear, vars{}, addrCounter }`. Models a FIFO with separate `front` / `rear` indices (linear, not circular). Enqueue advances `rear`, dequeue advances `front`; overflow when `rear` past capacity.

**`js/tree-vis.js`** — interactive builder, not a code-stepper (no `#code-input`). `state` holds `{ root, count, busy }`; `TreeNode` class `{ value, left, right, x, y, el, edge }`. Two-layer canvas: SVG `#tree-edges` (z-index 1) under DOM `#tree-nodes` (z-index 2). Recursive `layout(node, minX, maxX, depth)` centres each node in its horizontal band and halves the band for children; fixed vertical `LEVEL_HEIGHT`. All operations are `async/await` with per-node `visitAnimate()` pulses, paced by a speed control; `setControlsDisabled` + `state.busy` lock the UI. Implements **Insert / Search / Delete (3 cases via `findNodeWithPath` + `bypassNode` + `findInorderSuccessor`) / Pre-In-Post-order traversals / Invert (LC226) / Get Max Depth (LC104) / Left+Right Rotate**. Re-layout is smooth: `.tree-node` has `transition: left/top`; SVG edges glide via `animateEdgeTo()` rAF interpolation. `resetNodeStates()` clears all marker classes between ops. No undo (interactive, not step-based).

**`js/sorting-vis.js`** — self-running visualizer, not a code-stepper. `state` holds `{ values[], bars[], size, speed, algorithm, mode, busy, cancelled, comparisons, swaps, stepCount, segGaps, trayLeftBars[], trayRightBars[] }`. Bars are height-% divs; `ALGORITHMS` map keys metadata (label/desc/big-O) for `bubble/selection/insertion/merge/quick`. Two modes: `mode: 'auto'` (timed animation, `speedToDelay()` inverse-maps slider 1–100 → ms) and `mode: 'step'` (advance on button/keyboard, with a narration bar). Merge Sort has a dedicated visualization: `segGaps` marks divide boundaries (recursive split phase), and a **merge tray** (`trayLeftBars`/`trayRightBars`) renders `left[]`/`right[]` sub-arrays with two moving pointers, aligned to the original bar positions. `cancelled` flag lets a running sort abort cleanly on reset.

**`js/history.js`** — `StepHistory` class with `push(snapshot)` / `pop()` / `clear()` / `isEmpty`. Snapshots are deep-copied via JSON round-trip — all state fields must be plain JSON-serialisable (no DOM refs, no functions). Load this before any `*-vis.js` in HTML. Used by the code-stepper units (Array / Linked List / Stack / Queue); the interactive units (Tree / Graph) and Sorting don't use it.

### Exam stack（互動式計分考試 — 進行中,feat/exam-dijkstra 分支）

教學站之外延伸的子系統,把視覺化資產重用為**過程式作答的計分考試**(完整方向見
`memory/exam-system.md` 與 `~/.claude/plans/application-synchronous-squid.md`)。**與教學站分層、互不干擾**:

- `shared/algorithms/` — 純邏輯層,**無 DOM**,ESM(`package.json` 標 `type:module`),瀏覽器與 Node 共用:
  - `trace-engine.js` — **通用**引擎:每章節化為一串原子步驟 `{key,phase,kind,prompt,answer,options?,focusNode?}`,
    `gradeStep`/`scoreSteps`/`groupByPhase` 統一判分。新章節只需「步進器 + 各 kind 的 UI」
  - `dijkstra.js` + `graph-gen.js` + `trace-grader.js` — Dijkstra 步進器/隨機圖/專用判分
    (釘死規則:平手取小 id、嚴格才鬆弛、鄰居按 id 升冪)
  - `bst.js` + `bst-gen.js` — BST 刪除步進器(buildBST/layoutTree/bstDeleteTrace)/隨機 BST
  - `_selftest.mjs`、`_bst_selftest.mjs` — `node <file>` 自測
- 題型**離線原型**(純前端,client 端判分,僅供體驗/練習,**須經 http 開啟**):
  - `exam/dijkstra.html`(鎖步兩階段;權重標籤碰撞避讓)、`exam/bst-delete.html`(搜尋→分類→解決)
- **`server/`** — 正式計分後端,**零依賴**(只用 Node 內建,`node server/server.js`):
  - `/api/start`(出題,不含答案)、`/api/step`(伺服器端逐步判分,提交後才揭曉)、`/api/results`(老師看成績,token)
  - 分數/標準答案只在伺服器,不可竄改;成績寫 `server/data/results.json`(gitignore)
  - `server/chapters/<id>.js` 重用 `shared/algorithms`;測試 `node server/_apitest.mjs`
- **server 模式前端**:`exam/play.html?chapter=<id>` + `exam/exam-client.js`(通用控制器)+
  `exam/render-tree.js`(BST 渲染器,純呈現)+ `exam/exam.css`。輸入學號 → 逐步作答 → 伺服器判分。
  目前章節:`bst-delete`(Dijkstra 於後續接入)。

### Animation system

All animations use `triggerAnimation(el, className, ms)`: removes the class, forces reflow (`void el.offsetWidth`), re-adds it, then removes after timeout. This reflow pattern must be preserved for re-triggering.

**Array animations:**
- `.highlight` — amber flash on a cell (read or write access)
- `.value-change` — applied to `.cell-value` span (scale+fade on update)
- `.error-shake` — applied to `.array-cells` div (shake + red pulse on OOB); selector is `.array-cells.error-shake .array-cell` — per named array, not global

**Linked List animations:**
- `.node-spawn` — fade-in scale for newly allocated nodes
- `.node-highlight` — amber glow when reading data
- `.node-ptr-update` — pulse when `->next` changes
- `.node-delete` — fade-out for freed nodes
- `.node-ptr-badge` / `.ptrBadgePulse` — green traversal pointer badge above node

**Graph animations:**
- `.graph-node-spawn` — fade-in scale for a newly placed vertex
- `.graph-node-selected` — cyan ring on the first picked endpoint (edge build)
- `.graph-node-frontier` — amber, vertex discovered/queued but not yet processed
- `.graph-node-current` — bright sustained pulse on the vertex being processed
- `.graph-node-visited` — green, fully processed (holds for the run)
- `.graph-edge-active` — bright amber, edge under evaluation; `.graph-edge-traversed` — green discovery edge (BFS/DFS); `.graph-edge-tree` — bold green Dijkstra shortest-path-tree edge
- `.graph-node-dist` + `.dist-relaxed` — distance badge (∞/number) with a green pop on relaxation

### Styling system (`css/style.css`)

**Theme: Amber Phosphor Terminal.** No Tailwind. Pure CSS with custom properties.

Key design tokens:
```css
--bg / --bg-panel / --bg-card     /* near-black backgrounds */
--amber / --amber-bright / --amber-dim / --amber-glow  /* primary color */
--text / --text-dim / --text-muted /* legibility hierarchy */
--error / --success / --warn       /* semantic colors */
--font-mono: 'JetBrains Mono'      /* loaded via Google Fonts */
```

Page atmosphere: `body::after` = CRT scanline overlay; `body::before` = dot-grid background. Both use `pointer-events: none`.

### Adding a new data structure unit

1. Create `<name>-vis.html` — same left/right layout, same required DOM IDs; load `js/history.js` before the unit script
2. Create `js/<name>-vis.js` — own `state`, own `OPERATIONS`, own `stepOneLine()`; implement `stepBack()` using `StepHistory`
3. Activate the card in `index.html`: change `card-unavailable` → `card-active`, wrap in `<a href>`
4. Add any new animation classes to `css/style.css`

For undo (Back button): push a JSON-serialisable snapshot at the start of `stepOneLine()` before any mutation. `stepBack()` pops and restores state + re-renders. See `js/linked-list-vis.js` for the full pattern.

### Simulated memory model

- `state.addrCounter` starts at `0x1000`; each array declaration increments it by `size * 4 + 0x100`
- `toHex(addr)` → `0xXXXX` (uppercase, 4-digit zero-padded)
- Multiple arrays get addresses `0x1000`, `0x1114`, `0x1228`, etc.

## Frontend Design Principle
DISTILLED_AESTHETICS_PROMPT = """
<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight. Focus on:

Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.

Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.

Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.

Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>
"""
