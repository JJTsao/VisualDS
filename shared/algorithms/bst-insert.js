// bst-insert.js — BST insertion trace (NO DOM, browser + Node).
// Uses the same node model as bst.js (id === value, no duplicates).
// Produces atomic steps: at each visited node choose left/right;
// final step confirms which side of the parent the new value attaches to.

import { makeRng } from './graph-gen.js';
import { buildBST, layoutTree } from './bst.js';

// ─── Trace stepper ────────────────────────────────────────────────────────────

export function bstInsertTrace(tree, value) {
  const N = tree.nodes;
  const steps = [];

  if (tree.root === null) {
    steps.push({
      key: 'insert-root', phase: 'insert', kind: 'classify',
      prompt: `BST 是空的，插入值 ${value} 後它成為？`,
      focusNode: null,
      options: [{ value: 'root', label: '根節點 (root)' }],
      answer: 'root',
    });
    return { value, parentId: null, side: 'root', steps };
  }

  let cur = tree.root;
  let parent = null;
  let k = 0;

  while (cur !== null) {
    const node = N.get(cur);
    const ans = value < node.value ? 'left' : 'right';
    steps.push({
      key: `search-${k}`, phase: 'search', kind: 'choose-dir',
      prompt: `在節點 ${node.value}：插入值 ${value} 應往哪走？`,
      focusNode: cur,
      options: [
        { value: 'left',  label: '往左子樹' },
        { value: 'right', label: '往右子樹' },
      ],
      answer: ans,
    });
    parent = cur;
    const nextId = node[ans];
    cur = (nextId !== undefined && nextId !== null) ? nextId : null;
    k++;
  }

  const pNode = N.get(parent);
  const side = value < pNode.value ? 'left' : 'right';
  steps.push({
    key: 'insert-pos', phase: 'insert', kind: 'classify',
    prompt: `值 ${value} 成為節點 ${parent} 的？`,
    focusNode: parent,
    options: [
      { value: 'left',  label: '左子節點' },
      { value: 'right', label: '右子節點' },
    ],
    answer: side,
  });

  return { value, parentId: parent, side, steps };
}

// ─── Instance generator ───────────────────────────────────────────────────────

export function generateBSTInsert({ n = 8, maxV = 99, seed = 1 } = {}) {
  const rng = makeRng(seed);
  const set = new Set();
  while (set.size < n) set.add(1 + Math.floor(rng() * maxV));
  const values = [...set];

  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }

  const tree = buildBST(values);
  const existing = new Set(values);

  // Collect candidates not in tree, shuffle, pick one with path length 2..4
  const candidates = [];
  for (let v = 1; v <= maxV; v++) if (!existing.has(v)) candidates.push(v);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  let insertVal = candidates[0];
  for (const v of candidates) {
    let cur = tree.root, depth = 0;
    while (cur !== null) {
      const node = tree.nodes.get(cur);
      cur = v < node.value ? node.left : node.right;
      depth++;
    }
    if (depth >= 2 && depth <= 4) { insertVal = v; break; }
  }

  return { values, insertVal, seed };
}

// ─── Presentation builder ─────────────────────────────────────────────────────

export function buildInsertInstance(seed) {
  const inst  = generateBSTInsert({ n: 8, maxV: 99, seed });
  const tree  = buildBST(inst.values);
  const pos   = layoutTree(tree);
  const trace = bstInsertTrace(tree, inst.insertVal);

  const nodes = [];
  for (const node of tree.nodes.values()) {
    const p = pos.get(node.id);
    nodes.push({ value: node.value, x: p.x, y: p.y, parent: node.parent });
  }
  return {
    instance: { insertVal: inst.insertVal, nodes },
    steps: trace.steps,
  };
}
