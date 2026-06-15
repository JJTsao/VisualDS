// render-dfs.js — DFS traversal renderer (browser, presentational only).
// Graph with no edge weights; nodes show visit-order badges as they are settled.
// Same weight-label collision avoidance as render-graph.js is NOT needed here
// (DFS graph has no weights). Edge lines only.

const SVG_NS = 'http://www.w3.org/2000/svg';

export const chapterUI = {
  title: 'DFS 走訪 · 過程式測驗',
  canvasLabel: '題目圖（從節點 0 出發，依 DFS 規則依序點選拜訪節點）',
  infoHTML(instance) {
    return `從<b style="color:var(--amber);font-size:inherit">節點 ${instance.source}</b> 出發執行 DFS。
      <div class="rules">每步點選下一個拜訪的節點。
      <b>規則</b>：優先沿未拜訪節點深入；遇到 id 相同優先度的鄰居時，<b>取 id 較小者</b>優先拜訪。</div>`;
  },
  hint(step) {
    return step.meta?.step === 0
      ? '提示：DFS 的第一個拜訪節點就是起點本身。'
      : '提示：從目前節點的未拜訪鄰居中，沿著遞迴路徑最深的那條走；平手取 id 最小。';
  },
};

export function createRenderer(instance, stage, { onPickNode }) {
  const W = stage.clientWidth || 500;
  const H = stage.clientHeight || 400;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const nodesLayer = document.createElement('div');
  nodesLayer.className = 'nodes-layer';
  stage.append(svg, nodesLayer);

  const P = instance.nodes.map((n) => ({ x: n.x * W, y: n.y * H }));

  // Edges (no weights for DFS)
  const edgeEls = [];
  instance.edges.forEach((e) => {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'graph-edge');
    line.setAttribute('x1', P[e.a].x); line.setAttribute('y1', P[e.a].y);
    line.setAttribute('x2', P[e.b].x); line.setAttribute('y2', P[e.b].y);
    svg.appendChild(line);
    edgeEls.push({ line, a: e.a, b: e.b });
  });

  // Nodes + visit-order badges
  const nodeEls = [];
  const orderBadges = [];
  instance.nodes.forEach((n) => {
    const el = document.createElement('div');
    el.className = 'gnode';
    el.style.left = P[n.id].x + 'px';
    el.style.top  = P[n.id].y + 'px';
    el.textContent = n.id;

    const badge = document.createElement('div');
    badge.className = 'gdist';   // reuse Dijkstra dist badge style
    badge.style.display = 'none';
    el.appendChild(badge);

    el.addEventListener('click', () => {
      if (el.classList.contains('clickable')) onPickNode(n.id);
    });
    nodesLayer.appendChild(el);
    nodeEls[n.id] = el;
    orderBadges[n.id] = badge;
  });

  const visited = new Map();   // id → visit order (1-based)
  const visitPath = [];        // DFS tree edges settled so far
  let focus = null, pickable = false, picked = null;

  function refresh() {
    instance.nodes.forEach((n) => {
      const el = nodeEls[n.id];
      el.classList.remove('clickable', 'current', 'picked', 'visited');
      if (visited.has(n.id)) el.classList.add('visited');
      if (n.id === focus && !visited.has(n.id)) el.classList.add('current');
      if (pickable && !visited.has(n.id)) el.classList.add('clickable');
      if (pickable && n.id === picked) el.classList.add('picked');

      const badge = orderBadges[n.id];
      if (visited.has(n.id)) {
        badge.textContent = visited.get(n.id);
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    });
    // Highlight DFS tree edges
    edgeEls.forEach((e) => {
      const inTree = visitPath.some(
        (p) => (p.from === e.a && p.to === e.b) || (p.from === e.b && p.to === e.a)
      );
      e.line.classList.toggle('tree', inTree);
    });
  }
  refresh();

  return {
    setFocus(f) { focus = f; refresh(); },
    setPickable(b) { pickable = b; if (!b) picked = null; refresh(); },
    markPicked(id) { picked = id; refresh(); },
    onSettle(step, expected) {
      const order = (step.meta?.step ?? 0) + 1;
      visited.set(expected, order);
      const from = step.focusNode;
      if (from !== null && from !== undefined) visitPath.push({ from, to: expected });
      picked = null;
      refresh();
    },
    finishView() { pickable = false; focus = null; picked = null; refresh(); },
  };
}
