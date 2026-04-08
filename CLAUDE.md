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
css/style.css           → shared design tokens + component styles + all animation classes
js/array-vis.js         → Array parser + visualizer (self-contained, no framework)
js/linked-list-vis.js   → Linked List parser + visualizer
js/history.js           → shared StepHistory class (undo stack, JSON deep-copy snapshots)
```

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

**`js/history.js`** — `StepHistory` class with `push(snapshot)` / `pop()` / `clear()` / `isEmpty`. Snapshots are deep-copied via JSON round-trip — all state fields must be plain JSON-serialisable (no DOM refs, no functions). Load this before any `*-vis.js` in HTML.

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
