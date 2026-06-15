// render-bst-insert.js — BST insertion renderer (browser, presentational only).
// Shares visual style with render-tree.js. Shows the search path as the student
// navigates, then reveals the insertion point when the final step settles.

const SVG_NS = 'http://www.w3.org/2000/svg';

export const chapterUI = {
  title: 'BST 插入 · 過程式測驗',
  canvasLabel: '題目樹（從 root 開始逐步比較，找到插入位置）',
  infoHTML(instance) {
    return `請在這棵 BST 中插入值 &nbsp;<b>${instance.insertVal}</b>
      <div class="rules"><b>① 搜尋</b>：從 root 出發，比較大小決定往左或往右，直到遇到空指標。
      <b>② 確認</b>：插入值成為找到的父節點的左子或右子？</div>`;
  },
  hint(step) {
    if (step.phase === 'search') return '提示：插入值比當前節點小往左，大往右。';
    return '提示：插入值與父節點比較，決定成為左子還是右子。';
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

  // Draw edges
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

  // Draw nodes
  const nodeEls = new Map();
  for (const n of instance.nodes) {
    const p = pos.get(n.value);
    const el = document.createElement('div');
    el.className = 'bst-node';
    el.style.left = p.x + 'px';
    el.style.top  = p.y + 'px';
    el.textContent = n.value;
    nodesLayer.appendChild(el);
    nodeEls.set(n.value, el);
  }

  // Ghost node for the insertion point (hidden until insert step settles)
  let ghostEl = null;

  const pathNodes = new Set();
  let focus = null;

  function refresh() {
    for (const [val, el] of nodeEls) {
      el.classList.remove('path', 'current');
      if (pathNodes.has(val)) el.classList.add('path');
      if (val === focus) el.classList.add('current');
    }
    for (const e of edgeEls) {
      const onPath = pathNodes.has(e.parent) &&
        (pathNodes.has(e.child) || e.child === focus);
      e.line.classList.toggle('path', onPath);
    }
  }
  refresh();

  return {
    setFocus(f) { focus = f; refresh(); },
    setPickable() {},   // no pick interaction in bst-insert
    markPicked() {},
    onSettle(step) {
      if (step.phase === 'search' && step.focusNode != null) {
        pathNodes.add(step.focusNode);
      }
      if (step.phase === 'insert') {
        // Show the new node as a ghost appended to the parent
        const parentVal = step.focusNode;
        const pPos = pos.get(parentVal);
        if (pPos && !ghostEl) {
          const side = step.answer; // 'left' or 'right'
          const offsetX = side === 'left' ? -50 : 50;
          const offsetY = 55;
          ghostEl = document.createElement('div');
          ghostEl.className = 'bst-node insert-ghost';
          ghostEl.style.left = (pPos.x + offsetX) + 'px';
          ghostEl.style.top  = (pPos.y + offsetY) + 'px';
          ghostEl.textContent = instance.insertVal;
          nodesLayer.appendChild(ghostEl);

          // Draw a ghost edge from parent to new node
          const gLine = document.createElementNS(SVG_NS, 'line');
          gLine.setAttribute('class', 'tree-edge path');
          gLine.setAttribute('x1', pPos.x); gLine.setAttribute('y1', pPos.y);
          gLine.setAttribute('x2', pPos.x + offsetX); gLine.setAttribute('y2', pPos.y + offsetY);
          svg.appendChild(gLine);
        }
      }
      refresh();
    },
    finishView() { focus = null; refresh(); },
  };
}
