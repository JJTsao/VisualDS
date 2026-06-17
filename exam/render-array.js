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
      if (type === 'selection') return '提示：在未排序區間裡找到最小值所在格子。';
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
      if (stype === 'merge' && focusNode && 'leftArr' in focusNode) {
        mergeContext = focusNode;
      } else {
        mergeContext = null;
      }
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
        const r = m.round ?? 0;
        const minIdx = expected;  // the picked index
        if (r !== minIdx) {
          [currentArr[r], currentArr[minIdx]] = [currentArr[minIdx], currentArr[r]];
        }
        sortedUpTo = r + 1;
      }
      // merge-sort: no in-place update (just show comparison context)
      picked = null;
      focus = null;
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
  const work = [...arr];
  const grid = document.createElement('div');
  grid.className = 'merge-grid';
  grid.style.gridTemplateColumns = `auto repeat(${n}, 54px)`;
  stage.appendChild(grid);

  let active = null;        // { lo, mid, hi, li, ri, placePos } of the current merge
  let finished = false;

  function commit(seg) {    // write a completed merge's sorted values back into work
    if (!seg) return;
    const left = work.slice(seg.lo, seg.mid + 1);
    const right = work.slice(seg.mid + 1, seg.hi + 1);
    const merged = canonicalMerge(left, right);
    for (let t = 0; t < merged.length; t++) work[seg.lo + t] = merged[t];
  }

  function sourceCell(i) {
    if (finished) return `<div class="mg-cell done">${work[i]}</div>`;
    if (!active || i < active.lo || i > active.hi) return `<div class="mg-cell idle">${work[i]}</div>`;
    const { lo, mid, li, ri } = active;
    const isLeft = i <= mid;
    const candL = lo + li, candR = mid + 1 + ri;
    let cls = isLeft ? 'src-left' : 'src-right';
    if (i === candL || i === candR) cls += ' cand';
    else if ((isLeft && i < candL) || (!isLeft && i < candR)) cls += ' consumed';
    return `<div class="mg-cell ${cls}">${work[i]}</div>`;
  }

  function resultCell(i) {
    if (finished) return `<div class="mg-rcell filled">${work[i]}</div>`;
    if (!active || i < active.lo || i > active.hi) return `<div class="mg-rcell"></div>`;
    const { lo, mid, hi, placePos } = active;
    if (i < placePos) {
      const mergedFull = canonicalMerge(work.slice(lo, mid + 1), work.slice(mid + 1, hi + 1));
      return `<div class="mg-rcell filled">${mergedFull[i - lo]}</div>`;
    }
    if (i === placePos) return `<div class="mg-rcell target">?</div>`;
    return `<div class="mg-rcell"></div>`;
  }

  function render() {
    let html = `<div class="mg-label">來源</div>`;
    for (let i = 0; i < n; i++) html += sourceCell(i);
    html += `<div class="mg-label">結果</div>`;
    for (let i = 0; i < n; i++) html += resultCell(i);
    grid.innerHTML = html;
  }
  render();

  return {
    setFocus(f) {
      if (!f || typeof f !== 'object' || !('lo' in f)) return;
      // Entering a different segment ⇒ the previous merge is done; bake it in.
      if (!active || active.lo !== f.lo || active.hi !== f.hi) commit(active);
      active = f;
      render();
    },
    setPickable() {},
    markPicked() {},
    onSettle() { /* visuals derive from each step's focusNode via setFocus */ },
    finishView() { commit(active); active = null; finished = true; render(); },
  };
}
