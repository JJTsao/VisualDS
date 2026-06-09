// ════════════════════════════════════════════════════════════════════════════
//  Graph renderer for Dijkstra (browser, presentational only — no algorithm).
//  Consumes the server instance { source, nodes:[{id,x,y}], edges:[{a,b,w}] }.
//  Maintains a DISPLAY-ONLY tentative-distance map that updates as the server
//  reveals each step (extract → node settled/visited; relax → neighbour's badge).
// ════════════════════════════════════════════════════════════════════════════

const SVG_NS = 'http://www.w3.org/2000/svg';
const INF = Infinity;
const distStr = (v) => (v === INF ? '∞' : v);

export const chapterUI = {
  title: 'Dijkstra 最短路徑 · 過程式測驗',
  canvasLabel: '題目圖（無向帶權 · 邊上數字為權重 · 節點上徽章為暫定距離）',
  infoHTML() {
    return `從<b style="color:var(--amber);font-size:inherit">節點 0</b> 出發,逐輪手動執行 Dijkstra。
      <div class="rules"><b>① extract</b>:在未拜訪節點中點選暫定距離最小者(平手取 id 較小)。
      <b>② relax</b>:填每個未拜訪鄰居的新 dist —— 新 dist = dist[u] + 邊權重,只有嚴格小於原值才更新。</div>`;
  },
  hint(step) {
    if (step.kind === 'pick-node') return '提示:比較未拜訪節點的暫定距離徽章,挑最小;平手取 id 較小。';
    return '提示:新 dist = 被處理節點的 dist + 邊權重,且只有嚴格小於原值才更新(否則填原值)。';
  },
};

export function createRenderer(instance, stage, { onPickNode }) {
  const W = stage.clientWidth, H = stage.clientHeight;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const nodesLayer = document.createElement('div');
  nodesLayer.className = 'nodes-layer';
  stage.append(svg, nodesLayer);

  const P = instance.nodes.map((n) => ({ x: n.x * W, y: n.y * H }));

  // edges (pass 1: lines)
  const coords = instance.edges.map((e) => ({ x1: P[e.a].x, y1: P[e.a].y, x2: P[e.b].x, y2: P[e.b].y }));
  instance.edges.forEach((e, i) => {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'graph-edge');
    line.setAttribute('x1', coords[i].x1); line.setAttribute('y1', coords[i].y1);
    line.setAttribute('x2', coords[i].x2); line.setAttribute('y2', coords[i].y2);
    svg.appendChild(line);
  });
  placeWeightLabels(svg, instance.edges, coords);

  // nodes + distance badges
  const nodeEls = [], distEls = [];
  instance.nodes.forEach((n) => {
    const el = document.createElement('div');
    el.className = 'gnode';
    el.style.left = P[n.id].x + 'px';
    el.style.top  = P[n.id].y + 'px';
    el.textContent = n.id;
    const d = document.createElement('div'); d.className = 'gdist'; el.appendChild(d);
    el.addEventListener('click', () => { if (el.classList.contains('clickable')) onPickNode(n.id); });
    nodesLayer.appendChild(el);
    nodeEls[n.id] = el; distEls[n.id] = d;
  });

  const visited = new Set();
  const dist = instance.nodes.map((n) => (n.id === instance.source ? 0 : INF));
  let focus = null, pickable = false, picked = null;

  function refresh(relaxedId) {
    instance.nodes.forEach((n) => {
      const el = nodeEls[n.id];
      el.classList.remove('clickable', 'current', 'picked', 'visited');
      if (visited.has(n.id)) el.classList.add('visited');
      if (n.id === focus && !visited.has(n.id)) el.classList.add('current');
      if (pickable && !visited.has(n.id)) el.classList.add('clickable');
      if (pickable && n.id === picked) el.classList.add('picked');
      distEls[n.id].textContent = distStr(dist[n.id]);
    });
    if (relaxedId != null) {
      const d = distEls[relaxedId];
      d.classList.remove('relaxed'); void d.offsetWidth; d.classList.add('relaxed');
    }
  }
  refresh();

  return {
    setFocus(f) { focus = f; refresh(); },
    setPickable(b) { pickable = b; if (!b) picked = null; refresh(); },
    markPicked(id) { picked = id; refresh(); },
    onSettle(step, expected) {
      const m = step.meta || {};
      if (m.type === 'extract') { visited.add(expected); picked = null; refresh(); }
      else if (m.type === 'relax') { dist[m.node] = expected; refresh(m.node); }
    },
    finishView() { pickable = false; focus = null; picked = null; refresh(); },
  };
}

// ── weight-label placement with collision avoidance (ported from prototype) ───
function rectsOverlap(a, b, gap) {
  return !(a.x + a.w + gap < b.x || b.x + b.w + gap < a.x ||
           a.y + a.h + gap < b.y || b.y + b.h + gap < a.y);
}
function pointSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function placeWeightLabels(svg, edges, coords) {
  const placed = [];
  const cands = [];
  for (const off of [13, 20, 27]) for (const t of [0.30, 0.70, 0.22, 0.78, 0.5]) for (const s of [1, -1]) cands.push({ t, s, off });
  edges.forEach((e, i) => {
    const { x1, y1, x2, y2 } = coords[i];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('class', 'weight');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = e.w;
    svg.appendChild(text);
    let best = null, bestScore = Infinity;
    for (const c of cands) {
      const ax = x1 + dx * c.t + (-dy / len) * c.off * c.s;
      const ay = y1 + dy * c.t + ( dx / len) * c.off * c.s;
      text.setAttribute('x', ax); text.setAttribute('y', ay);
      const bb = text.getBBox(), pad = 2.5;
      const box = { x: bb.x - pad, y: bb.y - pad, w: bb.width + 2 * pad, h: bb.height + 2 * pad };
      let score = 0;
      for (const p of placed) if (rectsOverlap(box, p, 2)) score += 100;
      for (let j = 0; j < coords.length; j++) {
        if (j === i) continue;
        const s2 = coords[j];
        if (pointSegDist(ax, ay, s2.x1, s2.y1, s2.x2, s2.y2) < 11) score += 1;
      }
      if (score < bestScore) { bestScore = score; best = { ax, ay, box }; }
      if (score === 0) break;
    }
    text.setAttribute('x', best.ax); text.setAttribute('y', best.ay);
    placed.push(best.box);
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'wbg');
    rect.setAttribute('x', best.box.x); rect.setAttribute('y', best.box.y);
    rect.setAttribute('width', best.box.w); rect.setAttribute('height', best.box.h);
    svg.insertBefore(rect, text);
  });
}
