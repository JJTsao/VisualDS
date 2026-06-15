// render-bst-traversal.js — BST traversal renderer (browser, presentational only).
// All nodes are always visible; as steps settle, visited nodes get an order badge.

const SVG_NS = 'http://www.w3.org/2000/svg';

export const chapterUI = {
  title: 'BST 走訪 · 過程式測驗',
  canvasLabel: '題目樹（依走訪規則依序點選節點）',
  infoHTML(instance) {
    const label = instance.type === 'inorder'
      ? '中序走訪 (In-order): 左 → 根 → 右'
      : '前序走訪 (Pre-order): 根 → 左 → 右';
    return `對這棵 BST 執行 <b>${label}</b>。
      <div class="rules">每步點選下一個應被拜訪的節點（依遞迴規則決定順序）。
      <b>中序</b>輸出即 BST 的<b>排序結果</b>。</div>`;
  },
  hint(step) {
    const type = step.meta?.type ?? 'inorder';
    return type === 'inorder'
      ? '提示：中序 = 左子樹完整走完 → 當前節點 → 右子樹。'
      : '提示：前序 = 當前節點 → 左子樹 → 右子樹。';
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

  const pos = new Map();
  for (const n of instance.nodes) pos.set(n.value, { x: n.x * W, y: n.y * H });

  // Edges
  for (const n of instance.nodes) {
    if (n.parent === null) continue;
    const P = pos.get(n.parent), C = pos.get(n.value);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'tree-edge');
    line.setAttribute('x1', P.x); line.setAttribute('y1', P.y);
    line.setAttribute('x2', C.x); line.setAttribute('y2', C.y);
    svg.appendChild(line);
  }

  // Nodes (all clickable during the exam)
  const nodeEls = new Map();
  const orderBadges = new Map();  // value → badge el showing visit order
  for (const n of instance.nodes) {
    const p = pos.get(n.value);
    const el = document.createElement('div');
    el.className = 'bst-node';
    el.style.left = p.x + 'px';
    el.style.top  = p.y + 'px';
    el.textContent = n.value;
    el.addEventListener('click', () => {
      if (el.classList.contains('clickable')) onPickNode(n.value);
    });

    const badge = document.createElement('div');
    badge.className = 'visit-order-badge';
    el.appendChild(badge);

    nodesLayer.appendChild(el);
    nodeEls.set(n.value, el);
    orderBadges.set(n.value, badge);
  }

  const visited = new Map();  // value → visit order (1-based)
  let focus = null, pickable = false, picked = null;

  function refresh() {
    for (const [val, el] of nodeEls) {
      el.classList.remove('clickable', 'current', 'picked', 'traversal-visited');
      if (visited.has(val)) el.classList.add('traversal-visited');
      if (val === focus && !visited.has(val)) el.classList.add('current');
      if (pickable && !visited.has(val)) el.classList.add('clickable');
      if (pickable && val === picked) el.classList.add('picked');
      const badge = orderBadges.get(val);
      badge.textContent = visited.has(val) ? visited.get(val) : '';
      badge.style.display = visited.has(val) ? 'block' : 'none';
    }
  }
  refresh();

  return {
    setFocus(f) { focus = f; refresh(); },
    setPickable(b) { pickable = b; if (!b) picked = null; refresh(); },
    markPicked(id) { picked = id; refresh(); },
    onSettle(step, expected) {
      // After each step settles, the visited node gets its order badge
      const order = (step.meta?.step ?? 0) + 1;
      visited.set(expected, order);
      picked = null;
      refresh();
    },
    finishView() { pickable = false; focus = null; picked = null; refresh(); },
  };
}
