'use strict';

// ─── Layout Constants ─────────────────────────────────────────────────────────
// Vertical gap between levels is fixed; horizontal gap halves with depth via
// the recursive boundary algorithm (passing a [minX, maxX] range to children).
const LEVEL_HEIGHT   = 90;   // px between parent and child centres (y-axis)
const PADDING_TOP    = 50;   // px from top of canvas to root centre
const PADDING_SIDE   = 32;   // px left/right margin inside canvas

// ─── Animation Pacing ─────────────────────────────────────────────────────────
const VISIT_DELAY_MS         = 420;  // amber pulse for insert/search descent
const TRAVERSE_STEP_MS       = 360;  // pause when a recursive call first enters a node
const VISIT_PULSE_MS         = 480;  // duration of the green "visit moment" flash
const FOUND_HOLD_MS          = 900;  // hold the green found-pulse before yielding
const MISS_HOLD_MS           = 700;  // duration of the red miss flash
// Phase 3 — deletion pacing
const TARGET_HOLD_MS         = 650;  // hold red on the to-be-deleted node
const SUCCESSOR_HOLD_MS      = 620;  // hold green on the in-order successor
const VALUE_SWAP_MS          = 560;  // value text scale-flash during Case 3 swap
const FADE_OUT_MS            = 500;  // node + edge fade-out duration
const EDGE_ANIM_MS           = 400;  // edge interpolation matches `.tree-node` transition

// ─── BST Node ─────────────────────────────────────────────────────────────────

class TreeNode {
  constructor(value) {
    this.value = value;
    this.left  = null;
    this.right = null;
    // Layout / DOM bookkeeping
    this.x     = 0;     // current centre-x in canvas px
    this.y     = 0;     // current centre-y in canvas px
    this.el    = null;  // <div> node DOM element
    this.edge  = null;  // <line> SVG element connecting this node to its parent
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  root:  null,
  count: 0,
  busy:  false,  // true while an insert animation is running
};

// ─── DOM References ───────────────────────────────────────────────────────────

const treeCanvas      = document.getElementById('tree-canvas');
const treeEdges       = document.getElementById('tree-edges');
const treeNodes       = document.getElementById('tree-nodes');
const treeEmpty       = document.getElementById('tree-empty-state');
const treeInfo        = document.getElementById('tree-info');
const valueInput      = document.getElementById('value-input');
const btnInsert       = document.getElementById('btn-insert');
const btnClear        = document.getElementById('btn-clear');
const btnClearConsole = document.getElementById('btn-clear-console');
const consoleOutput   = document.getElementById('console-output');

// Phase 2 + 3 controls
const searchInput     = document.getElementById('search-input');
const btnSearch       = document.getElementById('btn-search');
const btnDelete       = document.getElementById('btn-delete');
const btnPreorder     = document.getElementById('btn-preorder');
const btnInorder      = document.getElementById('btn-inorder');
const btnPostorder    = document.getElementById('btn-postorder');
const traversalOutput = document.getElementById('traversal-output');
const traversalMode   = document.getElementById('traversal-mode');

// Every control that must be disabled while an animation is in progress.
const ALL_CONTROLS = [
  btnInsert, btnClear, valueInput,
  btnSearch, btnDelete, searchInput,
  btnPreorder, btnInorder, btnPostorder,
];

// Marker classes applied to .tree-node during search / traversal / delete —
// cleared at the start of each new operation so previous runs don't bleed in.
const NODE_MARKER_CLASSES = [
  'tree-node-visit',
  'tree-node-active',
  'tree-node-visited',
  'tree-node-visited-done',
  'tree-node-found',
  'tree-node-miss',
  'tree-node-target',
  'tree-node-successor',
];

const SVG_NS = 'http://www.w3.org/2000/svg';

// ─── Console helpers ──────────────────────────────────────────────────────────

function logConsole(message, kind = 'info') {
  const placeholder = consoleOutput.querySelector('.console-line.dim');
  if (placeholder && placeholder.textContent.startsWith('// 輸入整數')) {
    placeholder.remove();
  }
  const prefix = { info: '  ', success: '✓ ', warn: '⚠ ', error: '✗ ', dim: '  ' }[kind] || '  ';
  const span = document.createElement('span');
  span.className = `console-line ${kind}`;
  span.textContent = prefix + message;
  consoleOutput.appendChild(span);
  consoleOutput.appendChild(document.createElement('br'));
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function clearConsoleOutput() {
  consoleOutput.innerHTML =
    '<span class="console-line dim">// 輸入整數並按下 INSERT 開始建立 BST...</span>';
}

// ─── Layout: recursive boundary algorithm ─────────────────────────────────────
// For each node, the available horizontal range [minX, maxX] is bisected:
//   - node sits at the centre of its range
//   - left child  inherits [minX, node.x]
//   - right child inherits [node.x, maxX]
// This makes the horizontal gap shrink (halve) per level — no overlap, but
// gets cramped at high depths; acceptable for Phase 1.

function layout(node, minX, maxX, depth) {
  if (!node) return;
  node.x = (minX + maxX) / 2;
  node.y = PADDING_TOP + depth * LEVEL_HEIGHT;
  layout(node.left,  minX,   node.x, depth + 1);
  layout(node.right, node.x, maxX,   depth + 1);
}

function recomputeLayout() {
  if (!state.root) return;
  const w = treeCanvas.clientWidth || 800;
  layout(state.root, PADDING_SIDE, w - PADDING_SIDE, 0);
  applyPositions(state.root);
  updateEdges(state.root);
}

function applyPositions(node) {
  if (!node) return;
  node.el.style.left = node.x + 'px';
  node.el.style.top  = node.y + 'px';
  applyPositions(node.left);
  applyPositions(node.right);
}

function setEdgeCoords(line, parent, child) {
  line.setAttribute('x1', parent.x);
  line.setAttribute('y1', parent.y);
  line.setAttribute('x2', child.x);
  line.setAttribute('y2', child.y);
}

/**
 * Walk the tree and ease each existing edge from its current SVG attribute
 * values to the new (parent, child) coords. Pairs visually with the
 * `transition: left, top` on `.tree-node`, so nodes and edges glide together.
 */
function updateEdges(node) {
  if (!node) return;
  if (node.left  && node.left.edge)  animateEdgeTo(node.left.edge,  node, node.left);
  if (node.right && node.right.edge) animateEdgeTo(node.right.edge, node, node.right);
  updateEdges(node.left);
  updateEdges(node.right);
}

function animateEdgeTo(line, parent, child) {
  // Source = whatever the line currently shows (may be stale, mid-anim, etc.).
  const fromX1 = parseFloat(line.getAttribute('x1')) || parent.x;
  const fromY1 = parseFloat(line.getAttribute('y1')) || parent.y;
  const fromX2 = parseFloat(line.getAttribute('x2')) || child.x;
  const fromY2 = parseFloat(line.getAttribute('y2')) || child.y;

  const toX1 = parent.x, toY1 = parent.y;
  const toX2 = child.x,  toY2 = child.y;

  // No movement → snap and skip animation.
  if (fromX1 === toX1 && fromY1 === toY1 && fromX2 === toX2 && fromY2 === toY2) {
    return;
  }

  // Cancel any in-flight rAF for this edge so the new target wins.
  if (line._rafId) cancelAnimationFrame(line._rafId);

  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / EDGE_ANIM_MS);
    // Smoothstep / ease-in-out cubic for an organic glide.
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    line.setAttribute('x1', fromX1 + (toX1 - fromX1) * e);
    line.setAttribute('y1', fromY1 + (toY1 - fromY1) * e);
    line.setAttribute('x2', fromX2 + (toX2 - fromX2) * e);
    line.setAttribute('y2', fromY2 + (toY2 - fromY2) * e);
    if (t < 1) line._rafId = requestAnimationFrame(tick);
    else       line._rafId = null;
  }
  line._rafId = requestAnimationFrame(tick);
}

// ─── DOM creation: node + edge ────────────────────────────────────────────────

function createNodeEl(node) {
  const el = document.createElement('div');
  el.className = 'tree-node';
  el.innerHTML = `<span class="tree-node-value">${node.value}</span>`;
  treeNodes.appendChild(el);
  node.el = el;
}

function spawnNodeAnimation(node) {
  node.el.classList.add('tree-node-spawn');
  setTimeout(() => node.el.classList.remove('tree-node-spawn'), 500);
}

function createEdge(parent, child) {
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('class', 'tree-edge');
  setEdgeCoords(line, parent, child);
  treeEdges.appendChild(line);
  child.edge = line;

  // Draw-in animation via stroke-dashoffset.
  const len = Math.hypot(child.x - parent.x, child.y - parent.y);
  line.style.strokeDasharray  = len;
  line.style.strokeDashoffset = len;
  // Force layout commit so the transition fires on the next frame.
  void line.getBoundingClientRect();
  requestAnimationFrame(() => {
    line.style.transition       = 'stroke-dashoffset 0.4s ease';
    line.style.strokeDashoffset = '0';
  });
  // Clean up dash styling once the animation finishes — otherwise a later
  // re-layout that lengthens this edge would render it truncated by the
  // stale dasharray pattern.
  setTimeout(() => {
    line.style.transition       = '';
    line.style.strokeDasharray  = '';
    line.style.strokeDashoffset = '';
  }, 480);
}

// ─── Async helpers ────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function visitAnimate(node) {
  // Force re-trigger if class already present (e.g. ancestor re-visited).
  node.el.classList.remove('tree-node-visit');
  void node.el.offsetWidth;
  node.el.classList.add('tree-node-visit');
  await sleep(VISIT_DELAY_MS);
  node.el.classList.remove('tree-node-visit');
}

// ─── Insert ───────────────────────────────────────────────────────────────────

async function insertValue(rawValue) {
  if (state.busy) return;

  const parsed = parseIntStrict(rawValue);
  if (!parsed.ok) {
    if (parsed.reason === 'empty') logConsole('Please enter a value first.', 'warn');
    else                           logConsole(`Invalid integer: "${rawValue}"`, 'error');
    return;
  }
  const value = parsed.value;

  state.busy = true;
  setControlsDisabled(true);
  resetNodeStates();

  try {
    // Case 1: empty tree → place new root.
    if (state.root === null) {
      const node = new TreeNode(value);
      createNodeEl(node);
      state.root  = node;
      state.count = 1;
      treeEmpty.classList.add('hidden');
      recomputeLayout();
      spawnNodeAnimation(node);
      logConsole(`Root inserted: ${value}`, 'success');
      updateInfo();
      return;
    }

    // Case 2: traverse to find insertion point, animating each visit.
    let curr   = state.root;
    let parent = null;
    let dir    = '';
    const path = [];

    while (curr !== null) {
      await visitAnimate(curr);
      path.push(curr.value);
      if (value === curr.value) {
        logConsole(`Value ${value} already exists — duplicates rejected.`, 'warn');
        return;
      }
      parent = curr;
      if (value < curr.value) { dir = 'left';  curr = curr.left;  }
      else                    { dir = 'right'; curr = curr.right; }
    }

    // Found the insertion slot — link, lay out, animate.
    const newNode = new TreeNode(value);
    parent[dir]   = newNode;
    createNodeEl(newNode);
    state.count++;
    recomputeLayout();
    createEdge(parent, newNode);
    spawnNodeAnimation(newNode);
    logConsole(
      `Inserted ${value} as ${dir} child of ${parent.value}  [path: ${path.join(' → ')} → ${value}]`,
      'success'
    );
    updateInfo();
  } finally {
    setControlsDisabled(false);
    state.busy = false;
    valueInput.focus();
    valueInput.select();
  }
}

// ─── Clear ────────────────────────────────────────────────────────────────────

function clearTree() {
  if (state.busy) return;
  state.root  = null;
  state.count = 0;
  treeNodes.innerHTML = '';
  while (treeEdges.firstChild) treeEdges.removeChild(treeEdges.firstChild);
  treeEmpty.classList.remove('hidden');
  clearTraversalOutput();
  logConsole('Tree cleared.', 'dim');
  updateInfo();
  valueInput.focus();
}

// ─── Traversal output bar ────────────────────────────────────────────────────

function clearTraversalOutput() {
  traversalOutput.innerHTML =
    '<span class="traversal-placeholder">— traversal not started —</span>';
  setTraversalMode('');
}

function setTraversalMode(kind) {
  const labels = { pre: 'PRE-ORDER', in: 'IN-ORDER', post: 'POST-ORDER' };
  traversalMode.textContent = labels[kind] || '';
}

function appendTraversalToken(value) {
  const placeholder = traversalOutput.querySelector('.traversal-placeholder');
  if (placeholder) placeholder.remove();
  const token = document.createElement('span');
  token.className   = 'traversal-token';
  token.textContent = value;
  traversalOutput.appendChild(token);
  // Keep the most-recently visited token in view as the sequence grows.
  token.scrollIntoView({ behavior: 'smooth', inline: 'end', block: 'nearest' });
}

// ─── Marker helpers (one shared definition per visual state) ─────────────────

function flashCanvasMiss() {
  // Re-trigger via reflow in case a previous flash class is still on the canvas.
  treeCanvas.classList.remove('tree-canvas-miss');
  void treeCanvas.offsetWidth;
  treeCanvas.classList.add('tree-canvas-miss');
  setTimeout(() => treeCanvas.classList.remove('tree-canvas-miss'), 750);
}

/**
 * The "visit moment" — green flash + append to output. Caller is responsible
 * for adding .tree-node-active before/around this; we remove it so the green
 * animation isn't visually fighting the amber active pulse.
 */
async function markVisited(node) {
  node.el.classList.remove('tree-node-active');
  // Re-trigger if the same node was previously visited (shouldn't happen in a
  // single traversal pass, but cheap insurance).
  node.el.classList.remove('tree-node-visited');
  void node.el.offsetWidth;
  node.el.classList.add('tree-node-visited');
  appendTraversalToken(node.value);
  await sleep(VISIT_PULSE_MS);
  // Promote to the persistent "done" state so the traversal trail remains
  // visible while the recursion continues into siblings / ancestors.
  node.el.classList.remove('tree-node-visited');
  node.el.classList.add('tree-node-visited-done');
}

async function markFound(node) {
  node.el.classList.add('tree-node-found');
  await sleep(FOUND_HOLD_MS);
  // Leave the found class on; resetNodeStates() clears it at the next op.
}

async function markMiss(node) {
  if (node) {
    node.el.classList.add('tree-node-miss');
    setTimeout(() => node.el.classList.remove('tree-node-miss'), MISS_HOLD_MS);
  }
  flashCanvasMiss();
  await sleep(MISS_HOLD_MS);
}

// ─── Search / Delete shared descent ──────────────────────────────────────────
// Iterative BST descent, mirroring how a student would trace the property by
// hand: at each node compare → smaller goes left, larger goes right. Each
// visited node gets the amber pulse from Phase 1. Shared by `searchValue`
// and `deleteValue`'s Step 1 (find target).

/**
 * Walk down from `root` looking for `value`, awaiting visitAnimate on each
 * node. Returns:
 *   { node, parent, last, path }
 *     node   — matching node, or null if not found
 *     parent — parent of `node` (null when node is root, or when not found)
 *     last   — last node visited (used for miss flash)
 *     path   — array of values in visit order
 */
async function findNodeWithPath(root, value) {
  let curr   = root;
  let parent = null;
  let last   = null;
  const path = [];
  while (curr !== null) {
    await visitAnimate(curr);
    path.push(curr.value);
    last = curr;
    if (curr.value === value) return { node: curr, parent, last, path };
    parent = curr;
    curr = value < curr.value ? curr.left : curr.right;
  }
  return { node: null, parent: null, last, path };
}

async function searchValue(rawValue) {
  if (state.busy) return;

  const parsed = parseIntStrict(rawValue);
  if (!parsed.ok) {
    if (parsed.reason === 'empty') logConsole('Enter a value to search.', 'warn');
    else                           logConsole(`Invalid integer: "${rawValue}"`, 'error');
    return;
  }
  const value = parsed.value;

  if (state.root === null) {
    logConsole('Tree is empty — nothing to search.', 'warn');
    flashCanvasMiss();
    return;
  }

  state.busy = true;
  setControlsDisabled(true);
  resetNodeStates();

  try {
    const { node, last, path } = await findNodeWithPath(state.root, value);
    if (node) {
      await markFound(node);
      logConsole(`Found ${value} after visiting [${path.join(' → ')}].`, 'success');
    } else {
      await markMiss(last);
      logConsole(`${value} not found. Path: [${path.join(' → ')} → null].`, 'error');
    }
  } finally {
    setControlsDisabled(false);
    state.busy = false;
    searchInput.focus();
    searchInput.select();
  }
}

// ─── Traversals (Pre / In / Post) ────────────────────────────────────────────
// All three are recursive async functions sharing the same skeleton:
//
//   1. Mark this node "active" (it's now on the call stack).
//   2. Pause briefly so the user sees the descent.
//   3. At the type-specific visit point, run markVisited():
//        - PRE:   before any recursion          (root, L, R)
//        - IN:    between left and right calls  (L, root, R)
//        - POST:  after both recursions         (L, R, root)
//      markVisited removes "active" and transitions to "visited-done".
//
// Each recursive call awaits its children, so child animations are sequenced.

async function preorder(node) {
  if (!node) return;
  node.el.classList.add('tree-node-active');
  await sleep(TRAVERSE_STEP_MS);
  await markVisited(node);          // visit BEFORE children
  await preorder(node.left);
  await preorder(node.right);
}

async function inorder(node) {
  if (!node) return;
  node.el.classList.add('tree-node-active');
  await sleep(TRAVERSE_STEP_MS);
  await inorder(node.left);
  await markVisited(node);          // visit BETWEEN children
  await inorder(node.right);
}

async function postorder(node) {
  if (!node) return;
  node.el.classList.add('tree-node-active');
  await sleep(TRAVERSE_STEP_MS);
  await postorder(node.left);
  await postorder(node.right);
  await markVisited(node);          // visit AFTER children
}

async function runTraversal(kind) {
  if (state.busy) return;
  if (state.root === null) {
    logConsole('Tree is empty — nothing to traverse.', 'warn');
    return;
  }
  const fn = { pre: preorder, in: inorder, post: postorder }[kind];
  if (!fn) return;

  state.busy = true;
  setControlsDisabled(true);
  resetNodeStates();
  clearTraversalOutput();
  setTraversalMode(kind);

  const descLabel = {
    pre:  'PRE-ORDER  (root → L → R)',
    in:   'IN-ORDER   (L → root → R)',
    post: 'POST-ORDER (L → R → root)',
  }[kind];
  logConsole(`Starting ${descLabel} traversal...`, 'info');

  try {
    await fn(state.root);
    const seq = Array.from(traversalOutput.querySelectorAll('.traversal-token'))
      .map(t => t.textContent)
      .join(', ');
    logConsole(`Traversal complete: [${seq}]`, 'success');
  } finally {
    setControlsDisabled(false);
    state.busy = false;
  }
}

// ─── Delete (Phase 3) ────────────────────────────────────────────────────────
// Three structural cases:
//   1. Leaf            — drop the node + its incoming edge.
//   2. One child       — bypass the node; the surviving child's edge is
//                        re-targeted to (parent → child) by recomputeLayout.
//   3. Two children    — replace target's value with the in-order successor
//                        (leftmost of right subtree), then recursively delete
//                        the successor (guaranteed Case 1 or 2).
//
// Root edge cases:
//   - Case 1 on root with no siblings → state.root = null, show empty state.
//   - Case 2 on root → state.root = surviving child; drop child's incoming
//                      edge (it has no parent now).
//   - Case 3 never deletes the root in the tree-structure sense — only its
//     value is overwritten; the successor (deeper in right subtree) is the
//     node that physically disappears.

/**
 * Red flash + hold on a node that's about to disappear. Acts as the
 * "Step 2" highlight described in the requirements.
 */
async function markDeletionTarget(node) {
  // Strip any prior state classes so the red animation runs cleanly.
  for (const cls of NODE_MARKER_CLASSES) node.el.classList.remove(cls);
  void node.el.offsetWidth;  // commit removal before re-adding
  node.el.classList.add('tree-node-target');
  await sleep(TARGET_HOLD_MS);
}

/** Green flash + hold on the in-order successor before its value is "moved up". */
async function markSuccessor(node) {
  for (const cls of NODE_MARKER_CLASSES) node.el.classList.remove(cls);
  void node.el.offsetWidth;
  node.el.classList.add('tree-node-successor');
  await sleep(SUCCESSOR_HOLD_MS);
}

/**
 * Walk leftward from `subtreeRoot` until we hit the leftmost node,
 * animating each visited node. Returns the successor and its parent
 * (which may be `target` itself if subtreeRoot has no left child).
 */
async function findInorderSuccessor(target) {
  let sp = target;
  let s  = target.right;
  await visitAnimate(s);
  while (s.left !== null) {
    sp = s;
    s  = s.left;
    await visitAnimate(s);
  }
  return { successor: s, successorParent: sp };
}

/**
 * Case-3 value swap. Animates a brief scale-flash on the displayed text
 * and updates the node's logical value mid-animation, so the user sees
 * the old digit grow → swap → settle on the new digit.
 */
async function swapValue(target, newValue) {
  const oldValue = target.value;
  target.value = newValue;
  const span = target.el.querySelector('.tree-node-value');
  span.classList.remove('tree-value-swap');
  void span.offsetWidth;
  span.classList.add('tree-value-swap');
  // Update text near the peak of the scale animation.
  setTimeout(() => { span.textContent = newValue; }, Math.round(VALUE_SWAP_MS * 0.45));
  await sleep(VALUE_SWAP_MS);
  span.classList.remove('tree-value-swap');
  logConsole(`Value swap: ${oldValue} ← ${newValue} (in-order successor)`, 'info');
}

/**
 * Begin the visual fade-out of a node and its incoming edge. The DOM is
 * detached after the animation completes. Returns immediately so the
 * caller can run recomputeLayout in parallel (so remaining nodes glide
 * to fill the gap while this node fades).
 */
function startFadeOut(node) {
  node.el.classList.add('tree-node-fade-out');
  if (node.edge) {
    node.edge.style.transition = 'opacity 0.5s ease';
    node.edge.style.opacity    = '0';
  }
  const elToRemove   = node.el;
  const edgeToRemove = node.edge;
  setTimeout(() => {
    if (elToRemove   && elToRemove.parentNode)   elToRemove.parentNode.removeChild(elToRemove);
    if (edgeToRemove && edgeToRemove.parentNode) edgeToRemove.parentNode.removeChild(edgeToRemove);
  }, FADE_OUT_MS + 60);
}

/** Helper for Cases 1 / 2 to rewire the parent's pointer past `node`. */
function bypassNode(node, parent, replacement) {
  if (parent === null) {
    state.root = replacement;
  } else if (parent.left === node) {
    parent.left = replacement;
  } else {
    parent.right = replacement;
  }
}

async function deleteCase1Leaf(node, parent) {
  // Detach from BST FIRST so recomputeLayout sees the new structure.
  bypassNode(node, parent, null);

  startFadeOut(node);  // fades the node and parent→node edge in the background

  if (state.root === null) treeEmpty.classList.remove('hidden');

  recomputeLayout();   // remaining nodes glide via CSS, edges via rAF
  await sleep(FADE_OUT_MS);
}

async function deleteCase2OneChild(node, parent) {
  const child = node.left !== null ? node.left : node.right;

  bypassNode(node, parent, child);

  if (parent === null) {
    // Child became root — it no longer has an incoming edge. Drop it.
    if (child.edge && child.edge.parentNode) {
      child.edge.parentNode.removeChild(child.edge);
    }
    child.edge = null;
  }
  // For non-root case, child.edge stays — recomputeLayout's updateEdges
  // walks the new tree and re-targets it from (parent → child).

  startFadeOut(node);
  recomputeLayout();
  await sleep(FADE_OUT_MS);
}

async function deleteCase3TwoChildren(target) {
  // 1. Find the in-order successor (leftmost node in right subtree).
  const { successor, successorParent } = await findInorderSuccessor(target);

  // 2. Highlight successor (green pulse).
  await markSuccessor(successor);

  // 3. Visually copy successor's value into target.
  await swapValue(target, successor.value);

  // 4. Clear target's red mark — its old value is gone, the node itself stays.
  target.el.classList.remove('tree-node-target');

  // 5. Recursively delete the successor. By construction it has no left
  //    child, so the recursion bottoms out in Case 1 or 2.
  await markDeletionTarget(successor);
  if (successor.right === null) {
    await deleteCase1Leaf(successor, successorParent);
  } else {
    await deleteCase2OneChild(successor, successorParent);
  }
}

async function deleteValue(rawValue) {
  if (state.busy) return;

  const parsed = parseIntStrict(rawValue);
  if (!parsed.ok) {
    if (parsed.reason === 'empty') logConsole('Enter a value to delete.', 'warn');
    else                           logConsole(`Invalid integer: "${rawValue}"`, 'error');
    return;
  }
  const value = parsed.value;

  if (state.root === null) {
    logConsole('Tree is empty — nothing to delete.', 'warn');
    flashCanvasMiss();
    return;
  }

  state.busy = true;
  setControlsDisabled(true);
  resetNodeStates();

  try {
    // Step 1 — animated search for the target.
    const { node, parent, last, path } = await findNodeWithPath(state.root, value);
    if (!node) {
      await markMiss(last);
      logConsole(
        `Cannot delete ${value} — not in tree. Path: [${path.join(' → ')} → null].`,
        'error'
      );
      return;
    }

    // Step 2 — flag the found node red ("about to be deleted").
    await markDeletionTarget(node);

    // Step 3 — dispatch on structural case.
    const hasLeft  = node.left  !== null;
    const hasRight = node.right !== null;
    let caseLabel;
    if (!hasLeft && !hasRight) {
      caseLabel = 'Case 1 (leaf)';
      await deleteCase1Leaf(node, parent);
    } else if (!hasLeft || !hasRight) {
      caseLabel = 'Case 2 (one child)';
      await deleteCase2OneChild(node, parent);
    } else {
      caseLabel = 'Case 3 (two children — successor swap)';
      await deleteCase3TwoChildren(node);
    }
    state.count--;
    updateInfo();
    logConsole(`Deleted ${value}. (${caseLabel})  Path: [${path.join(' → ')}].`, 'success');
  } finally {
    setControlsDisabled(false);
    state.busy = false;
    searchInput.focus();
    searchInput.select();
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function setControlsDisabled(disabled) {
  for (const el of ALL_CONTROLS) el.disabled = disabled;
}

/**
 * Strict integer parser used by both INSERT and SEARCH. Accepts an optional
 * leading + or -, rejects floats / text. Returns { ok, value } or
 * { ok: false, reason: 'empty' | 'invalid' }.
 */
function parseIntStrict(rawValue) {
  const trimmed = String(rawValue ?? '').trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  if (!/^[+-]?\d+$/.test(trimmed)) return { ok: false, reason: 'invalid' };
  return { ok: true, value: parseInt(trimmed, 10) };
}

/** Strip every per-operation marker class from every node in the tree. */
function resetNodeStates() {
  const nodeEls = treeNodes.querySelectorAll('.tree-node');
  for (const el of nodeEls) el.classList.remove(...NODE_MARKER_CLASSES);
}

function computeHeight(node) {
  if (!node) return 0;
  return 1 + Math.max(computeHeight(node.left), computeHeight(node.right));
}

function updateInfo() {
  const h = computeHeight(state.root);
  treeInfo.textContent = `nodes: ${state.count} · height: ${h}`;
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

btnInsert.addEventListener('click', () => insertValue(valueInput.value));
btnClear.addEventListener('click', clearTree);
btnClearConsole.addEventListener('click', clearConsoleOutput);

valueInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    insertValue(valueInput.value);
  }
});

// Phase 2 + 3: search / delete / traversal wiring
btnSearch.addEventListener('click',    () => searchValue(searchInput.value));
btnDelete.addEventListener('click',    () => deleteValue(searchInput.value));
btnPreorder.addEventListener('click',  () => runTraversal('pre'));
btnInorder.addEventListener('click',   () => runTraversal('in'));
btnPostorder.addEventListener('click', () => runTraversal('post'));

// Enter on the shared input defaults to SEARCH (non-destructive).
// Shift+Enter triggers DELETE for power users.
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) deleteValue(searchInput.value);
    else            searchValue(searchInput.value);
  }
});

// Re-flow on viewport resize so the tree stays centred and proportional.
let resizeRaf = 0;
window.addEventListener('resize', () => {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    recomputeLayout();
    resizeRaf = 0;
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────

updateInfo();
valueInput.focus();
