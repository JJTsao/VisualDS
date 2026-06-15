import { generateArray } from '../../shared/algorithms/array-gen.js';
import { bubbleSortSteps } from '../../shared/algorithms/sorting.js';

export const meta = { id: 'bubble-sort', title: 'Bubble Sort', n: 6 };

export function generate(seed) {
  const { arr } = generateArray({ n: meta.n, seed });
  const { steps } = bubbleSortSteps(arr);
  return {
    instance: { arr, type: 'bubble' },
    steps,
  };
}
