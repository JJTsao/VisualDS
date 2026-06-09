// ════════════════════════════════════════════════════════════════════════════
//  Random BST instance generator (NO DOM). Seedable & reproducible.
//  Picks a delete target that exercises an interesting case (two-children when
//  available, else one-child, else a leaf) so the question isn't trivial.
// ════════════════════════════════════════════════════════════════════════════

import { makeRng } from './graph-gen.js';
import { buildBST } from './bst.js';

const CASE_OF = (node) => {
  const c = (node.left !== null ? 1 : 0) + (node.right !== null ? 1 : 0);
  return c === 0 ? 'leaf' : c === 1 ? 'one' : 'two';
};

/**
 * @param {object} opts
 * @param {number} opts.n        node count (distinct values)
 * @param {number} opts.maxV     values drawn from 1..maxV
 * @param {number} opts.seed     PRNG seed
 * @param {string} opts.prefer   preferred target case: 'two' | 'one' | 'leaf'
 * @returns {{values:number[], target:number, seed:number}}
 */
export function generateBST({ n = 8, maxV = 99, seed = 1, prefer = 'two' } = {}) {
  const rng = makeRng(seed);

  // Distinct random values.
  const set = new Set();
  while (set.size < n) set.add(1 + Math.floor(rng() * maxV));
  const values = [...set];

  // Shuffle insertion order so the tree shape varies (not a sorted chain).
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }

  // Inspect the resulting tree to choose a good target.
  const tree = buildBST(values);
  const byCase = { two: [], one: [], leaf: [] };
  for (const node of tree.nodes.values()) byCase[CASE_OF(node)].push(node.value);

  const order = [prefer, 'two', 'one', 'leaf'];
  let pool = [];
  for (const c of order) { if (byCase[c] && byCase[c].length) { pool = byCase[c]; break; } }
  const target = pool[Math.floor(rng() * pool.length)];

  return { values, target, seed };
}
