import { generateArray } from '../../shared/algorithms/array-gen.js';
import { selectionSortSteps } from '../../shared/algorithms/sorting.js';

export const meta = { id: 'selection-sort', title: 'Selection Sort', n: 6 };

export function generate(seed) {
  const { arr } = generateArray({ n: meta.n, seed });
  const { steps } = selectionSortSteps(arr);
  return {
    instance: { arr, type: 'selection' },
    steps,
  };
}
