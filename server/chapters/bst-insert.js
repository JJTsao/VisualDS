import { buildInsertInstance } from '../../shared/algorithms/bst-insert.js';

export const meta = { id: 'bst-insert', title: 'BST 插入', n: 8 };

export function generate(seed) {
  const { instance, steps } = buildInsertInstance(seed);
  return { instance, steps };
}
