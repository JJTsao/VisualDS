// array-gen.js — Random array generator for sorting exam chapters.

import { makeRng } from './graph-gen.js';

/**
 * Generate a random array of distinct integers.
 * Avoids nearly-sorted arrays so the exam has a reasonable number of steps.
 * @param {{ n?:number, minV?:number, maxV?:number, seed?:number }} opts
 * @returns {{ arr:number[], seed:number }}
 */
export function generateArray({ n = 6, minV = 10, maxV = 99, seed = 1 } = {}) {
  const rng = makeRng(seed);

  // Generate distinct values
  const set = new Set();
  while (set.size < n) set.add(minV + Math.floor(rng() * (maxV - minV + 1)));
  const arr = [...set];

  // Fisher-Yates shuffle
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  // Reject nearly-sorted arrays (inversion count < n): try a few seeds
  const inversions = arr.reduce((acc, v, i) => {
    for (let j = i + 1; j < arr.length; j++) if (arr[j] < v) acc++;
    return acc;
  }, 0);
  if (inversions < n && seed < 50) return generateArray({ n, minV, maxV, seed: seed + 7 });

  return { arr, seed };
}
