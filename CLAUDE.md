# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Data Structure Visualizer** — 大二資工系教學輔助 Web App。使用者在 Textarea 輸入 C++ 程式碼，逐行步進執行，右側 Canvas 以動畫呈現記憶體佈局與操作效果。

No build system, no package manager. Open `index.html` directly in a browser.

## Architecture

Multi-page application — each data structure gets its own standalone HTML page:

```
index.html        → navigation hub (card grid)
array-vis.html    → Array unit (only implemented unit so far)
css/style.css     → shared design tokens + component styles + all animation classes
js/array-vis.js   → Array parser + visualizer (self-contained, no framework)
```

### Page pattern for each `*-vis.html`

Layout: CSS Grid, two columns — left control panel (`minmax(280px, 380px)`) / right canvas (`1fr`).

Required DOM IDs (consumed by the JS):
- `#code-input` — textarea
- `#btn-step`, `#btn-reset`, `#btn-clear-console`
- `#console-output`, `#step-indicator`
- `#array-container`, `#array-wrapper`, `#empty-state`, `#array-info`
- `#cpp-equivalent`, `#cpp-equiv-text`
- `#op-desc` — operation description text

Inline `<script>` in the HTML handles the line-gutter only. It must be wrapped in an IIFE to avoid `const` redeclaration conflicts with the external JS file. It exposes `window.setActiveLine(n)` for the JS to call.

### JS architecture (`js/array-vis.js`)

Each unit script is self-contained. Key structure:

```
OPERATIONS  → preset code snippets keyed by op name
state       → { currentLine, lines, arrays{}, arrayOrder[], addrCounter }
Regex       → RE_DECLARE, RE_ASSIGN_LIT, RE_ASSIGN_ARR, RE_READ, RE_BLANK
stepOneLine() → main parser, called on each Step click
reset()       → clears state + DOM
window.loadOperation(key) → loads preset, resets, syncs gutter
```

Multi-array support: `state.arrays` is a map `name → { size, values[], baseAddr }`. Each array gets base address `state.addrCounter`; counter advances by `size * 4 + 0x100` per declaration. Cell IDs follow `cell-${arrayName}-${index}` and `cell-value-${arrayName}-${index}`.

Regex parse order in `stepOneLine()` matters — check `RE_ASSIGN_ARR` before `RE_ASSIGN_LIT` (both can match assignment lines).

### Animation system

Three CSS animation classes, triggered by JS `triggerAnimation(el, className, ms)`:
- `.highlight` — amber flash on a cell (read or write access)
- `.value-change` — applied to `.cell-value` span (scale+fade on update)
- `.error-shake` — applied to `.array-cells` div (shake + red pulse on OOB)

`triggerAnimation` removes the class, forces reflow (`void el.offsetWidth`), re-adds it, then removes after timeout. This pattern must be preserved for re-triggering.

`error-shake` selector is `.array-cells.error-shake .array-cell` — applied per named array, not globally.

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

1. Create `<name>-vis.html` — same left/right layout, same required DOM IDs
2. Create `js/<name>-vis.js` — own `state` object, own `OPERATIONS`, own `stepOneLine()`
3. Activate the card in `index.html`: change `card-unavailable` → `card-active`, wrap in `<a href>`
4. Add any new animation classes to `css/style.css`

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
