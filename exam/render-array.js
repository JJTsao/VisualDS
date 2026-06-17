// render-array.js — Shared sorting renderer factory (browser, presentational).
// Handles bubble-sort (classify swap/keep), selection-sort (pick-node min cell),
// and merge-sort (classify left/right). Imported by per-chapter thin wrappers.

const TITLES = {
  bubble:    'Bubble Sort · 過程式測驗',
  selection: 'Selection Sort · 過程式測驗',
  merge:     'Merge Sort · 過程式測驗',
};
const CANVAS_LABELS = {
  bubble:    '陣列狀態 — Bubble Sort（橘色 = 正在比較；綠色 = 已就位）',
  selection: '陣列狀態 — Selection Sort（點選每輪最小值的格子；綠色 = 已就位）',
  merge:     '陣列狀態 — Merge Sort（上排=待合併的兩半段，下排=合併結果；橘色=正在比較的兩格）',
};

export function makeSortingUI(type) {
  return {
    title: TITLES[type] ?? 'Sorting · 過程式測驗',
    canvasLabel: CANVAS_LABELS[type] ?? '陣列狀態',
    infoHTML(instance) {
      const label = { bubble: 'Bubble Sort', selection: 'Selection Sort', merge: 'Merge Sort' }[type] ?? type;
      return `使用 <b>${label}</b> 排序陣列 <code>[${instance.arr.join(', ')}]</code>。逐步回答每個操作決策。`;
    },
    hint(step) {
      if (type === 'bubble')    return '提示：arr[i] > arr[i+1] 時才需要交換。';
      if (type === 'selection') {
        if (step && step.meta && step.meta.phase === 'swap')
          return '提示：最小值要和「未排序區間最前面的那一格」交換 —— 也就是這一輪的起點 arr[起點]。';
        return '提示：在未排序區間裡找到最小值所在的格子。';
      }
      if (type === 'merge')     return '提示：比較「來源」列反白的左右兩格，較小者先放入結果（平手取左）。';
      return '再試一次。';
    },
  };
}

// ─── Renderer factory ─────────────────────────────────────────────────────────

export function createSortingRenderer(instance, stage, { onPickNode }) {
  const arr = instance.arr;
  const n = arr.length;
  const stype = instance.type;

  // Merge sort gets a dedicated position-aligned renderer (source + result rows).
  if (stype === 'merge') return createMergeRenderer(arr, n, stage);

  // ── Build DOM ────────────────────────────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.className = 'arr-viz';
  stage.appendChild(wrapper);

  // For merge-sort, we also show a merge-context row
  let mergeRow = null;
  if (stype === 'merge') {
    mergeRow = document.createElement('div');
    mergeRow.className = 'arr-merge-row';
    stage.appendChild(mergeRow);
  }

  const currentArr = [...arr];  // evolving state (bubble/selection only)
  const cells = [], valueEls = [];

  function buildCells() {
    wrapper.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const cell = document.createElement('div');
      cell.className = 'arr-cell';
      cell.dataset.idx = i;
      const val = document.createElement('span');
      val.className = 'arr-val';
      val.textContent = currentArr[i];
      const idx = document.createElement('span');
      idx.className = 'arr-idx';
      idx.textContent = i;
      cell.appendChild(val); cell.appendChild(idx);
      cell.addEventListener('click', () => {
        if (cell.classList.contains('arr-clickable')) onPickNode(i);
      });
      wrapper.appendChild(cell);
      cells[i] = cell; valueEls[i] = val;
    }
  }
  buildCells();

  // ── State ────────────────────────────────────────────────────────────────────
  let focus = null;          // { leftIdx, rightIdx } or { sortedBoundary } or null
  let sortedFrom = n;        // arr[sortedFrom..n-1] is sorted (for bubble)
  let sortedUpTo = 0;        // arr[0..sortedUpTo-1] is sorted (for selection)
  let pickable = false;
  let picked = null;
  let mergeContext = null;   // { leftArr, rightArr, li, ri } for merge-sort
  let selMin = null;         // selection-sort: the chosen minimum cell (kept through the swap step)

  function refresh() {
    for (let i = 0; i < n; i++) {
      const cell = cells[i];
      cell.classList.remove('arr-sorted', 'arr-sorted-left', 'arr-comparing', 'arr-picked', 'arr-clickable', 'arr-found-min');
      valueEls[i].textContent = currentArr[i];

      // Sorted regions
      if (stype === 'bubble' && i >= sortedFrom) cell.classList.add('arr-sorted');
      if (stype === 'selection' && i < sortedUpTo) cell.classList.add('arr-sorted-left');

      // Highlights
      if (focus) {
        if ('leftIdx' in focus && (i === focus.leftIdx || i === focus.rightIdx)) {
          cell.classList.add('arr-comparing');
        }
      }
      if (pickable) {
        const boundary = focus?.sortedBoundary ?? 0;
        if (i >= boundary) cell.classList.add('arr-clickable');
      }
      if (i === picked) cell.classList.add('arr-picked');
      if (stype === 'selection' && selMin !== null && i === selMin) cell.classList.add('arr-found-min');
    }

    // Merge context
    if (mergeRow && mergeContext) {
      const { leftArr, rightArr, li, ri } = mergeContext;
      mergeRow.innerHTML =
        `<div class="mctx-label">左</div>` +
        leftArr.map((v, i) => `<div class="mctx-cell ${i === li ? 'mctx-ptr' : ''}">${v}</div>`).join('') +
        `<div class="mctx-sep">↔</div>` +
        `<div class="mctx-label">右</div>` +
        rightArr.map((v, i) => `<div class="mctx-cell ${i === ri ? 'mctx-ptr' : ''}">${v}</div>`).join('');
    } else if (mergeRow) {
      mergeRow.innerHTML = '';
    }
  }
  refresh();

  // ── Renderer contract ─────────────────────────────────────────────────────────
  return {
    setFocus(focusNode) {
      focus = focusNode;
      mergeContext = null;
      // Selection: keep the chosen minimum highlighted through the swap step;
      // clear it at the start of a new round's "find min" step.
      if (stype === 'selection') selMin = (focusNode && focusNode.minIdx != null) ? focusNode.minIdx : null;
      refresh();
    },
    setPickable(b) {
      pickable = b;
      if (!b) picked = null;
      refresh();
    },
    markPicked(idx) { picked = idx; refresh(); },
    onSettle(step, expected) {
      const m = step.meta || {};
      if (stype === 'bubble') {
        if (expected === 'swap') {
          const li = m.leftIdx, ri = m.rightIdx;
          [currentArr[li], currentArr[ri]] = [currentArr[ri], currentArr[li]];
        }
        // One element settles at the tail only when a full PASS completes — i.e.
        // after the pass's last comparison (leftIdx === n-2-pass), not every step.
        if (m.leftIdx === n - 2 - m.pass) sortedFrom = n - 1 - m.pass;
      }
      if (stype === 'selection') {
        const r = m.boundary ?? m.round ?? 0;
        if (m.phase === 'swap') {
          const minIdx = m.minIdx;
          if (r !== minIdx) [currentArr[r], currentArr[minIdx]] = [currentArr[minIdx], currentArr[r]];
          sortedUpTo = r + 1;
          selMin = null;
        } else {
          selMin = expected;   // reveal the chosen min; the swap happens on the next step
        }
      }
      picked = null;
      if (!(stype === 'selection' && m.phase === 'min')) focus = null;  // keep min highlight context
      mergeContext = null;
      refresh();
    },
    finishView() {
      pickable = false; focus = null; picked = null; mergeContext = null;
      if (stype === 'bubble') sortedFrom = 0;
      if (stype === 'selection') sortedUpTo = n;
      refresh();
    },
  };
}

// ── Merge-sort renderer ─────────────────────────────────────────────────────────
// Two aligned rows over the original positions 0..n-1:
//   「來源」 — the two sorted halves of the active segment [lo..hi] (left | right),
//             with the two compared cells (li / ri pointers) highlighted.
//   「結果」 — the merged output accumulating left-to-right; the next slot to fill
//             is highlighted. When a merge finishes, its result is written back
//             into `work`, becoming the input to the next (larger) merge.
function canonicalMerge(left, right) {
  const out = []; let l = 0, r = 0;
  while (l < left.length && r < right.length) out.push(left[l] <= right[r] ? left[l++] : right[r++]);
  while (l < left.length) out.push(left[l++]);
  while (r < right.length) out.push(right[r++]);
  return out;
}

function createMergeRenderer(arr, n, stage) {
  // ── Build the recursive structure from n (split rule: half = floor(len/2)) ──
  const divideLevels = [];          // top → singletons; each = list of [lo,hi]
  const segLevel = new Map();       // "lo-hi" → divide-level index (for the merge row)
  let cur = [[0, n - 1]];
  divideLevels.push(cur);
  cur.forEach(([lo, hi]) => segLevel.set(lo + '-' + hi, 0));
  while (cur.some(([lo, hi]) => hi > lo)) {
    const next = [];
    for (const [lo, hi] of cur) {
      if (hi > lo) { const mid = lo + Math.floor((hi - lo + 1) / 2) - 1; next.push([lo, mid], [mid + 1, hi]); }
      else next.push([lo, hi]);
    }
    cur = next;
    const lvl = divideLevels.length;
    divideLevels.push(cur);
    cur.forEach(([lo, hi]) => { const key = lo + '-' + hi; if (!segLevel.has(key)) segLevel.set(key, lvl); });
  }
  const k = divideLevels.length - 1;   // last divide level = all singletons

  // Row plan: divide rows 0..k (top half), then merge rows for levels k-1..0.
  const rows = [];
  for (let d = 0; d <= k; d++) rows.push({ kind: 'divide', segs: divideLevels[d], label: d === 0 ? '原始' : (d === k ? '切到剩 1 個' : 'Divide') });
  for (let d = k - 1; d >= 0; d--) rows.push({ kind: 'merge', level: d, segs: divideLevels[d], label: d === 0 ? '合併完成' : 'Merge' });
  const mergeRowIndex = (d) => (k + 1) + (k - 1 - d);   // row index of merge level d

  // ── State ──
  const nodeVals = new Map();        // "lo-hi" → sorted values (results known so far)
  for (let i = 0; i < n; i++) nodeVals.set(i + '-' + i, [arr[i]]);
  let active = null;                 // { lo, mid, hi, li, ri, placePos }
  let finished = false;

  function commit(seg) {
    if (!seg) return;
    const left = nodeVals.get(seg.lo + '-' + seg.mid) || [];
    const right = nodeVals.get((seg.mid + 1) + '-' + seg.hi) || [];
    nodeVals.set(seg.lo + '-' + seg.hi, canonicalMerge(left, right));
  }

  // ── DOM ──
  const grid = document.createElement('div');
  grid.className = 'merge-tree';
  grid.style.gridTemplateColumns = `auto repeat(${n}, 40px)`;
  stage.appendChild(grid);

  const chip = (v, cls) => `<span class="mt-chip ${cls || ''}">${v === '' || v == null ? '' : v}</span>`;
  function chips(values, base, childPtr) {
    return values.map((v, t) => {
      let c = base;
      if (childPtr != null) { if (t < childPtr) c += ' consumed'; else if (t === childPtr) c += ' cand'; }
      return chip(v, c);
    }).join('');
  }

  function render() {
    const aKey = active ? active.lo + '-' + active.hi : null;
    const parentRow = active ? mergeRowIndex(segLevel.get(aKey)) : -1;
    const childRow = parentRow - 1;
    let html = '';
    rows.forEach((row, rIdx) => {
      html += `<div class="mt-rowlabel" style="grid-row:${rIdx + 1}; grid-column:1">${row.label}</div>`;
      for (const [lo, hi] of row.segs) {
        const key = lo + '-' + hi;
        const span = `grid-row:${rIdx + 1}; grid-column:${lo + 2} / ${hi + 3}`;
        // Is this segment a candidate-child of the active merge (in the row above it)?
        let childPtr = null;
        if (active && !finished && rIdx === childRow) {
          if (lo === active.lo && hi === active.mid) childPtr = active.li;
          else if (lo === active.mid + 1 && hi === active.hi) childPtr = active.ri;
        }
        let cls = 'mt-seg', inner = '';
        if (row.kind === 'divide') {
          inner = chips(arr.slice(lo, hi + 1), 'ctx', childPtr);
          cls += ' divide';
        } else if (rIdx === parentRow && key === aKey && !finished) {
          // the active merge node — partial result + target slot
          const merged = canonicalMerge(nodeVals.get(active.lo + '-' + active.mid) || [], nodeVals.get((active.mid + 1) + '-' + active.hi) || []);
          const placed = active.placePos - lo;
          const out = [];
          for (let t = 0; t <= hi - lo; t++) out.push(t < placed ? chip(merged[t], 'done') : (t === placed ? chip('?', 'target') : chip('', 'empty')));
          inner = out.join(''); cls += ' active';
        } else if (finished || (nodeVals.has(key) && segLevel.get(key) === row.level)) {
          inner = chips(nodeVals.get(key), 'done', childPtr); cls += ' done';
        } else {
          for (let t = 0; t <= hi - lo; t++) inner += chip('', 'empty'); cls += ' pending';
        }
        html += `<div class="${cls}" style="${span}">${inner}</div>`;
      }
    });
    grid.innerHTML = html;
  }
  render();

  return {
    setFocus(f) {
      if (!f || typeof f !== 'object' || !('lo' in f)) return;
      if (!active || active.lo !== f.lo || active.hi !== f.hi) commit(active);  // bake previous merge
      active = f; render();
    },
    setPickable() {},
    markPicked() {},
    onSettle() { /* visuals derive from each step's focusNode via setFocus */ },
    finishView() { commit(active); active = null; finished = true; render(); },
  };
}
