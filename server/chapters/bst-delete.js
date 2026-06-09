// ════════════════════════════════════════════════════════════════════════════
//  Server-side chapter adapter: BST delete.
//  Wraps the shared (no-DOM) algorithm modules into the shape the server needs:
//    generate(seed) → { instance, steps, klass }
//  where `instance` is PURELY PRESENTATIONAL (no answers) and `steps` is the
//  full atomic-step trace WITH answers (kept server-side, never sent whole).
// ════════════════════════════════════════════════════════════════════════════

import { buildBST, layoutTree, bstDeleteTrace } from '../../shared/algorithms/bst.js';
import { generateBST } from '../../shared/algorithms/bst-gen.js';

export const meta = { id: 'bst-delete', title: 'BST 刪除', n: 9 };

export function generate(seed) {
  const inst  = generateBST({ n: meta.n, maxV: 99, seed, prefer: 'two' });
  const tree  = buildBST(inst.values);
  const pos   = layoutTree(tree);
  const trace = bstDeleteTrace(tree, inst.target);

  const nodes = [];
  for (const node of tree.nodes.values()) {
    const p = pos.get(node.id);
    nodes.push({ value: node.value, x: p.x, y: p.y, parent: node.parent });
  }
  // Presentational instance only — the delete answer is NOT derivable from this
  // alone (it lives in `steps`, which the server keeps).
  const instance = { target: inst.target, nodes };
  return { instance, steps: trace.steps, klass: trace.klass };
}
