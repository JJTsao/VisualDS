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
  mode:        'auto', // 'auto' = timed animation · 'step' = advance on click
  busy:        false,
  cancelled:   false,
  comparisons: 0,
  swaps:       0,
  stepCount:   0,      // number of discrete pause-points reached this run
  segGaps:     new Set(), // indices that start a new segment (merge sort divide)
  trayLeftBars:  [],   // merge tray — left[] mini-bar DOM elements
  trayRightBars: [],   // merge tray — right[] mini-bar DOM elements
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

// Step-through controls
const modeAuto       = document.getElementById('mode-auto');
const modeStep       = document.getElementById('mode-step');
const stepControls   = document.getElementById('step-controls');
const btnNext        = document.getElementById('btn-next');
const stageNarration = document.getElementById('stage-narration');
const narrationStep  = document.getElementById('narration-step');
const narrationText  = document.getElementById('narration-text');

// Merge tray (Phase B)
const mergeTray      = document.getElementById('merge-tray');
const trayGroupLeft  = document.getElementById('tray-group-left');
const trayGroupRight = document.getElementById('tray-group-right');
const trayLeftBars   = document.getElementById('tray-left-bars');
const trayRightBars  = document.getElementById('tray-right-bars');

const statComparisons= document.getElementById('stat-comparisons');
const statSwaps      = document.getElementById('stat-swaps');
const statStatus     = document.getElementById('stat-status');

const consoleOutput  = document.getElementById('console-output');

// All controls disabled while sorting. (Mode toggle stays enabled so the user
// can switch auto ⇄ step mid-run; NEXT is managed separately by the gate.)
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

  // Segment-gap width for merge sort's divide visualisation — smaller as n grows
  let segGap;
  if (state.size <= 16)      segGap = 28;
  else if (state.size <= 26) segGap = 20;
  else if (state.size <= 36) segGap = 13;
  else                        segGap = 9;
  barsContainer.style.setProperty('--seg-gap', `${segGap}px`);
  state.segGaps.clear();

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

// ── Segment gaps — visualise merge sort's recursive divide ────────────────────
// A gap "before index k" means bar[k] starts a fresh sub-array. Splits open
// gaps on the way down the recursion; merges close them on the way back up.
function openGap(idx) {
  if (idx <= 0 || idx >= state.bars.length) return;
  state.segGaps.add(idx);
  state.bars[idx].classList.add('bar-seg-start');
}
function closeGap(idx) {
  if (idx <= 0 || idx >= state.bars.length) return;
  state.segGaps.delete(idx);
  state.bars[idx].classList.remove('bar-seg-start');
}
function clearAllGaps() {
  state.segGaps.clear();
  for (const bar of state.bars) bar.classList.remove('bar-seg-start');
}

// ── Merge tray — visible auxiliary left[] / right[] arrays (Phase B) ──────────
// The merge step copies both halves into JS arrays; the tray renders them as
// mini-bars so the two-pointer comparison happens somewhere students can see.
function makeTrayBar(val, ptrLabel) {
  const bar = document.createElement('div');
  bar.className = 'tray-bar';
  bar.style.height = `${val}%`;
  const v = document.createElement('span');
  v.className = 'tray-bar-val';
  v.textContent = val;
  const p = document.createElement('span');
  p.className = 'tray-ptr';
  p.textContent = ptrLabel;
  bar.append(v, p);
  return bar;
}

function buildMergeTray(left, right) {
  trayLeftBars.innerHTML  = '';
  trayRightBars.innerHTML = '';
  state.trayLeftBars  = [];
  state.trayRightBars = [];

  // Group widths track element counts so bars stay uniform across both runs.
  trayGroupLeft.style.flex  = `${Math.max(1, left.length)} 1 0`;
  trayGroupRight.style.flex = `${Math.max(1, right.length)} 1 0`;
  trayLeftBars.classList.toggle('tray-bars-narrow', left.length > 16);
  trayRightBars.classList.toggle('tray-bars-narrow', right.length > 16);

  for (const val of left) {
    const bar = makeTrayBar(val, '▲ i');
    trayLeftBars.appendChild(bar);
    state.trayLeftBars.push(bar);
  }
  for (const val of right) {
    const bar = makeTrayBar(val, '▲ j');
    trayRightBars.appendChild(bar);
    state.trayRightBars.push(bar);
  }
  mergeTray.classList.add('tray-populated');
}

// Light up the current i / j candidates; pass -1 to skip a side (leftover copy).
function setTrayCandidates(i, j) {
  for (const b of state.trayLeftBars)  b.classList.remove('candidate');
  for (const b of state.trayRightBars) b.classList.remove('candidate');
  if (i >= 0 && state.trayLeftBars[i])  state.trayLeftBars[i].classList.add('candidate');
  if (j >= 0 && state.trayRightBars[j]) state.trayRightBars[j].classList.add('candidate');
}

// Mark a tray element as pulled into the output — green pop, then dim.
function markTrayChosen(side, idx) {
  const bar = (side === 'left' ? state.trayLeftBars : state.trayRightBars)[idx];
  if (!bar) return;
  bar.classList.remove('candidate', 'chosen');
  bar.classList.add('consumed');
  void bar.offsetWidth;          // restart the pop animation
  bar.classList.add('chosen');
}

function clearMergeTray() {
  trayLeftBars.innerHTML  = '';
  trayRightBars.innerHTML = '';
  state.trayLeftBars  = [];
  state.trayRightBars = [];
  mergeTray.classList.remove('tray-populated');
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
  if (!busy) {
    // Sort ended — make sure the step gate UI is reset.
    btnNext.disabled = true;
    btnNext.classList.remove('ready');
    stageNarration.classList.remove('awaiting');
  }
}

// ── Narration — the "what is happening right now" readout above the bars ──────
function narrate(text) {
  if (text) {
    narrationText.textContent = text;
    narrationText.classList.remove('idle');
  }
}
function setNarrationBadge(label) {
  narrationStep.textContent = label;
}
function resetNarration(text) {
  state.stepCount = 0;
  setNarrationBadge('IDLE');
  narrationText.textContent = text;
  narrationText.classList.add('idle');
  stageNarration.classList.remove('awaiting');
}

// ── Step gate — in step mode, a pause parks here until the user advances ──────
let stepGate = null;   // resolve fn of the currently-parked pause, or null

function gateStep() {
  return new Promise((resolve) => {
    stepGate = resolve;
    btnNext.disabled = false;
    btnNext.classList.add('ready');
    stageNarration.classList.add('awaiting');
  });
}
// Release a parked pause — fired by NEXT STEP, the keyboard, or a mode switch.
function releaseGate() {
  if (!stepGate) return;
  const resolve = stepGate;
  stepGate = null;
  btnNext.disabled = true;
  btnNext.classList.remove('ready');
  stageNarration.classList.remove('awaiting');
  resolve();
}

// ── Pause primitives ──────────────────────────────────────────────────────────
// Each call is one discrete "step": it bumps the counter, updates the narration,
// then either waits a timed delay (auto) or parks until the user advances (step).
// Throws 'cancelled' if STOP was pressed.
async function pause(desc, timedDelayFn) {
  if (state.cancelled) throw new Error('cancelled');
  state.stepCount++;
  setNarrationBadge(`STEP ${state.stepCount}`);
  narrate(desc);
  if (state.mode === 'step') {
    await gateStep();
    if (state.cancelled) throw new Error('cancelled');
  } else {
    await timedDelayFn();
  }
}
async function step(desc)            { return pause(desc, delay); }
async function stepMul(mul, desc)    { return pause(desc, () => delayMul(mul)); }

// ── Swap two bar values (heights + labels), with red flash ────────────────────
async function visualSwap(i, j) {
  if (i === j) return;
  addState(i, 'bar-swapping');
  addState(j, 'bar-swapping');
  await stepMul(0.6, `交換 a[${i}] 與 a[${j}]：${state.values[i]} ↔ ${state.values[j]}`);

  const tmp = state.values[i];
  setBarValue(i, state.values[j]);
  setBarValue(j, tmp);
  incSwaps();

  await stepMul(0.7, `↳ a[${i}] 與 a[${j}] 已交換`);
  removeState(i, 'bar-swapping');
  removeState(j, 'bar-swapping');
}

// ── Compare animation: light up two indices ───────────────────────────────────
async function visualCompare(i, j, desc) {
  addState(i, 'bar-comparing');
  addState(j, 'bar-comparing');
  incComparisons();
  await step(desc || `比較 a[${i}] 與 a[${j}]`);
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
      await visualCompare(j, j + 1, `第 ${pass + 1} 輪：比較 a[${j}]=${a[j]} 與 a[${j + 1}]=${a[j + 1]}`);
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
      await step(`掃描 a[${j}]=${a[j]}，目前最小值為 a[${minIdx}]=${a[minIdx]}`);
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
    await step(`取出 key = a[${i}] = ${key}，準備往左插入`);

    let j = i - 1;
    while (j >= 0) {
      addState(j, 'bar-comparing');
      incComparisons();
      await step(`key(${key}) 與 a[${j}]=${a[j]} 比較`);
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
    await stepMul(0.4, `key ${key} 插入 a[${insertPos}] — 左側 ${i + 1} 個元素已排序`);
  }
}

// 4. Merge Sort (top-down recursive — visualised via merge-phase writes)
async function mergeSort() {
  await mergeSortRange(0, state.values.length - 1);
  // Mark all sorted
  for (let i = 0; i < state.values.length; i++) markSorted(i);
}

async function mergeSortRange(lo, hi) {
  if (lo >= hi) return;   // single element — base case, already "sorted"
  const mid = Math.floor((lo + hi) / 2);

  // DIVIDE — open a visible gap so the two halves become distinct sub-arrays.
  openGap(mid + 1);
  const size = hi - lo + 1;
  await stepMul(0.5,
    `切分 [${lo}..${hi}]（${size} 個）→ 左段 [${lo}..${mid}] · 右段 [${mid + 1}..${hi}]`);

  await mergeSortRange(lo, mid);
  await mergeSortRange(mid + 1, hi);
  await merge(lo, mid, hi);
}

async function merge(lo, mid, hi) {
  // CONQUER — the two sorted sub-runs rejoin: close the gap that divide opened.
  closeGap(mid + 1);
  // Tint the destination range — these main-row slots are the merge output.
  for (let k = lo; k <= hi; k++) {
    state.bars[k].classList.remove('bar-sorted');
    addState(k, 'bar-range');
  }
  await stepMul(0.6, `合併子陣列 [${lo}..${mid}] 與 [${mid + 1}..${hi}]`);

  // Copy both halves into auxiliary arrays — and show them in the tray.
  const left  = state.values.slice(lo, mid + 1);
  const right = state.values.slice(mid + 1, hi + 1);
  buildMergeTray(left, right);
  await stepMul(0.5,
    `複製到輔助陣列 — left[] ${left.length} 個 · right[] ${right.length} 個`);

  let i = 0, j = 0, k = lo;

  // Two-pointer merge — both candidates are visible & coloured in the tray.
  while (i < left.length && j < right.length) {
    incComparisons();
    setTrayCandidates(i, j);
    await step(`比較 left[${i}]=${left[i]} 與 right[${j}]=${right[j]} — 取較小者`);

    let side, val;
    if (left[i] <= right[j]) { side = 'left';  val = left[i];  }
    else                     { side = 'right'; val = right[j]; }
    markTrayChosen(side, side === 'left' ? i : j);

    addState(k, 'bar-boundary');           // mark the write head on the main row
    setBarValue(k, val);
    incSwaps();
    await stepMul(0.4,
      `${side}[${side === 'left' ? i : j}]=${val} 較小 → 寫入 a[${k}]`);
    removeState(k, 'bar-boundary');

    if (side === 'left') i++; else j++;
    k++;
  }

  // Drain whichever run still has elements — all simply copied across.
  while (i < left.length) {
    setTrayCandidates(i, -1);
    addState(k, 'bar-boundary');
    setBarValue(k, left[i]);
    incSwaps();
    await stepMul(0.3, `left[] 剩餘 → 寫入 a[${k}] = ${left[i]}`);
    markTrayChosen('left', i);
    removeState(k, 'bar-boundary');
    i++; k++;
  }
  while (j < right.length) {
    setTrayCandidates(-1, j);
    addState(k, 'bar-boundary');
    setBarValue(k, right[j]);
    incSwaps();
    await stepMul(0.3, `right[] 剩餘 → 寫入 a[${k}] = ${right[j]}`);
    markTrayChosen('right', j);
    removeState(k, 'bar-boundary');
    j++; k++;
  }

  // Merge done — drop the range tint and clear the tray.
  for (let p = lo; p <= hi; p++) removeState(p, 'bar-range');
  clearMergeTray();
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
  const pivotVal = state.values[pivotIdx];
  addState(pivotIdx, 'bar-pivot');
  await stepMul(0.6, `分割 [${lo}..${hi}] — 選 pivot = a[${hi}] = ${pivotVal}`);

  let i = lo - 1;        // boundary

  for (let j = lo; j < hi; j++) {
    // i+1 marks the boundary of the "small" zone visually
    if (i + 1 >= lo && i + 1 < hi) addState(i + 1, 'bar-boundary');

    addState(j, 'bar-comparing');
    incComparisons();
    await step(`掃描 a[${j}]=${state.values[j]}，與 pivot ${pivotVal} 比較`);

    if (state.values[j] < pivotVal) {
      i++;
      removeState(i, 'bar-boundary');
      removeState(j, 'bar-comparing');
      if (i !== j) {
        await visualSwap(i, j);
      } else {
        // No swap needed but still count the conceptual placement
        await stepMul(0.2, `a[${j}] < pivot 且已在邊界 — 無需交換`);
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

  // Strip any previous sorted tint / leftover segment gaps
  for (const bar of state.bars) {
    bar.classList.remove('bar-sorted', ...STATE_CLASSES, 'bar-finale', 'bar-write', 'bar-seg-start');
  }
  state.segGaps.clear();

  resetCounters();
  state.stepCount = 0;
  setBusy(true);
  state.cancelled = false;
  setStatus('SORTING...', 'busy');

  const meta = ALGORITHMS[state.algorithm];
  logLine(`▶ ${meta.label} · n=${state.values.length} · ${meta.big}`, 'declare');
  setNarrationBadge('STEP 0');
  narrate(state.mode === 'step'
    ? `${meta.label} — 按 NEXT STEP 開始逐步執行`
    : `${meta.label} — 執行中…`);

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
  clearAllGaps();    // close any gaps left open by a cancelled merge sort
  clearMergeTray();  // empty the tray if a merge was interrupted

  if (cancelled) {
    setStatus('CANCELLED', 'cancel');
    logLine(`■ stopped after ${state.comparisons} comparisons / ${state.swaps} swaps`, 'warn');
    setNarrationBadge('STOP');
    narrate(`已停止 — 走到第 ${state.stepCount} 步`);
    narrationText.classList.add('idle');
  } else {
    // Make sure everything is marked sorted at the end
    for (let i = 0; i < state.bars.length; i++) markSorted(i);
    await playFinale();
    setStatus('SORTED', 'done');
    logLine(`✓ done in ${dt}s · ${state.comparisons} comparisons · ${state.swaps} writes`, 'success');
    setNarrationBadge('DONE');
    narrate(`排序完成 ✓ — 共 ${state.stepCount} 步 · ${state.comparisons} 次比較 · ${state.swaps} 次寫入`);
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
  resetNarration('// 新陣列已就緒 — 按下 SORT 開始');
  logLine(`↻ generated new array — n=${state.size}`, 'info');
}

// ── Execution mode (auto ⇄ step) ──────────────────────────────────────────────
function setMode(mode) {
  state.mode = mode;
  modeAuto.classList.toggle('active', mode === 'auto');
  modeStep.classList.toggle('active', mode === 'step');
  modeAuto.setAttribute('aria-pressed', String(mode === 'auto'));
  modeStep.setAttribute('aria-pressed', String(mode === 'step'));
  stepControls.classList.toggle('hidden', mode !== 'step');
  // Switching to AUTO mid-run: release any parked pause so it keeps flowing.
  if (mode === 'auto') releaseGate();
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

  // The merge tray only applies to merge sort — reserve its space when picked
  // (done outside a run so the main bars never rescale mid-sort).
  if (algo === 'merge') {
    mergeTray.classList.remove('hidden');
  } else {
    mergeTray.classList.add('hidden');
    clearMergeTray();
  }
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
  // If a step is parked waiting for NEXT, release it so the cancelled flag
  // can be observed and the algorithm can unwind.
  releaseGate();
});

btnClearConsole.addEventListener('click', clearConsole);

for (const btn of algoButtons) {
  btn.addEventListener('click', () => selectAlgorithm(btn.dataset.algo));
}

// Execution-mode toggle — switchable any time, even mid-sort.
modeAuto.addEventListener('click', () => setMode('auto'));
modeStep.addEventListener('click', () => setMode('step'));

// NEXT STEP — advance one parked pause.
btnNext.addEventListener('click', () => releaseGate());

// Keyboard: Space / → advance a step while step-sorting (no text inputs here).
window.addEventListener('keydown', (e) => {
  if (state.mode !== 'step' || !state.busy) return;
  if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'ArrowRight') {
    e.preventDefault();   // stop page-scroll / button re-trigger
    releaseGate();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────

paintSlider(sizeSlider);
paintSlider(speedSlider);
selectAlgorithm('bubble');
setMode('auto');
regenerateArray();
logLine('// dataset ready — adjust sliders, choose an algorithm, then SORT.', 'dim');
logLine('// tip: switch to STEP mode to advance one operation at a time.', 'dim');
