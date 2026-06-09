// ════════════════════════════════════════════════════════════════════════════
//  Binary Search Tree — model, layout, and a delete TRACE stepper (NO DOM).
//  Node ids ARE their values (BST forbids duplicates, so values are unique).
//  The delete trace emits atomic steps for the generic trace-engine: descend
//  (choose-dir), classify the case, then resolve (pick replacement / successor /
//  state the new value / classify the successor removal).
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build a BST by inserting `values` in order.
 * @returns {{root:number|null, nodes:Map<number,{id,value,left,right,parent}>}}
 */
export function buildBST(values) {
  const nodes = new Map();
  let root = null;
  for (const v of values) {
    nodes.set(v, { id: v, value: v, left: null, right: null, parent: null });
    if (root === null) { root = v; continue; }
    let cur = root, parent = null, dir = 'left';
    while (cur !== null) {
      parent = cur;
      const node = nodes.get(cur);
      if (v < node.value) { dir = 'left'; cur = node.left; }
      else { dir = 'right'; cur = node.right; }
    }
    nodes.get(parent)[dir] = v;
    nodes.get(v).parent = parent;
  }
  return { root, nodes };
}

export function treeDepth(tree) {
  const rec = (id) => id === null ? -1 : 1 + Math.max(rec(tree.nodes.get(id).left), rec(tree.nodes.get(id).right));
  return rec(tree.root);
}

/**
 * Layout: x by in-order rank, y by depth, both normalised to 0..1.
 * In-order rank guarantees no horizontal overlap for arbitrary BSTs.
 * @returns {Map<number,{x:number,y:number}>}
 */
export function layoutTree(tree) {
  const ranks = new Map();
  let rank = 0;
  (function inorder(id, depth) {
    if (id === null) return;
    const n = tree.nodes.get(id);
    inorder(n.left, depth + 1);
    ranks.set(id, { rank: rank++, depth });
    inorder(n.right, depth + 1);
  })(tree.root, 0);

  const count = ranks.size;
  const maxDepth = treeDepth(tree);
  const pos = new Map();
  for (const [id, r] of ranks) {
    pos.set(id, {
      x: count <= 1 ? 0.5 : (r.rank + 0.5) / count,
      y: maxDepth <= 0 ? 0.5 : (r.depth + 0.6) / (maxDepth + 1),
    });
  }
  return pos;
}

function classify(node) {
  const c = (node.left !== null ? 1 : 0) + (node.right !== null ? 1 : 0);
  return c === 0 ? 'leaf' : c === 1 ? 'one' : 'two';
}

/**
 * Produce the atomic-step trace for deleting `target` from `tree`.
 * Assumes `target` exists in the tree.
 * @returns {{target:number, foundId:number, klass:string, steps:Array}}
 */
export function bstDeleteTrace(tree, target) {
  const N = tree.nodes;
  const steps = [];

  // ── Phase: search (choose-dir at each visited node until found) ──
  let cur = tree.root, k = 0;
  while (cur !== null) {
    const node = N.get(cur);
    const ans = node.value === target ? 'found' : (target < node.value ? 'left' : 'right');
    steps.push({
      key: `search-${k}`, phase: 'search', kind: 'choose-dir',
      prompt: `在節點 ${node.value}:目標 ${target} 該往哪走?`,
      focusNode: cur,
      options: [
        { value: 'left',  label: '往左子樹' },
        { value: 'right', label: '往右子樹' },
        { value: 'found', label: '就是這個（找到）' },
      ],
      answer: ans,
    });
    if (ans === 'found') break;
    cur = ans === 'left' ? node.left : node.right;
    k++;
  }
  const foundId = cur;
  const found = N.get(foundId);
  const klass = classify(found);

  // ── Phase: classify the deletion case ──
  steps.push({
    key: 'classify', phase: 'classify', kind: 'classify',
    prompt: `節點 ${found.value} 屬於哪一種刪除情況?`,
    focusNode: foundId,
    options: [
      { value: 'leaf', label: '葉節點（無子節點）' },
      { value: 'one',  label: '一個子節點' },
      { value: 'two',  label: '兩個子節點' },
    ],
    answer: klass,
  });

  // ── Phase: resolve (branches by case) ──
  if (klass === 'one') {
    const childId = found.left !== null ? found.left : found.right;
    steps.push({
      key: 'replace', phase: 'resolve', kind: 'pick-node',
      prompt: `哪個節點會接上來取代被刪的 ${found.value}?（在右圖點該節點）`,
      focusNode: foundId,
      answer: childId,
    });
  } else if (klass === 'two') {
    // inorder successor = leftmost node of the right subtree
    let s = found.right;
    while (N.get(s).left !== null) s = N.get(s).left;
    const succ = N.get(s);
    steps.push({
      key: 'successor', phase: 'resolve', kind: 'pick-node',
      prompt: `中序後繼(右子樹的最左節點)是哪個?（點該節點）`,
      focusNode: foundId,
      answer: s,
    });
    steps.push({
      key: 'newvalue', phase: 'resolve', kind: 'number',
      prompt: `把後繼值複製過來後,原本 ${found.value} 的位置會放上哪個值?`,
      focusNode: foundId,
      answer: succ.value,
    });
    steps.push({
      key: 'succ-case', phase: 'resolve', kind: 'classify',
      prompt: `接著要移除後繼節點 ${succ.value}。它(必無左子)屬哪種情況?`,
      focusNode: s,
      options: [
        { value: 'leaf', label: '葉節點' },
        { value: 'one',  label: '一個子節點（右）' },
      ],
      answer: succ.right !== null ? 'one' : 'leaf',
    });
  }
  // leaf case: search + classify steps are enough (removal is unconditional).

  return { target, foundId, klass, steps };
}
