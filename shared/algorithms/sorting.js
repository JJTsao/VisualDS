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
        prompt: `第 ${pass + 1} 輪，比較 arr[${i}]=${a[i]} 與 arr[${i + 1}]=${a[i + 1]}：`,
        options: [
          { value: 'swap', label: `交換（${a[i]} > ${a[i + 1]}）↕` },
          { value: 'keep', label: '不交換' },
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

    steps.push({
      key: `round-${r}`,
      phase: `round-${r + 1}`,
      kind: 'pick-node',
      prompt: `第 ${r + 1} 輪：在 arr[${r}..${n - 1}] 中，點選含有最小值的格子。`,
      answer: minIdx,
      focusNode: { sortedBoundary: r },
      meta: { round: r, arr: [...a], sortedBoundary: r, minIdx, minVal: a[minIdx] },
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
  let mergeId = 0;

  function mergeHalves(left, right) {
    const id = mergeId++;
    let li = 0, ri = 0;

    while (li < left.length && ri < right.length) {
      const takeLeft = left[li] <= right[ri]; // stable
      steps.push({
        key: `m${id}-pos${li + ri}`,
        phase: `merge-${id + 1}`,
        kind: 'classify',
        prompt: `合併 [${left.join(',')}] 和 [${right.join(',')}]：比較 ${left[li]}（左）vs ${right[ri]}（右），取哪邊？`,
        options: [
          { value: 'left',  label: `取左 (${left[li]})` },
          { value: 'right', label: `取右 (${right[ri]})` },
        ],
        answer: takeLeft ? 'left' : 'right',
        focusNode: { mergeId: id, leftArr: [...left], rightArr: [...right], li, ri },
        meta: { mergeId: id, li, ri, leftArr: [...left], rightArr: [...right] },
      });
      if (takeLeft) li++; else ri++;
    }

    // Perform actual merge to return sorted result
    const result = [];
    let l2 = 0, r2 = 0;
    while (l2 < left.length && r2 < right.length) {
      if (left[l2] <= right[r2]) result.push(left[l2++]); else result.push(right[r2++]);
    }
    while (l2 < left.length) result.push(left[l2++]);
    while (r2 < right.length) result.push(right[r2++]);
    return result;
  }

  function sortRec(a) {
    if (a.length <= 1) return [...a];
    const mid = Math.floor(a.length / 2);
    const left  = sortRec(a.slice(0, mid));
    const right = sortRec(a.slice(mid));
    return mergeHalves(left, right);
  }

  const sorted = sortRec([...arr]);
  return { steps, sorted };
}
