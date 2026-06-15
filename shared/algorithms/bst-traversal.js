// bst-traversal.js — BST traversal trace (NO DOM, browser + Node).
// Supports inorder and preorder (most common in CS exams).
// Each step: student picks the next visited node.

import { makeRng } from './graph-gen.js';
import { buildBST, layoutTree } from './bst.js';

// ─── Trace stepper ────────────────────────────────────────────────────────────

export function bstTraversalSteps(tree, type = 'inorder') {
  const N = tree.nodes;
  const order = [];

  function inorder(id) {
    if (id === null || id === undefined) return;
    const n = N.get(id); if (!n) return;
    inorder(n.left); order.push(id); inorder(n.right);
  }
  function preorder(id) {
    if (id === null || id === undefined) return;
    const n = N.get(id); if (!n) return;
    order.push(id); preorder(n.left); preorder(n.right);
  }

  if (type === 'inorder') inorder(tree.root);
  else preorder(tree.root);

  const label = type === 'inorder' ? '中序 (In-order)' : '前序 (Pre-order)';

  const steps = order.map((id, k) => ({
    key: `visit-${k}`, phase: 'traversal', kind: 'pick-node',
    prompt: `${label} 走訪第 ${k + 1} 步：下一個拜訪的節點是？`,
    answer: id,
    focusNode: k > 0 ? order[k - 1] : null,
    meta: { step: k, type, visited: order.slice(0, k) },
  }));

  return { type, order, steps };
}

// ─── Instance generator ───────────────────────────────────────────────────────

export function generateBSTTraversal({ n = 7, maxV = 99, seed = 1 } = {}) {
  const rng = makeRng(seed);
  const set = new Set();
  while (set.size < n) set.add(1 + Math.floor(rng() * maxV));
  const values = [...set];

  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }

  // Alternate between inorder and preorder based on seed
  const type = rng() < 0.5 ? 'inorder' : 'preorder';

  return { values, type, seed };
}

// ─── Presentation builder ─────────────────────────────────────────────────────

export function buildTraversalInstance(seed) {
  const inst  = generateBSTTraversal({ n: 7, maxV: 99, seed });
  const tree  = buildBST(inst.values);
  const pos   = layoutTree(tree);
  const trace = bstTraversalSteps(tree, inst.type);

  const nodes = [];
  for (const node of tree.nodes.values()) {
    const p = pos.get(node.id);
    nodes.push({ value: node.value, x: p.x, y: p.y, parent: node.parent });
  }
  return {
    instance: { type: inst.type, nodes },
    steps: trace.steps,
  };
}
