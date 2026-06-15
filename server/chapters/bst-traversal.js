import { buildTraversalInstance } from '../../shared/algorithms/bst-traversal.js';

export const meta = { id: 'bst-traversal', title: 'BST 走訪', n: 7 };

export function generate(seed) {
  const { instance, steps } = buildTraversalInstance(seed);
  return { instance, steps };
}
