// ════════════════════════════════════════════════════════════════════════════
//  Tree renderer for BST-delete (browser, presentational only — no algorithm).
//  Consumes the server's instance { target, nodes:[{value,x,y,parent}] } and
//  exposes the renderer contract used by exam-client.js.
// ════════════════════════════════════════════════════════════════════════════

const SVG_NS = 'http://www.w3.org/2000/svg';

export const chapterUI = {
  title: 'BST 刪除 · 過程式測驗',
  canvasLabel: '題目樹（二元搜尋樹 · 紅圈為待刪值）',
  infoHTML(instance) {
    return `請從這棵 BST 刪除值 &nbsp;<b>${instance.target}</b>
      <div class="rules">逐步手動執行刪除。<b>① 搜尋</b>:從 root 比大小往左/右,直到找到。
      <b>② 分類</b>:葉/一子/兩子。<b>③ 解決</b>:接上子節點,或找中序後繼交換。</div>`;
  },
  // chapter-specific hint per step kind (shown on a wrong attempt)
  hint(step) {
    switch (step.kind) {
      case 'choose-dir': return '提示:目標比目前節點小往左、大往右,相等就是找到。';
      case 'classify':   return '提示:看這個節點有幾個非空子節點。';
      case 'pick-node':  return '提示:中序後繼 = 右子樹一路往左到底;取代節點 = 它唯一的子節點。';
      case 'number':     return '提示:兩子情況下,複製上來的是「中序後繼」的值。';
      default: return '再試一次。';
    }
  },
};

export function createRenderer(instance, stage, { onPickNode }) {
  const W = stage.clientWidth, H = stage.clientHeight;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const nodesLayer = document.createElement('div');
  nodesLayer.className = 'nodes-layer';
  stage.append(svg, nodesLayer);

  const pos = new Map();            // value → {x,y} in px
  for (const n of instance.nodes) pos.set(n.value, { x: n.x * W, y: n.y * H });

  // edges (parent → child)
  const edgeEls = [];
  for (const n of instance.nodes) {
    if (n.parent === null) continue;
    const P = pos.get(n.parent), C = pos.get(n.value);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'tree-edge');
    line.setAttribute('x1', P.x); line.setAttribute('y1', P.y);
    line.setAttribute('x2', C.x); line.setAttribute('y2', C.y);
    svg.appendChild(line);
    edgeEls.push({ line, parent: n.parent, child: n.value });
  }

  // nodes
  const nodeEls = new Map();        // value → el
  for (const n of instance.nodes) {
    const p = pos.get(n.value);
    const el = document.createElement('div');
    el.className = 'bst-node';
    el.style.left = p.x + 'px';
    el.style.top  = p.y + 'px';
    el.textContent = n.value;
    el.addEventListener('click', () => { if (el.classList.contains('clickable')) onPickNode(n.value); });
    nodesLayer.appendChild(el);
    nodeEls.set(n.value, el);
  }

  const pathNodes = new Set();
  let focus = null, pickable = false, picked = null;

  function refresh() {
    for (const [val, el] of nodeEls) {
      el.classList.remove('clickable', 'path', 'current', 'picked', 'target');
      if (pathNodes.has(val)) el.classList.add('path');
      if (val === instance.target) el.classList.add('target');
      if (val === focus) el.classList.add('current');
      if (pickable) el.classList.add('clickable');
      if (pickable && val === picked) el.classList.add('picked');
    }
    for (const e of edgeEls) {
      const onPath = pathNodes.has(e.parent) && (pathNodes.has(e.child) || e.child === focus);
      e.line.classList.toggle('path', onPath);
    }
  }
  refresh();

  return {
    setFocus(f) { focus = f; refresh(); },
    setPickable(b) { pickable = b; if (!b) picked = null; refresh(); },
    markPicked(id) { picked = id; refresh(); },
    // After a step settles: grow the visited search path.
    onSettle(step) {
      if (step.phase === 'search' && step.focusNode != null) pathNodes.add(step.focusNode);
      refresh();
    },
    finishView() { pickable = false; focus = null; refresh(); },
  };
}
