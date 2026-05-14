'use strict';

// ── Pacing ────────────────────────────────────────────────────────────────────
// Slider 1..100 → delay in ms via inverse mapping.
// Speed=1   → ~260ms (very slow), Speed=100 → ~3ms (lightning).
function speedToDelay(speed) {
  return Math.max(2, Math.round(260 * Math.pow(0.965, speed)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function delay() { return sleep(speedToDelay(state.speed)); }
async function delayMul(mul) { return sleep(Math.max(1, Math.round(speedToDelay(state.speed) * mul))); }

// ── Value range ───────────────────────────────────────────────────────────────
const MIN_VAL = 5;     // lower bound for generated values (so even smallest bar is visible)
const MAX_VAL = 100;   // upper bound (height %)

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  values:      [],     // current numeric values (rendered into bars)
  bars:        [],     // DOM references, parallel to values
  size:        30,
  speed:       50,
  algorithm:   'bubble',
  busy:        false,
  cancelled:   false,
  comparisons: 0,
  swaps:       0,
};

// ── Algorithm metadata ────────────────────────────────────────────────────────
const ALGORITHMS = {
  bubble: {
    label: 'BUBBLE SORT',
    desc:  '相鄰兩元素比較，較大者向右浮升 — 每輪確定一個尾端元素',
    big:   'O(N²)',
  },
  selection: {
    label: 'SELECTION SORT',
    desc:  '掃描未排序段找最小值，與當前位置交換 — 每輪鎖定一個首端元素',
    big:   'O(N²)',
  },
  insertion: {
    label: 'INSERTION SORT',
    desc:  '取一個 key，往左比較並把較大值右移，找到正確位置插入',
    big:   'O(N²)',
  },
  merge: {
    label: 'MERGE SORT',
    desc:  '遞迴對半切分，再以雙指針合併兩段已排序子陣列回原位置',
    big:   'O(N log N)',
  },
  quick: {
    label: 'QUICK SORT',
    desc:  'Lomuto partition：以末尾為 pivot，i 持守邊界 / j 掃描比 pivot 小的值',
    big:   'O(N log N) avg · O(N²) worst',
  },
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const stage          = document.getElementById('bars-stage');
const barsContainer  = document.getElementById('bars-container');
const stageInfo      = document.getElementById('stage-info');

const sizeSlider     = document.getElementById('size-slider');
const sizeValueLabel = document.getElementById('size-value');
const speedSlider    = document.getElementById('speed-slider');
const speedValueLabel= document.getElementById('speed-value');

const btnGenerate    = document.getElementById('btn-generate');
const btnSort        = document.getElementById('btn-sort');
const btnStop        = document.getElementById('btn-stop');
const btnClearConsole= document.getElementById('btn-clear-console');

const algoButtons    = Array.from(document.querySelectorAll('.algo-btn'));
const algoDescText   = document.getElementById('algo-desc-text');
const algoComplexity = document.getElementById('algo-complexity');

const statComparisons= document.getElementById('stat-comparisons');
const statSwaps      = document.getElementById('stat-swaps');
const statStatus     = document.getElementById('stat-status');

const consoleOutput  = document.getElementById('console-output');

// All controls disabled while sorting.
const LOCKABLE_CONTROLS = [
  sizeSlider, speedSlider, btnGenerate, btnSort, ...algoButtons,
];

// ── Console ───────────────────────────────────────────────────────────────────
function logLine(text, kind = 'info') {
  const span = document.createElement('span');
  span.className = `console-line ${kind}`;
  span.textContent = text;
  consoleOutput.appendChild(span);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}
function clearConsole() {
  consoleOutput.innerHTML = '<span class="console-line dim">// console cleared.</span>';
}

// ── Slider visual fill (linear gradient driven by --fill var) ─────────────────
function paintSlider(slider) {
  const min = Number(slider.min), max = Number(slider.max), val = Number(slider.value);
  const pct = ((val - min) / (max - min)) * 100;
  slider.style.setProperty('--fill', `${pct}%`);
}

// ── Random array generation ───────────────────────────────────────────────────
function generateValues(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push(MIN_VAL + Math.floor(Math.random() * (MAX_VAL - MIN_VAL + 1)));
  }
  return arr;
}

// ── Render bars from state.values ─────────────────────────────────────────────
function renderBars() {
  barsContainer.innerHTML = '';
  state.bars = [];

  // Toggle "narrow" mode — hide labels when bars get too thin
  if (state.size > 28) barsContainer.classList.add('bars-narrow');
  else                 barsContainer.classList.remove('bars-narrow');

  // Tighter gap when more bars
  if (state.size > 35)      barsContainer.style.gap = '1px';
  else if (state.size > 22) barsContainer.style.gap = '2px';
  else                       barsContainer.style.gap = '4px';

  for (let i = 0; i < state.values.length; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = `${state.values[i]}%`;

    const lbl = document.createElement('span');
    lbl.className = 'bar-value';
    lbl.textContent = state.values[i];
    bar.appendChild(lbl);

    barsContainer.appendChild(bar);
    state.bars.push(bar);
  }
  updateStageInfo();
}

function updateStageInfo() {
  const algoLabel = ALGORITHMS[state.algorithm].label;
  stageInfo.textContent = `${algoLabel} · n=${state.size}`;
}

function setBarValue(idx, val) {
  state.values[idx] = val;
  const bar = state.bars[idx];
  bar.style.height = `${val}%`;
  const lbl = bar.querySelector('.bar-value');
  if (lbl) lbl.textContent = val;
  // Quick write flash
  bar.classList.remove('bar-write');
  void bar.offsetWidth;
  bar.classList.add('bar-write');
}

// ── Bar state helpers ─────────────────────────────────────────────────────────
const STATE_CLASSES = ['bar-comparing', 'bar-swapping', 'bar-pivot', 'bar-range', 'bar-boundary'];

function addState(idx, cls) {
  if (idx < 0 || idx >= state.bars.length) return;
  state.bars[idx].classList.add(cls);
}
function removeState(idx, cls) {
  if (idx < 0 || idx >= state.bars.length) return;
  state.bars[idx].classList.remove(cls);
}
function clearTransient(idx) {
  if (idx < 0 || idx >= state.bars.length) return;
  state.bars[idx].classList.remove(...STATE_CLASSES);
}
function clearAllTransient() {
  for (let i = 0; i < state.bars.length; i++) clearTransient(i);
}
function markSorted(idx) {
  if (idx < 0 || idx >= state.bars.length) return;
  state.bars[idx].classList.remove(...STATE_CLASSES);
  state.bars[idx].classList.add('bar-sorted');
}

// ── Counters ──────────────────────────────────────────────────────────────────
function incComparisons() {
  state.comparisons++;
  statComparisons.textContent = state.comparisons;
}
function incSwaps() {
  state.swaps++;
  statSwaps.textContent = state.swaps;
}
function resetCounters() {
  state.comparisons = 0;
  state.swaps = 0;
  statComparisons.textContent = '0';
  statSwaps.textContent = '0';
}

// ── Status ────────────────────────────────────────────────────────────────────
function setStatus(text, kind = 'idle') {
  statStatus.textContent = text;
  statStatus.classList.toggle('busy', kind === 'busy');
  if (kind === 'idle')   statStatus.style.color = 'var(--success)';
  if (kind === 'busy')   statStatus.style.color = 'var(--amber-bright)';
  if (kind === 'done')   statStatus.style.color = 'var(--success)';
  if (kind === 'cancel') statStatus.style.color = 'var(--warn)';
}

// ── Lock / unlock controls during sort ────────────────────────────────────────
function setBusy(busy) {
  state.busy = busy;
  for (const el of LOCKABLE_CONTROLS) el.disabled = busy;
  btnStop.disabled = !busy;
}

// ── Cancellable sleep — throws if user hit STOP ───────────────────────────────
async function step() {
  if (state.cancelled) throw new Error('cancelled');
  await delay();
}
async function stepMul(m) {
  if (state.cancelled) throw new Error('cancelled');
  await delayMul(m);
}

// ── Swap two bar values (heights + labels), with red flash ────────────────────
async function visualSwap(i, j) {
  if (i === j) return;
  addState(i, 'bar-swapping');
  addState(j, 'bar-swapping');
  await stepMul(0.6);

  const tmp = state.values[i];
  setBarValue(i, state.values[j]);
  setBarValue(j, tmp);
  incSwaps();

  await stepMul(0.7);
  removeState(i, 'bar-swapping');
  removeState(j, 'bar-swapping');
}

// ── Compare animation: light up two indices, return their order ───────────────
async function visualCompare(i, j) {
  addState(i, 'bar-comparing');
  addState(j, 'bar-comparing');
  incComparisons();
  await step();
  // Caller decides what to do; they should clear comparing afterwards.
}

// ─────────────────────────────────────────────────────────────────────────────
// SORTING ALGORITHMS
// ─────────────────────────────────────────────────────────────────────────────

// 1. Bubble Sort
async function bubbleSort() {
  const a = state.values;
  const n = a.length;
  for (let pass = 0; pass < n - 1; pass++) {
    let swappedThisPass = false;
    for (let j = 0; j < n - 1 - pass; j++) {
      await visualCompare(j, j + 1);
      if (a[j] > a[j + 1]) {
        removeState(j, 'bar-comparing');
        removeState(j + 1, 'bar-comparing');
        await visualSwap(j, j + 1);
        swappedThisPass = true;
      } else {
        removeState(j, 'bar-comparing');
        removeState(j + 1, 'bar-comparing');
      }
    }
    // Tail of unsorted region is now in final place
    markSorted(n - 1 - pass);
    if (!swappedThisPass) {
      // Already sorted — mark remaining as sorted and bail.
      for (let k = 0; k < n - 1 - pass; k++) markSorted(k);
      return;
    }
  }
  markSorted(0);
}

// 2. Selection Sort
async function selectionSort() {
  const a = state.values;
  const n = a.length;
  for (let i = 0; i < n - 1; i++) {
    let minIdx = i;
    addState(minIdx, 'bar-pivot');         // current "best so far" = pivot color (purple)
    for (let j = i + 1; j < n; j++) {
      addState(j, 'bar-comparing');
      incComparisons();
      await step();
      if (a[j] < a[minIdx]) {
        // New min found — repaint old min back to default, mark j as new min
        removeState(minIdx, 'bar-pivot');
        removeState(j, 'bar-comparing');
        minIdx = j;
        addState(minIdx, 'bar-pivot');
      } else {
        removeState(j, 'bar-comparing');
      }
    }
    // Swap min into position i
    if (minIdx !== i) {
      removeState(minIdx, 'bar-pivot');
      await visualSwap(i, minIdx);
    } else {
      removeState(minIdx, 'bar-pivot');
    }
    markSorted(i);
  }
  markSorted(n - 1);
}

// 3. Insertion Sort
async function insertionSort() {
  const a = state.values;
  const n = a.length;

  if (n > 0) markSorted(0);  // first element trivially sorted

  for (let i = 1; i < n; i++) {
    const key = a[i];

    // Highlight the key being inserted
    state.bars[i].classList.remove('bar-sorted');
    addState(i, 'bar-pivot');
    await step();

    let j = i - 1;
    while (j >= 0) {
      addState(j, 'bar-comparing');
      incComparisons();
      await step();
      removeState(j, 'bar-comparing');

      if (a[j] > key) {
        // Shift a[j] one slot right into the "hole" at j+1
        state.bars[j + 1].classList.remove('bar-pivot', 'bar-sorted');
        setBarValue(j + 1, a[j]);
        incSwaps();
        markSorted(j + 1);    // shifted value belongs to the sorted prefix
        j--;
      } else {
        break;
      }
    }

    // Drop the key into its final spot
    const insertPos = j + 1;
    state.bars[insertPos].classList.remove('bar-pivot', 'bar-sorted');
    setBarValue(insertPos, key);
    markSorted(insertPos);
    await stepMul(0.4);
  }
}

// 4. Merge Sort (top-down recursive — visualised via merge-phase writes)
async function mergeSort() {
  await mergeSortRange(0, state.values.length - 1);
  // Mark all sorted
  for (let i = 0; i < state.values.length; i++) markSorted(i);
}

async function mergeSortRange(lo, hi) {
  if (lo >= hi) return;
  const mid = Math.floor((lo + hi) / 2);
  await mergeSortRange(lo, mid);
  await mergeSortRange(mid + 1, hi);
  await merge(lo, mid, hi);
}

async function merge(lo, mid, hi) {
  // Highlight the sub-range being merged (purple-ish "range" tint)
  for (let k = lo; k <= hi; k++) {
    state.bars[k].classList.remove('bar-sorted');
    addState(k, 'bar-range');
  }
  await stepMul(0.6);

  const left  = state.values.slice(lo, mid + 1);
  const right = state.values.slice(mid + 1, hi + 1);

  let i = 0, j = 0, k = lo;
  while (i < left.length && j < right.length) {
    incComparisons();
    // Briefly pulse the two source positions being compared
    const li = lo + i, rj = mid + 1 + j;
    addState(li, 'bar-comparing');
    addState(rj, 'bar-comparing');
    await step();
    removeState(li, 'bar-comparing');
    removeState(rj, 'bar-comparing');

    if (left[i] <= right[j]) {
      setBarValue(k, left[i]);
      i++;
    } else {
      setBarValue(k, right[j]);
      j++;
    }
    incSwaps();             // count merge writes
    k++;
    await stepMul(0.4);
  }
  while (i < left.length) {
    setBarValue(k, left[i]);
    incSwaps();
    i++; k++;
    await stepMul(0.3);
  }
  while (j < right.length) {
    setBarValue(k, right[j]);
    incSwaps();
    j++; k++;
    await stepMul(0.3);
  }

  // Range is now sorted *within itself* — flash range off, leave default tone.
  for (let p = lo; p <= hi; p++) removeState(p, 'bar-range');

  // If this merge produced the entire array, the outer call will mark sorted.
  // If it's a complete sub-segment of the final sort, leave as default for now.
}

// 5. Quick Sort (Lomuto partition, last element as pivot)
async function quickSort() {
  await quickSortRange(0, state.values.length - 1);
}

async function quickSortRange(lo, hi) {
  if (lo > hi) return;
  if (lo === hi) { markSorted(lo); return; }

  const p = await partition(lo, hi);
  markSorted(p);

  await quickSortRange(lo, p - 1);
  await quickSortRange(p + 1, hi);
}

async function partition(lo, hi) {
  const pivotIdx = hi;
  addState(pivotIdx, 'bar-pivot');
  await stepMul(0.6);

  const pivotVal = state.values[pivotIdx];
  let i = lo - 1;        // boundary

  for (let j = lo; j < hi; j++) {
    // i+1 marks the boundary of the "small" zone visually
    if (i + 1 >= lo && i + 1 < hi) addState(i + 1, 'bar-boundary');

    addState(j, 'bar-comparing');
    incComparisons();
    await step();

    if (state.values[j] < pivotVal) {
      i++;
      removeState(i, 'bar-boundary');
      removeState(j, 'bar-comparing');
      if (i !== j) {
        await visualSwap(i, j);
      } else {
        // No swap needed but still count the conceptual placement
        await stepMul(0.2);
      }
      if (i + 1 < hi) addState(i + 1, 'bar-boundary');
    } else {
      removeState(j, 'bar-comparing');
    }
  }

  // Clear boundary marker before final pivot swap
  if (i + 1 >= lo && i + 1 <= hi) removeState(i + 1, 'bar-boundary');

  // Place pivot in final position (i+1)
  removeState(pivotIdx, 'bar-pivot');
  if (i + 1 !== pivotIdx) await visualSwap(i + 1, pivotIdx);
  return i + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// DRIVERS
// ─────────────────────────────────────────────────────────────────────────────

const ALGO_RUNNERS = {
  bubble:    bubbleSort,
  selection: selectionSort,
  insertion: insertionSort,
  merge:     mergeSort,
  quick:     quickSort,
};

async function runSort() {
  if (state.busy) return;
  if (!state.values.length) {
    logLine('// no array — generate one first.', 'warn');
    return;
  }

  // Strip any previous sorted tint
  for (const bar of state.bars) {
    bar.classList.remove('bar-sorted', ...STATE_CLASSES, 'bar-finale', 'bar-write');
  }

  resetCounters();
  setBusy(true);
  state.cancelled = false;
  setStatus('SORTING...', 'busy');

  const meta = ALGORITHMS[state.algorithm];
  logLine(`▶ ${meta.label} · n=${state.values.length} · ${meta.big}`, 'declare');

  const t0 = performance.now();
  let cancelled = false;
  try {
    await ALGO_RUNNERS[state.algorithm]();
  } catch (e) {
    if (e && e.message === 'cancelled') {
      cancelled = true;
    } else {
      throw e;
    }
  }
  const dt = ((performance.now() - t0) / 1000).toFixed(2);

  clearAllTransient();

  if (cancelled) {
    setStatus('CANCELLED', 'cancel');
    logLine(`■ stopped after ${state.comparisons} comparisons / ${state.swaps} swaps`, 'warn');
  } else {
    // Make sure everything is marked sorted at the end
    for (let i = 0; i < state.bars.length; i++) markSorted(i);
    await playFinale();
    setStatus('SORTED', 'done');
    logLine(`✓ done in ${dt}s · ${state.comparisons} comparisons · ${state.swaps} writes`, 'success');
  }

  setBusy(false);
}

// Sequential green sweep across the bars after a successful sort.
async function playFinale() {
  const n = state.bars.length;
  if (!n) return;
  const stride = Math.max(8, Math.round(speedToDelay(state.speed) * 0.4));
  for (let i = 0; i < n; i++) {
    const bar = state.bars[i];
    bar.classList.remove('bar-finale');
    void bar.offsetWidth;
    bar.classList.add('bar-finale');
    await sleep(stride);
  }
}

function regenerateArray() {
  state.values = generateValues(state.size);
  renderBars();
  resetCounters();
  setStatus('READY', 'idle');
  logLine(`↻ generated new array — n=${state.size}`, 'info');
}

function selectAlgorithm(algo) {
  if (state.busy) return;
  state.algorithm = algo;
  for (const btn of algoButtons) {
    btn.classList.toggle('active', btn.dataset.algo === algo);
  }
  const meta = ALGORITHMS[algo];
  algoDescText.textContent = meta.desc;
  algoComplexity.textContent = meta.big;
  updateStageInfo();
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT WIRING
// ─────────────────────────────────────────────────────────────────────────────

sizeSlider.addEventListener('input', () => {
  state.size = Number(sizeSlider.value);
  sizeValueLabel.textContent = state.size;
  paintSlider(sizeSlider);
  if (!state.busy) regenerateArray();
});

speedSlider.addEventListener('input', () => {
  state.speed = Number(speedSlider.value);
  speedValueLabel.textContent = state.speed;
  paintSlider(speedSlider);
});

btnGenerate.addEventListener('click', () => {
  if (state.busy) return;
  regenerateArray();
});

btnSort.addEventListener('click', () => {
  runSort().catch((e) => { console.error(e); setBusy(false); });
});

btnStop.addEventListener('click', () => {
  if (!state.busy) return;
  state.cancelled = true;
  logLine('// stop requested...', 'warn');
});

btnClearConsole.addEventListener('click', clearConsole);

for (const btn of algoButtons) {
  btn.addEventListener('click', () => selectAlgorithm(btn.dataset.algo));
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────

paintSlider(sizeSlider);
paintSlider(speedSlider);
selectAlgorithm('bubble');
regenerateArray();
logLine('// dataset ready — adjust sliders, choose an algorithm, then SORT.', 'dim');
