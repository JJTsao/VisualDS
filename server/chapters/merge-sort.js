import { generateArray } from '../../shared/algorithms/array-gen.js';
import { mergeSortSteps } from '../../shared/algorithms/sorting.js';

export const meta = { id: 'merge-sort', title: 'Merge Sort', n: 8 };

export function generate(seed) {
  const { arr } = generateArray({ n: meta.n, seed });
  const { steps } = mergeSortSteps(arr);
  return {
    instance: { arr, type: 'merge' },
    steps,
  };
}
