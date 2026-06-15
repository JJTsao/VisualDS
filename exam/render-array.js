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
  merge:     '陣列狀態 — Merge Sort（目前正在合併的兩個子陣列）',
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
      if (type === 'merge')     return '提示：比較兩側指標所指的元素，取較小者（平手取左）。';
      return '再試一次。';
    },
  };
}

// ─── Renderer factory ─────────────────────────────────────────────────────────

export function createSortingRenderer(instance, stage, { onPickNode }) {
  const arr = instance.arr;
  const n = arr.length;
  const stype = instance.type;

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
        // Update sorted boundary after each full pass
        sortedFrom = m.sortedFrom !== undefined ? m.sortedFrom - 1 : sortedFrom;
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
