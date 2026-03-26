# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Data Structure Visualizer** — 大二資工系教學輔助 Web App。使用者在 Textarea 輸入 C++ 程式碼，逐行步進執行，右側 Canvas 以動畫呈現記憶體佈局與操作效果。

No build system, no package manager. Open `index.html` directly in a browser — all pages are self-contained.

## Architecture

This is a **multi-page application** where each data structure gets its own standalone HTML page:

```
index.html          → navigation hub (card grid)
array-vis.html      → Array unit (the only implemented unit so far)
css/style.css       → shared styles + all animation classes
js/array-vis.js     → Array parser + visualizer (self-contained, no framework)
```

### Page pattern for each data structure unit

Every `*-vis.html` page follows the same layout contract:
- **Left panel** (`lg:col-span-2`): code textarea (`#code-input`), Step/Reset buttons, concept card, `#console-output`
- **Right canvas** (`lg:col-span-3`): `#array-container` (or equivalent), empty state div, info badges

The JS for each unit is fully self-contained (no shared JS modules). Each script:
1. Holds a `state` object for the current execution state
2. Parses the textarea line-by-line using regex on each `Step` click
3. Mutates the DOM directly to render cells
4. Calls `triggerAnimation(el, className, durationMs)` to fire CSS animations

### Animation system (`css/style.css`)

Three animation classes are applied by JS — never by CSS logic:
- `.highlight` — yellow flash on a cell (memory access)
- `.value-change` — scale+fade on `.cell-value` span (value update)
- `.error-shake` — shake on `#array-container` + red pulse on all `.array-cell` children (OOB access)

`triggerAnimation()` removes the class, forces reflow (`void el.offsetWidth`), re-adds it, then removes after timeout. This pattern must be preserved to allow re-triggering on the same element.

### Adding a new data structure unit

1. Create `<name>-vis.html` following the same left/right panel layout
2. Create `js/<name>-vis.js` with its own `state` object and `stepOneLine()` parser
3. Add the new animation classes to `css/style.css` if needed
4. Activate the corresponding "Coming Soon" card in `index.html` (change `card-coming-soon` → `card-available`, add `<a href>` wrapper)

### Simulated memory model

- Base address is `0x1000` (hardcoded in each JS state object)
- Each `int` cell is 4 bytes → address of `arr[i]` = `0x1000 + i * 4`
- `toHex(addr)` formats as `0xXXXX` (uppercase, 4-digit padded)
- Cell IDs follow `cell-${i}` and `cell-value-${i}` conventions

## Styling conventions

- Dark theme: `bg-slate-900` / `#0f172a` base, `bg-slate-800` for panels
- Tailwind CDN is loaded via `<script src="https://cdn.tailwindcss.com">` in each HTML file
- Grid background uses inline `<style>` with `background-image` linear-gradient trick
- `css/style.css` handles only component-level styles (cells, animations, console lines) — layout is Tailwind

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