'use strict';

// ─── Layout Constants ─────────────────────────────────────────────────────────
// Vertical gap between levels is fixed; horizontal gap halves with depth via
// the recursive boundary algorithm (passing a [minX, maxX] range to children).
const LEVEL_HEIGHT   = 90;   // px between parent and child centres (y-axis)
const PADDING_TOP    = 50;   // px from top of canvas to root centre
const PADDING_SIDE   = 32;   // px left/right margin inside canvas

// ─── Animation Pacing ─────────────────────────────────────────────────────────
const VISIT_DELAY_MS    = 420;  // amber pulse for insert/search descent
const TRAVERSE_STEP_MS  = 360;  // pause when a recursive call first enters a node
const VISIT_PULSE_MS    = 480;  // duration of the green "visit moment" flash
const FOUND_HOLD_MS     = 900;  // hold the green found-pulse before yielding
const MISS_HOLD_MS      = 700;  // duration of the red miss flash

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

// Phase 2 controls
const searchInput     = document.getElementById('search-input');
const btnSearch       = document.getElementById('btn-search');
const btnPreorder     = document.getElementById('btn-preorder');
const btnInorder      = document.getElementById('btn-inorder');
const btnPostorder    = document.getElementById('btn-postorder');
const traversalOutput = document.getElementById('traversal-output');
const traversalMode   = document.getElementById('traversal-mode');

// Every control that must be disabled while an animation is in progress.
const ALL_CONTROLS = [
  btnInsert, btnClear, valueInput,
  btnSearch, searchInput,
  btnPreorder, btnInorder, btnPostorder,
];

// Marker classes applied to .tree-node during search / traversal — cleared
// at the start of each new operation so previous runs don't bleed in.
const NODE_MARKER_CLASSES = [
  'tree-node-visit',
  'tree-node-active',
  'tree-node-visited',
  'tree-node-visited-done',
  'tree-node-found',
  'tree-node-miss',
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

function updateEdges(node) {
  if (!node) return;
  if (node.left  && node.left.edge)  setEdgeCoords(node.left.edge,  node, node.left);
  if (node.right && node.right.edge) setEdgeCoords(node.right.edge, node, node.right);
  updateEdges(node.left);
  updateEdges(node.right);
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

// ─── Search ──────────────────────────────────────────────────────────────────
// Iterative descent, mirroring how the user would trace the BST property by
// hand: at each node compare → smaller goes left, larger goes right. Each
// node visited gets the amber pulse from Phase 1; the terminal node gets
// either a sustained green (found) or a red flash (miss).

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
    let curr = state.root;
    let last = null;
    const path = [];

    while (curr !== null) {
      await visitAnimate(curr);
      path.push(curr.value);
      last = curr;

      if (curr.value === value) {
        await markFound(curr);
        logConsole(
          `Found ${value} after visiting [${path.join(' → ')}].`,
          'success'
        );
        return;
      }
      curr = value < curr.value ? curr.left : curr.right;
    }

    // Reached null without a match — last node is the parent of the missing slot.
    await markMiss(last);
    logConsole(
      `${value} not found. Path: [${path.join(' → ')} → null].`,
      'error'
    );
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

// Phase 2: search + traversal wiring
btnSearch.addEventListener('click',    () => searchValue(searchInput.value));
btnPreorder.addEventListener('click',  () => runTraversal('pre'));
btnInorder.addEventListener('click',   () => runTraversal('in'));
btnPostorder.addEventListener('click', () => runTraversal('post'));

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    searchValue(searchInput.value);
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
