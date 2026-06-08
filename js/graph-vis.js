'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  Graph Visualizer — interactive builder + BFS / DFS / Dijkstra
//  Self-contained, no framework. Vertices are absolutely-positioned DOM circles
//  layered over an SVG edge canvas (same pattern as the BST unit). The graph is
//  undirected & weighted; the model of record is an adjacency list.
// ════════════════════════════════════════════════════════════════════════════

const SVG_NS = 'http://www.w3.org/2000/svg';
const NODE_RADIUS = 24;          // px — must match .graph-node width/height / 2
const INF = Infinity;

// ─── DOM References ─────────────────────────────────────────────────────────
const canvas        = document.getElementById('graph-canvas');
const edgesLayer    = document.getElementById('graph-edges');
const nodesLayer    = document.getElementById('graph-nodes');
const emptyState    = document.getElementById('graph-empty-state');
const graphInfo     = document.getElementById('graph-info');
const consoleOutput = document.getElementById('console-output');

const modeNodeBtn   = document.getElementById('mode-node');
const modeEdgeBtn   = document.getElementById('mode-edge');
const weightRandomBtn = document.getElementById('weight-random');
const weightPromptBtn = document.getElementById('weight-prompt');
const btnSample     = document.getElementById('btn-sample');
const btnClear      = document.getElementById('btn-clear');
const btnClearConsole = document.getElementById('btn-clear-console');

const speedSlider   = document.getElementById('speed-slider');
const speedValue    = document.getElementById('speed-value');
const btnBfs        = document.getElementById('btn-bfs');
const btnDfs        = document.getElementById('btn-dfs');
const btnDijkstra   = document.getElementById('btn-dijkstra');

const bannerEl      = document.getElementById('canvas-mode-banner');
const bannerText    = document.getElementById('mode-banner-text');
const outputContent = document.getElementById('output-content');
const outputMode    = document.getElementById('output-mode');

const statNodes     = document.getElementById('stat-nodes');
const statEdges     = document.getElementById('stat-edges');
const statStatus    = document.getElementById('stat-status');

// Every interactive control disabled while an algorithm animation runs.
const BUILD_CONTROLS = [
  modeNodeBtn, modeEdgeBtn, weightRandomBtn, weightPromptBtn,
  btnSample, btnClear, btnBfs, btnDfs, btnDijkstra,
];

// ─── State ──────────────────────────────────────────────────────────────────
const state = {
  nodes: new Map(),   // id -> { id, x, y, el, idEl, distEl }
  edges: [],          // { a, b, weight, line, label }
  adj: new Map(),     // id -> [ { to, weight, edge } ]
  nextId: 0,
  mode: 'node',       // 'node' | 'edge'
  weightMode: 'random', // 'random' | 'prompt'
  selected: null,     // node id awaiting its edge partner (edge mode)
  busy: false,        // an algorithm animation is running
};

// ─── Console helpers ──────────────────────────────────────────────────────────
function logConsole(message, kind = 'info') {
  const placeholder = consoleOutput.querySelector('.console-line.dim');
  if (placeholder && placeholder.textContent.startsWith('// 在右側畫布')) {
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
    '<span class="console-line dim">// 在右側畫布建立頂點與邊，再執行 BFS / DFS / Dijkstra...</span>';
}

// ─── Async pacing ─────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Speed slider (1..100) → delay (ms). 1% ≈ very slow, 100% ≈ snappy.
function stepDelay() {
  const pct = parseInt(speedSlider.value, 10);
  // 1 -> 1100ms, 50 -> ~600ms, 100 -> ~120ms
  return Math.round(1100 - (pct - 1) * (980 / 99));
}

// ─── Geometry ─────────────────────────────────────────────────────────────────
// Convert a viewport pointer event into canvas-local coordinates.
function canvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
  };
}

// ─── Node creation ──────────────────────────────────────────────────────────
function addNodeAt(x, y) {
  // Keep the node fully inside the canvas.
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const cx = Math.max(NODE_RADIUS + 2, Math.min(w - NODE_RADIUS - 2, x));
  const cy = Math.max(NODE_RADIUS + 2, Math.min(h - NODE_RADIUS - 2, y));

  const id = state.nextId++;
  const el = document.createElement('div');
  el.className = 'graph-node';
  el.style.left = cx + 'px';
  el.style.top  = cy + 'px';
  el.dataset.id = id;
  if (id === 0) el.classList.add('graph-node-start');

  const idEl = document.createElement('span');
  idEl.className = 'graph-node-id';
  idEl.textContent = id;

  const distEl = document.createElement('span');
  distEl.className = 'graph-node-dist';
  distEl.textContent = '∞';

  el.appendChild(idEl);
  el.appendChild(distEl);

  // Click on a node → edge-build interaction (only in edge mode, when idle).
  el.addEventListener('click', (e) => {
    e.stopPropagation();   // don't bubble to the canvas (which would add a node)
    onNodeClick(id);
  });

  nodesLayer.appendChild(el);
  el.classList.add('graph-node-spawn');
  setTimeout(() => el.classList.remove('graph-node-spawn'), 420);

  const node = { id, x: cx, y: cy, el, idEl, distEl };
  state.nodes.set(id, node);
  state.adj.set(id, []);

  emptyState.classList.add('hidden');
  updateInfo();
  logConsole(`Added node ${id} at (${Math.round(cx)}, ${Math.round(cy)}).`, 'success');
  return node;
}

// ─── Edge creation ──────────────────────────────────────────────────────────
function edgeExists(a, b) {
  return state.edges.some(e =>
    (e.a === a && e.b === b) || (e.a === b && e.b === a));
}

function addEdge(a, b, weight) {
  const na = state.nodes.get(a), nb = state.nodes.get(b);
  if (!na || !nb) return null;

  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('class', 'graph-edge');
  setLineCoords(line, na, nb);
  edgesLayer.appendChild(line);

  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('class', 'graph-edge-weight');
  label.textContent = weight;
  positionLabel(label, na, nb);
  edgesLayer.appendChild(label);

  const edge = { a, b, weight, line, label };
  state.edges.push(edge);

  // Undirected → record in both adjacency entries, sharing the same edge ref.
  state.adj.get(a).push({ to: b, weight, edge });
  state.adj.get(b).push({ to: a, weight, edge });

  updateInfo();
  return edge;
}

function setLineCoords(line, na, nb) {
  line.setAttribute('x1', na.x);
  line.setAttribute('y1', na.y);
  line.setAttribute('x2', nb.x);
  line.setAttribute('y2', nb.y);
}

function positionLabel(label, na, nb) {
  // Midpoint, nudged perpendicular to the edge so it doesn't sit on the line.
  const mx = (na.x + nb.x) / 2;
  const my = (na.y + nb.y) / 2;
  const dx = nb.x - na.x, dy = nb.y - na.y;
  const len = Math.hypot(dx, dy) || 1;
  const off = 11;                       // perpendicular offset in px
  const nx = -dy / len, ny = dx / len;  // unit normal
  label.setAttribute('x', mx + nx * off);
  label.setAttribute('y', my + ny * off);
}

// ─── Edge-build interaction (edge mode) ───────────────────────────────────────
function onNodeClick(id) {
  if (state.busy || state.mode !== 'edge') return;

  if (state.selected === null) {
    state.selected = id;
    state.nodes.get(id).el.classList.add('graph-node-selected');
    logConsole(`Edge: selected node ${id} — click a second node.`, 'info');
    return;
  }

  if (state.selected === id) {
    // Clicked the same node → cancel selection.
    state.nodes.get(id).el.classList.remove('graph-node-selected');
    state.selected = null;
    logConsole('Edge selection cancelled.', 'dim');
    return;
  }

  const a = state.selected, b = id;
  state.nodes.get(a).el.classList.remove('graph-node-selected');
  state.selected = null;

  if (edgeExists(a, b)) {
    logConsole(`Edge ${a}—${b} already exists.`, 'warn');
    return;
  }

  const weight = resolveWeight(a, b);
  if (weight === null) {                // user cancelled the prompt
    logConsole('Edge creation cancelled.', 'dim');
    return;
  }
  addEdge(a, b, weight);
  logConsole(`Added edge ${a}—${b} (weight ${weight}).`, 'success');
}

// Decide an edge weight based on the active weight mode.
function resolveWeight(a, b) {
  if (state.weightMode === 'prompt') {
    const fallback = randWeight();
    const raw = window.prompt(`Weight for edge ${a}—${b} (1–99):`, fallback);
    if (raw === null) return null;            // cancelled
    const n = parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(n) || n <= 0) {
      logConsole(`Invalid weight "${raw}" — using random ${fallback}.`, 'warn');
      return fallback;
    }
    return n;
  }
  return randWeight();
}

function randWeight() {
  return 1 + Math.floor(Math.random() * 20);   // 1..20
}

// ─── Clear / Sample ───────────────────────────────────────────────────────────
function clearGraph() {
  if (state.busy) return;
  state.nodes.clear();
  state.edges = [];
  state.adj.clear();
  state.nextId = 0;
  state.selected = null;
  nodesLayer.innerHTML = '';
  nodesLayer.classList.remove('dijkstra');
  while (edgesLayer.firstChild) edgesLayer.removeChild(edgesLayer.firstChild);
  emptyState.classList.remove('hidden');
  clearOutput();
  updateInfo();
  logConsole('Graph cleared.', 'dim');
}

// A small connected weighted graph so users can try algorithms instantly.
function loadSample() {
  if (state.busy) return;
  clearGraph();
  const W = canvas.clientWidth  || 800;
  const H = canvas.clientHeight || 520;
  // Relative layout (fractions of canvas) → 6 nodes in a rough ring + center.
  const pts = [
    [0.16, 0.30], [0.42, 0.16], [0.74, 0.26],
    [0.84, 0.66], [0.50, 0.82], [0.20, 0.70],
  ];
  pts.forEach(([fx, fy]) => addNodeAt(fx * W, fy * H));

  // Weighted edges forming a connected graph with alternate paths.
  const E = [
    [0, 1, 7], [0, 5, 4], [1, 2, 9], [1, 5, 6],
    [2, 3, 5], [3, 4, 8], [4, 5, 3], [2, 4, 11],
  ];
  E.forEach(([a, b, w]) => { if (!edgeExists(a, b)) addEdge(a, b, w); });
  logConsole('Loaded sample graph (6 nodes, 8 weighted edges).', 'info');
}

// ─── Mode + weight toggles ─────────────────────────────────────────────────────
function setMode(mode) {
  if (state.busy) return;
  state.mode = mode;
  const isNode = mode === 'node';
  modeNodeBtn.classList.toggle('active', isNode);
  modeEdgeBtn.classList.toggle('active', !isNode);
  modeNodeBtn.setAttribute('aria-pressed', String(isNode));
  modeEdgeBtn.setAttribute('aria-pressed', String(!isNode));
  canvas.classList.toggle('mode-edge', !isNode);
  canvas.classList.toggle('mode-node', isNode);

  // Cancel any pending edge selection when leaving edge mode.
  if (isNode && state.selected !== null) {
    const n = state.nodes.get(state.selected);
    if (n) n.el.classList.remove('graph-node-selected');
    state.selected = null;
  }
  updateBanner();
}

function setWeightMode(mode) {
  if (state.busy) return;
  state.weightMode = mode;
  const isRandom = mode === 'random';
  weightRandomBtn.classList.toggle('active', isRandom);
  weightPromptBtn.classList.toggle('active', !isRandom);
  weightRandomBtn.setAttribute('aria-pressed', String(isRandom));
  weightPromptBtn.setAttribute('aria-pressed', String(!isRandom));
}

function updateBanner() {
  bannerEl.classList.remove('edge', 'busy');
  if (state.busy) {
    bannerEl.classList.add('busy');
    bannerText.textContent = 'RUNNING — controls locked';
  } else if (state.mode === 'edge') {
    bannerEl.classList.add('edge');
    bannerText.textContent = 'ADD EDGE — 點兩個頂點建立邊';
  } else {
    bannerText.textContent = 'ADD NODE — 點畫布空白處新增頂點';
  }
}

// ─── Info / status ──────────────────────────────────────────────────────────
function updateInfo() {
  graphInfo.textContent = `nodes: ${state.nodes.size} · edges: ${state.edges.length}`;
  statNodes.textContent = state.nodes.size;
  statEdges.textContent = state.edges.length;
}

function setStatus(text, busy = false) {
  statStatus.textContent = text;
  statStatus.classList.toggle('busy', busy);
}

function setControlsDisabled(disabled) {
  for (const el of BUILD_CONTROLS) el.disabled = disabled;
}

// ─── Output bar (visited order / distances) ───────────────────────────────────
function clearOutput() {
  outputContent.innerHTML =
    '<span class="output-placeholder">— run an algorithm to see results —</span>';
  outputMode.textContent = '';
}

function setOutputMode(label) { outputMode.textContent = label; }

function appendOrderToken(value) {
  const placeholder = outputContent.querySelector('.output-placeholder');
  if (placeholder) placeholder.remove();
  const token = document.createElement('span');
  token.className = 'graph-token';
  token.textContent = value;
  outputContent.appendChild(token);
  token.scrollIntoView({ behavior: 'smooth', inline: 'end', block: 'nearest' });
}

function renderDistances(dist) {
  outputContent.innerHTML = '';
  const ids = [...state.nodes.keys()].sort((p, q) => p - q);
  for (const id of ids) {
    const card = document.createElement('span');
    const d = dist.get(id);
    const reachable = d !== INF;
    card.className = 'dist-card ' + (reachable ? 'reachable' : 'unreachable');
    card.innerHTML =
      `<span class="dc-node">${id}</span>` +
      `<span class="dc-val">${reachable ? d : '∞'}</span>`;
    outputContent.appendChild(card);
  }
}

// ─── Algorithm visual-state helpers ───────────────────────────────────────────
const NODE_STATE_CLASSES = [
  'graph-node-frontier', 'graph-node-current', 'graph-node-visited',
];
const EDGE_STATE_CLASSES = [
  'graph-edge-active', 'graph-edge-traversed', 'graph-edge-tree',
];

function resetAlgoStates() {
  for (const node of state.nodes.values()) {
    node.el.classList.remove(...NODE_STATE_CLASSES);
    node.distEl.classList.remove('dist-relaxed');
    node.distEl.textContent = '∞';
  }
  for (const edge of state.edges) {
    edge.line.classList.remove(...EDGE_STATE_CLASSES);
    edge.label.classList.remove('weight-active', 'weight-tree');
  }
  nodesLayer.classList.remove('dijkstra');
}

function markNode(id, cls) {
  const n = state.nodes.get(id);
  if (!n) return;
  n.el.classList.remove(...NODE_STATE_CLASSES);
  n.el.classList.add(cls);
}

// Sorted neighbour list (deterministic, ascending by id) for a vertex.
function neighbours(id) {
  return [...state.adj.get(id)].sort((p, q) => p.to - q.to);
}

// Find the adjacency record (carrying the edge ref) for a directed pair.
function adjRecord(from, to) {
  return state.adj.get(from).find(r => r.to === to) || null;
}

// ─── Algorithm preflight (shared) ─────────────────────────────────────────────
function beginAlgo(modeLabel) {
  state.busy = true;
  setControlsDisabled(true);
  resetAlgoStates();
  clearOutput();
  setOutputMode(modeLabel);
  setStatus('RUNNING…', true);
  canvas.classList.add('busy');
  updateBanner();
}

function endAlgo(doneLabel) {
  setControlsDisabled(false);
  state.busy = false;
  setStatus(doneLabel || 'DONE');
  canvas.classList.remove('busy');
  updateBanner();
}

// Guard shared by all three runners. Returns the start id (0) or null.
function algoStartId() {
  if (state.busy) return null;
  if (state.nodes.size === 0) {
    logConsole('Graph is empty — add some nodes first.', 'warn');
    return null;
  }
  if (!state.nodes.has(0)) {
    logConsole('Start node 0 is missing.', 'error');
    return null;
  }
  return 0;
}

// ─── BFS ──────────────────────────────────────────────────────────────────────
async function runBFS() {
  const start = algoStartId();
  if (start === null) return;

  beginAlgo('BFS');
  logConsole('BFS from node 0 — queue-based level-order expansion.', 'info');

  try {
    const visited = new Set();    // fully processed
    const queued  = new Set();    // discovered & in queue
    const queue   = [start];
    queued.add(start);
    markNode(start, 'graph-node-frontier');
    await sleep(stepDelay());

    const order = [];
    while (queue.length > 0) {
      const u = queue.shift();
      queued.delete(u);
      markNode(u, 'graph-node-current');
      await sleep(stepDelay());

      // Process u.
      visited.add(u);
      order.push(u);
      appendOrderToken(u);
      markNode(u, 'graph-node-visited');
      logConsole(`Visit ${u}  ·  queue=[${queue.join(', ')}]`, 'success');

      for (const { to: v, edge } of neighbours(u)) {
        if (visited.has(v) || queued.has(v)) continue;
        // Discover v — highlight the discovery edge + enqueue.
        await flashEdge(edge, 'graph-edge-active', stepDelay());
        edge.line.classList.add('graph-edge-traversed');
        queue.push(v);
        queued.add(v);
        markNode(v, 'graph-node-frontier');
      }
      await sleep(Math.round(stepDelay() * 0.4));
    }

    logConsole(`BFS complete. Order: [${order.join(' → ')}]`, 'success');
    endAlgo('BFS DONE');
  } catch (err) {
    logConsole(`BFS error: ${err.message}`, 'error');
    endAlgo('ERROR');
  }
}

// ─── DFS (recursive) ────────────────────────────────────────────────────────
async function runDFS() {
  const start = algoStartId();
  if (start === null) return;

  beginAlgo('DFS');
  logConsole('DFS from node 0 — recursive deep dive (call stack).', 'info');

  const visited = new Set();
  const order = [];

  async function dfs(u, parentEdge) {
    markNode(u, 'graph-node-current');
    await sleep(stepDelay());
    visited.add(u);
    order.push(u);
    appendOrderToken(u);
    if (parentEdge) parentEdge.line.classList.add('graph-edge-traversed');
    markNode(u, 'graph-node-visited');
    logConsole(`Visit ${u}  ·  depth-first descent`, 'success');

    for (const { to: v, edge } of neighbours(u)) {
      if (visited.has(v)) continue;
      await flashEdge(edge, 'graph-edge-active', stepDelay());
      // Re-mark u as current while we recurse so the active branch is clear.
      markNode(u, 'graph-node-current');
      await dfs(v, edge);
      // Back-tracked to u — restore its current highlight before next neighbour.
      markNode(u, 'graph-node-current');
      await sleep(Math.round(stepDelay() * 0.5));
    }
    // Done exploring u → settle back to visited.
    markNode(u, 'graph-node-visited');
  }

  try {
    await dfs(start, null);
    logConsole(`DFS complete. Order: [${order.join(' → ')}]`, 'success');
    endAlgo('DFS DONE');
  } catch (err) {
    logConsole(`DFS error: ${err.message}`, 'error');
    endAlgo('ERROR');
  }
}

// ─── Dijkstra ─────────────────────────────────────────────────────────────────
async function runDijkstra() {
  const start = algoStartId();
  if (start === null) return;

  beginAlgo('DIJKSTRA');
  nodesLayer.classList.add('dijkstra');   // reveal distance badges
  logConsole('Dijkstra from node 0 — distances start at ∞, source at 0.', 'info');

  try {
    const dist = new Map();
    const prev = new Map();        // id -> { from, edge }
    const visited = new Set();

    for (const id of state.nodes.keys()) {
      dist.set(id, INF);
      prev.set(id, null);
    }
    dist.set(start, 0);
    setDistLabel(start, 0, true);
    await sleep(stepDelay());

    while (true) {
      // Extract the unvisited vertex with the smallest tentative distance.
      let u = null, best = INF;
      for (const [id, d] of dist) {
        if (!visited.has(id) && d < best) { best = d; u = id; }
      }
      if (u === null) break;       // remaining vertices are unreachable

      visited.add(u);
      markNode(u, 'graph-node-current');
      logConsole(`Settle node ${u} (dist = ${best}).`, 'info');
      await sleep(stepDelay());

      for (const { to: v, weight, edge } of neighbours(u)) {
        if (visited.has(v)) continue;
        // Evaluate the edge u—v.
        edge.line.classList.add('graph-edge-active');
        edge.label.classList.add('weight-active');
        await sleep(stepDelay());

        const alt = dist.get(u) + weight;
        if (alt < dist.get(v)) {
          dist.set(v, alt);
          prev.set(v, { from: u, edge });
          setDistLabel(v, alt, true);
          markNode(v, 'graph-node-frontier');
          logConsole(`  relax ${u}→${v}: dist[${v}] = ${alt}`, 'success');
        }
        edge.line.classList.remove('graph-edge-active');
        edge.label.classList.remove('weight-active');
      }
      markNode(u, 'graph-node-visited');
    }

    // Highlight the shortest-path tree (every chosen predecessor edge).
    for (const [, link] of prev) {
      if (link && link.edge) {
        link.edge.line.classList.remove('graph-edge-traversed');
        link.edge.line.classList.add('graph-edge-tree');
        link.edge.label.classList.add('weight-tree');
      }
    }
    renderDistances(dist);

    const reached = [...dist.entries()].filter(([, d]) => d !== INF).length;
    logConsole(
      `Dijkstra complete. Reached ${reached}/${state.nodes.size} nodes from source 0.`,
      'success'
    );
    endAlgo('DIJKSTRA DONE');
  } catch (err) {
    logConsole(`Dijkstra error: ${err.message}`, 'error');
    endAlgo('ERROR');
  }
}

function setDistLabel(id, value, animate) {
  const n = state.nodes.get(id);
  if (!n) return;
  n.distEl.textContent = value === INF ? '∞' : value;
  if (animate) {
    n.distEl.classList.remove('dist-relaxed');
    void n.distEl.offsetWidth;          // reflow to re-trigger the pop
    n.distEl.classList.add('dist-relaxed');
  }
}

// Briefly pulse an edge with a state class, then remove it after `ms`.
async function flashEdge(edge, cls, ms) {
  if (!edge) { await sleep(ms); return; }
  edge.line.classList.add(cls);
  edge.label.classList.add('weight-active');
  await sleep(ms);
  edge.line.classList.remove(cls);
  edge.label.classList.remove('weight-active');
}

// ─── Event wiring ───────────────────────────────────────────────────────────
// Canvas click → add a node (node mode only). Clicks that originate on a node
// call stopPropagation, so this only fires for empty-space clicks.
canvas.addEventListener('click', (e) => {
  if (state.busy) return;
  if (state.mode !== 'node') return;
  const { x, y } = canvasPoint(e);
  addNodeAt(x, y);
});

modeNodeBtn.addEventListener('click', () => setMode('node'));
modeEdgeBtn.addEventListener('click', () => setMode('edge'));
weightRandomBtn.addEventListener('click', () => setWeightMode('random'));
weightPromptBtn.addEventListener('click', () => setWeightMode('prompt'));
btnSample.addEventListener('click', loadSample);
btnClear.addEventListener('click', clearGraph);
btnClearConsole.addEventListener('click', clearConsoleOutput);

btnBfs.addEventListener('click', runBFS);
btnDfs.addEventListener('click', runDFS);
btnDijkstra.addEventListener('click', runDijkstra);

speedSlider.addEventListener('input', () => {
  speedValue.textContent = speedSlider.value;
  const pct = (speedSlider.value - speedSlider.min) / (speedSlider.max - speedSlider.min) * 100;
  speedSlider.style.setProperty('--fill', pct + '%');
});

// ─── Init ──────────────────────────────────────────────────────────────────
speedSlider.dispatchEvent(new Event('input'));
updateBanner();
updateInfo();
