// sorting.js — Bubble / Selection / Merge sort step tracers (NO DOM).
// Each stepper returns { steps, sorted } where `sorted` is the final array.

// ─── Bubble Sort ─────────────────────────────────────────────────────────────
// Each comparison step → classify: 'swap' or 'keep'.
// Early-termination: stop when a full pass produces no swaps.

export function bubbleSortSteps(arr) {
  const a = [...arr];
  const n = a.length;
  const steps = [];

  for (let pass = 0; pass < n - 1; pass++) {
    let swapped = false;
    for (let i = 0; i < n - 1 - pass; i++) {
      const needSwap = a[i] > a[i + 1];
      steps.push({
        key: `p${pass}-i${i}`,
        phase: `pass-${pass + 1}`,
        kind: 'classify',
        prompt: `第 ${pass + 1} 輪：比較右圖反白的 arr[${i}] 與 arr[${i + 1}] 兩格，需要交換嗎？`,
        options: [
          { value: 'swap', label: '交換 ↕' },
          { value: 'keep', label: '不交換（保留）' },
        ],
        answer: needSwap ? 'swap' : 'keep',
        focusNode: { leftIdx: i, rightIdx: i + 1 },
        meta: {
          pass, leftIdx: i, rightIdx: i + 1,
          leftVal: a[i], rightVal: a[i + 1],
          arr: [...a], sortedFrom: n - pass,
        },
      });
      if (needSwap) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; swapped = true; }
    }
    if (!swapped) break;
  }

  return { steps, sorted: a };
}

// ─── Selection Sort ───────────────────────────────────────────────────────────
// Each round → pick-node: click the cell holding the minimum in arr[r..n-1].

export function selectionSortSteps(arr) {
  const a = [...arr];
  const n = a.length;
  const steps = [];

  for (let r = 0; r < n - 1; r++) {
    let minIdx = r;
    for (let j = r + 1; j < n; j++) if (a[j] < a[minIdx]) minIdx = j;

    // Step ①: which cell holds the minimum of the unsorted region?
    steps.push({
      key: `round-${r}-min`,
      phase: `round-${r + 1}`,
      kind: 'pick-node',
      prompt: `第 ${r + 1} 輪：在未排序區間 arr[${r}..${n - 1}] 中，點選含有最小值的格子。`,
      answer: minIdx,
      focusNode: { sortedBoundary: r, mode: 'min' },
      meta: { round: r, boundary: r, phase: 'min', minIdx },
    });
    // Step ②: which cell does that minimum swap WITH? (the front of the unsorted region, arr[r])
    steps.push({
      key: `round-${r}-swap`,
      phase: `round-${r + 1}`,
      kind: 'pick-node',
      prompt: `已選出最小值。它要和「哪一格」交換？（點未排序區間最前面的那一格）`,
      answer: r,
      focusNode: { sortedBoundary: r, mode: 'swap', minIdx },
      meta: { round: r, boundary: r, phase: 'swap', minIdx },
    });

    if (r !== minIdx) [a[r], a[minIdx]] = [a[minIdx], a[r]];
  }

  return { steps, sorted: a };
}

// ─── Merge Sort ───────────────────────────────────────────────────────────────
// Traces every compare-and-take during all merge operations.
// Each step → classify: 'left' (take from left half) or 'right'.
// Stable: left wins ties. Stops asking when one side is exhausted.

export function mergeSortSteps(arr) {
  const steps = [];
  const work = [...arr];   // merges write the sorted segment back in place (bottom-up)
  let mergeId = 0;

  // Sort work[lo..hi] in place, emitting one decision step per merged position
  // (only while BOTH halves still have elements — the tail needs no decision).
  function rec(lo, hi) {
    if (lo >= hi) return;
    const half = Math.floor((hi - lo + 1) / 2);
    const mid = lo + half - 1;          // last index of the left half
    rec(lo, mid);
    rec(mid + 1, hi);

    const left = work.slice(lo, mid + 1);
    const right = work.slice(mid + 1, hi + 1);
    const id = mergeId++;
    let li = 0, ri = 0, placePos = lo;

    while (li < left.length && ri < right.length) {
      const takeLeft = left[li] <= right[ri];   // stable: left wins ties
      steps.push({
        key: `m${id}-pos${placePos}`,
        phase: `merge-${id + 1}`,
        kind: 'classify',
        prompt: `合併 arr[${lo}..${hi}]：比較「來源」列反白的左右兩格，較小者放進「結果」列的待填格（位置 ${placePos}）。取左還是取右？`,
        options: [
          { value: 'left',  label: '取左' },
          { value: 'right', label: '取右' },
        ],
        answer: takeLeft ? 'left' : 'right',
        focusNode: { lo, mid, hi, li, ri, placePos },
        meta: { lo, mid, hi, li, ri, placePos },
      });
      if (takeLeft) li++; else ri++;
      placePos++;
    }

    // Write the fully merged segment back into work (so the next, larger merge
    // reads the already-sorted sub-segments).
    const merged = [];
    let l2 = 0, r2 = 0;
    while (l2 < left.length && r2 < right.length) merged.push(left[l2] <= right[r2] ? left[l2++] : right[r2++]);
    while (l2 < left.length) merged.push(left[l2++]);
    while (r2 < right.length) merged.push(right[r2++]);
    for (let t = 0; t < merged.length; t++) work[lo + t] = merged[t];
  }

  rec(0, arr.length - 1);
  return { steps, sorted: work };
}
