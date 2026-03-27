'use strict';

// ─── Operation Presets ────────────────────────────────────────────────────────

const OPERATIONS = {
  build: {
    label: { en: 'BUILD', zh: '建立節點' },
    desc: 'new Node(val) 在 Heap 配置記憶體，->data 存取欄位 — O(1)',
    code: `Node* head = new Node(10);\ncout << head->data;`,
  },
  link: {
    label: { en: 'LINK', zh: '串連節點' },
    desc: '->next 指標串接節點，形成鏈結結構',
    code: `Node* head = new Node(10);\nNode* second = new Node(20);\nNode* third = new Node(30);\nhead->next = second;\nsecond->next = third;`,
  },
  traverse: {
    label: { en: 'TRAVERSE', zh: '遍歷' },
    desc: 'curr 指標逐節點走訪，直到 nullptr — O(n)',
    code: `Node* head = new Node(10);\nNode* second = new Node(20);\nNode* third = new Node(30);\nhead->next = second;\nsecond->next = third;\nNode* curr = head;\nwhile (curr != nullptr) {\ncout << curr->data;\ncurr = curr->next;\n}`,
  },
  find: {
    label: { en: 'FIND', zh: '尋找值' },
    desc: 'while 迴圈搜尋目標值，找到後 break 提早離開 — O(n)',
    code: `Node* head = new Node(10);\nNode* second = new Node(20);\nNode* third = new Node(30);\nhead->next = second;\nsecond->next = third;\nthird->next = nullptr;\nint target = 20;\nNode* curr = head;\nbool found = false;\nwhile (curr != nullptr) {\nif (curr->data == target) {\nfound = true;\nbreak;\n}\ncurr = curr->next;\n}`,
  },
  insert_head: {
    label: { en: 'INS HEAD', zh: '頭部插入' },
    desc: '新節點的 next 先接原頭，再更新 head 指標 — O(1)',
    code: `Node* head = new Node(10);\nNode* second = new Node(20);\nNode* third = new Node(30);\nhead->next = second;\nsecond->next = third;\nthird->next = nullptr;\nNode* newNode = new Node(5);\nnewNode->next = head;\nhead = newNode;`,
  },
  insert_mid: {
    label: { en: 'INS MID', zh: '中間插入' },
    desc: '順序非常重要：先牽後面再斷前面，否則鏈結斷裂 — O(1)',
    code: `Node* head = new Node(10);\nNode* second = new Node(20);\nNode* third = new Node(30);\nhead->next = second;\nsecond->next = third;\nthird->next = nullptr;\nNode* curr = head;\nNode* newNode = new Node(15);\nnewNode->next = curr->next;\ncurr->next = newNode;`,
  },
  delete_mid: {
    label: { en: 'DELETE', zh: '刪除節點' },
    desc: '先用 temp 記住目標節點，再讓 prev 跳過它，最後 delete 釋放記憶體 — O(1)',
    code: `Node* head = new Node(10);\nNode* second = new Node(20);\nNode* third = new Node(30);\nhead->next = second;\nsecond->next = third;\nthird->next = nullptr;\nNode* prev = head;\n// 先記住要刪除的節點\nNode* temp = prev->next;\n// 讓 prev 繞過 temp,直接指向下一個\nprev->next = temp->next;\n// 釋放記憶體\ndelete temp;`,
  },
};

// ─── Scatter Layout Constants ─────────────────────────────────────────────────

// Vertical offsets (px) per creation-order index — simulates non-contiguous heap
const Y_OFFSETS = [5, 95, 45, 110, 22, 78, 58, 18, 88, 35];
const X_STEP    = 225;   // px between consecutive node left edges
const X_START   = 20;    // px left padding inside heap region

// Approximate node dimensions (based on CSS clamp max values at desktop widths)
const ND_INDICATOR_H = 28;  // traversal-ptr badge row (always reserved, keeps box Y stable)
const ND_ADDR_ROW_H  = 20;
const ND_BOX_H       = 70;
const ND_DATA_W      = 72;
const ND_NEXT_W      = 96;
const ND_BOX_W       = ND_DATA_W + 1 + ND_NEXT_W; // 169px

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  currentLine:  0,
  lines:        [],

  // { [varName]: { addr: number, data: number|null, nextName: string|null, freed: boolean } }
  nodes:        {},
  nodeOrder:    [],   // 建立順序

  // 所有 Node* 變數 → 所指向的 nodeVarName 或 null
  ptrs:         {},   // { [varName]: string|null }

  // 簡單變數（int / bool）
  vars:         {},   // { [varName]: number|boolean }

  addrCounter:  0x2000,
  currentOp:    'build',
};

// ─── History ──────────────────────────────────────────────────────────────────

const history = new StepHistory();

// ─── DOM References ───────────────────────────────────────────────────────────

const codeInput       = document.getElementById('code-input');
const btnStep         = document.getElementById('btn-step');
const btnStepBack     = document.getElementById('btn-step-back');
const btnReset        = document.getElementById('btn-reset');
const btnClearConsole = document.getElementById('btn-clear-console');
const consoleOutput   = document.getElementById('console-output');
const stepIndicator   = document.getElementById('step-indicator');
const opDesc          = document.getElementById('op-desc');
const llHeapRegion    = document.getElementById('ll-heap-region');
const llPtrRegion     = document.getElementById('ll-ptr-region');
const llEmptyState    = document.getElementById('ll-empty-state');

// ─── Regex Patterns (strict order matters) ────────────────────────────────────

const RE_BLANK         = /^\s*(\/\/.*)?$/;
const RE_NEW_NODE      = /^\s*Node\s*\*\s*(\w+)\s*=\s*new\s+Node\s*\(\s*(-?\d+)\s*\)\s*;\s*(\/\/.*)?$/;
const RE_PTR_ASSIGN    = /^\s*Node\s*\*\s*(\w+)\s*=\s*(nullptr|NULL|\w+)\s*;\s*(\/\/.*)?$/;
const RE_SET_NEXT_NEXT = /^\s*(\w+)\s*->\s*next\s*=\s*(\w+)\s*->\s*next\s*;\s*(\/\/.*)?$/;
const RE_SET_NEXT      = /^\s*(\w+)\s*->\s*next\s*=\s*(nullptr|NULL|\w+)\s*;\s*(\/\/.*)?$/;
const RE_SET_DATA      = /^\s*(\w+)\s*->\s*data\s*=\s*(-?\d+)\s*;\s*(\/\/.*)?$/;
const RE_READ_DATA     = /^\s*int\s+(\w+)\s*=\s*(\w+)\s*->\s*data\s*;\s*(\/\/.*)?$/;
const RE_INT_DECL      = /^\s*int\s+(\w+)\s*=\s*(-?\d+)\s*;\s*(\/\/.*)?$/;
const RE_BOOL_DECL     = /^\s*bool\s+(\w+)\s*=\s*(true|false)\s*;\s*(\/\/.*)?$/;
const RE_BOOL_ASSIGN   = /^\s*(\w+)\s*=\s*(true|false)\s*;\s*(\/\/.*)?$/;
const RE_IF_DATA_EQ    = /^\s*if\s*\(\s*(\w+)\s*->\s*data\s*==\s*(\w+|-?\d+)\s*\)\s*\{?\s*$/;
const RE_BREAK         = /^\s*break\s*;\s*(\/\/.*)?$/;
const RE_PTR_REASSIGN  = /^\s*(\w+)\s*=\s*(\w+|nullptr|NULL)\s*;\s*(\/\/.*)?$/;
const RE_COUT          = /^\s*cout\s*<<\s*(\w+)->data\s*(<<\s*["\s]+)?\s*;?\s*(\/\/.*)?$/;
const RE_WHILE         = /^\s*while\s*\(\s*(\w+)\s*!=\s*(nullptr|NULL)\s*\)\s*\{?\s*$/;
const RE_OPEN_BRACE    = /^\s*\{\s*$/;
const RE_CLOSE_BRACE   = /^\s*\}\s*$/;
const RE_PTR_FROM_NEXT = /^\s*Node\s*\*\s*(\w+)\s*=\s*(\w+)\s*->\s*next\s*;\s*(\/\/.*)?$/;
const RE_DELETE        = /^\s*delete\s+(\w+)\s*;\s*(\/\/.*)?$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toHex(addr) {
  return '0x' + addr.toString(16).toUpperCase().padStart(4, '0');
}

function logConsole(message, type = 'info') {
  const placeholder = consoleOutput.querySelector('.console-placeholder');
  if (placeholder) placeholder.remove();

  const span = document.createElement('span');
  span.className = `console-line ${type}`;
  const prefix = {
    info: '  ', success: '✓ ', warn: '⚠ ', error: '✗ ', declare: '» ', dim: '  ',
  }[type] || '  ';
  span.textContent = prefix + message;
  consoleOutput.appendChild(span);
  consoleOutput.appendChild(document.createElement('br'));
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function updateStepIndicator() {
  const total = state.lines.length;
  stepIndicator.textContent = `line: ${Math.min(state.currentLine, total)} / ${total}`;
}

function triggerAnimation(element, className, durationMs = 1000) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), durationMs);
}

// ─── Loop control ─────────────────────────────────────────────────────────────

function findMatchingBrace(whileLineIndex) {
  let depth = 0;
  for (let i = whileLineIndex; i < state.lines.length; i++) {
    const l = state.lines[i].trim();
    if (l.includes('{')) depth++;
    if (l.includes('}')) {
      depth--;
      if (depth === 0) return i;
    }
  }
  // while 行本身沒有 { 的情況，找最近的 }
  return state.lines.length - 1;
}

function findLoopStart(closingBraceIndex) {
  let depth = 0;
  for (let i = closingBraceIndex; i >= 0; i--) {
    const l = state.lines[i].trim();
    if (l.includes('}')) depth++;
    if (l.includes('{') || RE_WHILE.test(l)) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return 0;
}

/**
 * 從 closingBraceIndex 往前搜尋對應的開括號行，回傳行號。
 * 用來判斷 } 是關閉 while 還是 if，決定是否跳回迴圈頭。
 */
function findMatchingOpener(closingBraceIndex) {
  let depth = 0;
  for (let i = closingBraceIndex; i >= 0; i--) {
    const l = state.lines[i].trim();
    if (l.includes('}')) depth++;
    if (l.includes('{')) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 從 fromLine 往前找最近的 while 行（用於 break 跳出）。
 */
function findEnclosingWhile(fromLine) {
  for (let i = fromLine; i >= 0; i--) {
    if (RE_WHILE.test(state.lines[i].trim())) return i;
  }
  return -1;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/**
 * 從 ptrs 找出 head 指標（指向沒有被其他節點 next 指向的那個節點）
 * 或回傳 null（沒有節點時）
 */
function findHeadNode() {
  // 所有存在的節點
  const allNodeNames = new Set(state.nodeOrder);
  if (allNodeNames.size === 0) return null;

  // 被 next 指到的節點
  const pointed = new Set();
  for (const name of state.nodeOrder) {
    const node = state.nodes[name];
    if (node && node.nextName) pointed.add(node.nextName);
  }

  // 未被任何 next 指向的節點 = 鏈結頭
  for (const name of state.nodeOrder) {
    if (!pointed.has(name)) return name;
  }

  // fallback: 第一個節點
  return state.nodeOrder[0];
}

/**
 * 依 linked list 邏輯順序走訪，回傳 [name, name, ...]
 */
function getChainOrder() {
  const head = findHeadNode();
  if (!head) return [];

  const visited = new Set();
  const chain = [];
  let cur = head;
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    chain.push(cur);
    const node = state.nodes[cur];
    cur = (node && node.nextName) ? node.nextName : null;
  }

  // 加入任何孤立節點（不在 chain 裡）
  for (const name of state.nodeOrder) {
    if (!visited.has(name)) chain.push(name);
  }
  return chain;
}

/**
 * 計算每個節點在 heap region 的絕對座標。
 * X: 依鏈結順序由左到右排列（未鏈結的孤立節點排在最後）
 * Y: 依建立順序取 Y_OFFSETS，模擬 heap 分配的不連續位址
 *
 * insert_mid 特例：使用固定 slot map，在 head 與 second 之間預留 slot 1
 * 讓 newNode 建立時直接落入正確位置，視覺上不會突然竄位。
 */
function getNodePositions() {
  const chain = getChainOrder();
  const positions = {};

  if (state.currentOp === 'insert_head') {
    // newNode=0(預留), head=1, second=2, third=3
    // newNode 生成時直接落在最左側，避免視覺上突然竄位
    const slotMap  = { newNode: 0, head: 1, second: 2, third: 3 };
    const stepWide = 265;
    chain.forEach((name) => {
      const creationIdx = state.nodeOrder.indexOf(name);
      const slot = slotMap[name] ?? 4;
      positions[name] = {
        x: X_START + slot * stepWide,
        y: Y_OFFSETS[creationIdx % Y_OFFSETS.length],
      };
    });
    return positions;
  }

  if (state.currentOp === 'insert_mid') {
    // head=0, newNode=1(預留), second=2, third=3
    // 使用稍大的間距，讓箭頭與節點之間有更充裕的空間
    const slotMap  = { head: 0, newNode: 1, second: 2, third: 3 };
    const stepWide = 265;
    chain.forEach((name) => {
      const creationIdx = state.nodeOrder.indexOf(name);
      const slot = slotMap[name] ?? 4;
      positions[name] = {
        x: X_START + slot * stepWide,
        y: Y_OFFSETS[creationIdx % Y_OFFSETS.length],
      };
    });
    return positions;
  }

  if (state.currentOp === 'delete_mid') {
    // head=0, second=1(被刪目標), third=2 — 固定座標，讓節點在操作過程中不跑位
    const slotMap  = { head: 0, second: 1, third: 2 };
    chain.forEach((name) => {
      const creationIdx = state.nodeOrder.indexOf(name);
      const slot = slotMap[name] ?? 3;
      positions[name] = {
        x: X_START + slot * X_STEP,
        y: Y_OFFSETS[creationIdx % Y_OFFSETS.length],
      };
    });
    return positions;
  }

  chain.forEach((name, chainIdx) => {
    const creationIdx = state.nodeOrder.indexOf(name);
    positions[name] = {
      x: X_START + chainIdx * X_STEP,
      y: Y_OFFSETS[creationIdx % Y_OFFSETS.length],
    };
  });
  return positions;
}

/**
 * 找出指向某個節點的所有 ptr 變數名（含 head, curr 等）
 */
function ptrsPointingTo(nodeName) {
  const result = [];
  for (const [ptrName, target] of Object.entries(state.ptrs)) {
    if (target === nodeName) result.push(ptrName);
  }
  return result;
}

function renderAllNodes() {
  llHeapRegion.innerHTML = '';

  const chain = getChainOrder();

  if (chain.length === 0) {
    llEmptyState.classList.remove('hidden');
    llHeapRegion.style.minWidth = '';
    return;
  }

  llEmptyState.classList.add('hidden');

  const positions = getNodePositions();

  // Ensure container is wide enough for all nodes + NULL indicator
  // insert_mid pre-reserves 4 slots with its wider step value
  const isWideOp      = state.currentOp === 'insert_mid' || state.currentOp === 'insert_head';
  const slotCount     = isWideOp ? 4 : (state.currentOp === 'delete_mid' ? 3 : chain.length);
  const effectiveStep = isWideOp ? 265 : X_STEP;
  llHeapRegion.style.minWidth = (X_START + slotCount * effectiveStep + 90) + 'px';

  chain.forEach((name) => {
    const node = state.nodes[name];
    if (!node) return;

    const pos = positions[name];
    const dataAddr = toHex(node.addr);
    const nextAddr = toHex(node.addr + 4);

    // ── node group (absolutely positioned) ──
    const group = document.createElement('div');
    group.className = 'll-node-group';
    group.id = `nd-group-${name}`;
    group.style.position = 'absolute';
    group.style.left = pos.x + 'px';
    group.style.top  = pos.y + 'px';

    // Classify pointers: traversal (curr/prev/tmp…) vs node-own (head/second/…)
    const pointingPtrs  = ptrsPointingTo(name);
    const traversalPtrs = pointingPtrs.filter(p => !state.nodes[p]);
    const nodePtrs      = pointingPtrs.filter(p =>  state.nodes[p]);

    // ── traversal-ptr indicator row (always rendered to keep box Y stable) ──
    const indicatorRow = document.createElement('div');
    indicatorRow.className = 'node-ptr-indicator';
    if (traversalPtrs.length > 0) {
      group.classList.add('node-has-traverse-ptr');
      traversalPtrs.forEach(ptr => {
        const badge = document.createElement('span');
        badge.className = 'node-ptr-badge';
        badge.textContent = ptr;
        indicatorRow.appendChild(badge);
      });
    }
    group.appendChild(indicatorRow);

    // addr row
    const addrRow = document.createElement('div');
    addrRow.className = 'node-addr-row';
    addrRow.innerHTML =
      `<span style="width:clamp(52px,5.5vw,72px);text-align:center;">${dataAddr}</span>` +
      `<span style="width:clamp(64px,7vw,96px);text-align:center;">${nextAddr}</span>`;

    // node box
    const box = document.createElement('div');
    box.className = 'node-box';
    box.id = `nd-box-${name}`;

    // data cell
    const dataCell = document.createElement('div');
    dataCell.className = 'node-data-cell' + (node.data !== null ? ' initialized' : '');
    dataCell.id = `nd-data-${name}`;
    dataCell.innerHTML =
      `<span class="node-field-label">data</span>` +
      `<span class="node-field-value" id="nd-val-${name}">${node.data !== null ? node.data : '?'}</span>`;

    // divider
    const divider = document.createElement('div');
    divider.className = 'node-divider';

    // next cell
    const nextCell = document.createElement('div');
    nextCell.className = 'node-next-cell' + (node.nextName !== undefined ? ' initialized' : '');
    nextCell.id = `nd-next-${name}`;
    const nextValDisplay = node.nextName === null ? 'NULL' :
      (node.nextName ? toHex(state.nodes[node.nextName]?.addr ?? 0) : '?');
    nextCell.innerHTML =
      `<span class="node-field-label">next</span>` +
      `<span class="node-field-value" id="nd-nval-${name}">${nextValDisplay}</span>`;

    box.appendChild(dataCell);
    box.appendChild(divider);
    box.appendChild(nextCell);

    // label row: node-own pointers (head, second, …) only
    const labelRow = document.createElement('div');
    labelRow.className = 'node-name-row';
    const labelsToShow = nodePtrs.length > 0 ? nodePtrs : [name];
    const headNodeName = findHeadNode();
    labelsToShow.forEach(lbl => {
      const sp = document.createElement('span');
      sp.className = 'node-var-label';
      // Mark head pointer: the label variable that points to the chain's first node
      if (name === headNodeName && state.ptrs[lbl] === headNodeName) {
        sp.classList.add('head-ptr-label');
      }
      sp.textContent = lbl;
      labelRow.appendChild(sp);
    });

    group.appendChild(addrRow);
    group.appendChild(box);
    group.appendChild(labelRow);

    llHeapRegion.appendChild(group);
  });

  // SVG arrows are drawn after layout (arrows/NULL replace old flex dividers)
  requestAnimationFrame(renderArrows);
}

function renderPtrTracker() {
  llPtrRegion.innerHTML = '';

  // 顯示所有走訪指標（curr, prev, tmp 等 — 即 ptrs 裡不是 node 本身 varName 的 key）
  const traversePtrs = Object.entries(state.ptrs).filter(
    ([name]) => !state.nodes[name]  // node 本身的 varName 已顯示在 label row
  );

  if (traversePtrs.length === 0) return;

  traversePtrs.forEach(([ptrName, target]) => {
    const badge = document.createElement('div');
    badge.className = 'ptr-badge';
    const targetDisplay = target === null ? 'nullptr' :
      (state.nodes[target] ? toHex(state.nodes[target].addr) : target);
    badge.innerHTML =
      `<span class="ptr-badge-name">${ptrName}</span>` +
      `<span class="ptr-badge-arrow">→</span>` +
      `<span class="ptr-badge-val">${targetDisplay}</span>`;
    llPtrRegion.appendChild(badge);
  });
}

// ─── SVG Arrow Rendering ──────────────────────────────────────────────────────

/**
 * 在 #ll-heap-region 上覆蓋 SVG 層，繪製節點間的指標箭頭與 NULL 終止符。
 * 使用預先計算的節點座標（ND_* 常數），避免 transform 動畫影響 getBoundingClientRect。
 */
function renderArrows() {
  if (state.nodeOrder.length === 0) return;

  // Create or clear the SVG overlay
  let svg = document.getElementById('ll-arrows-svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'll-arrows-svg';
    svg.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none;';
    llHeapRegion.appendChild(svg);
  } else {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  // Arrowhead marker
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'll-ah');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('refX', '7');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const mPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  mPath.setAttribute('d', 'M0,0 L0,6 L8,3 z');
  mPath.setAttribute('fill', '#8a6300');
  marker.appendChild(mPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  const chain = getChainOrder();

  // Use actual rendered positions so arrows stay correct across all viewport sizes.
  // getBoundingClientRect() is safe here because renderArrows runs inside
  // requestAnimationFrame, after the fresh DOM has been laid out with no active
  // CSS transform animations on these elements.
  const containerRect = llHeapRegion.getBoundingClientRect();

  for (const name of chain) {
    const node = state.nodes[name];
    if (!node) continue;

    const boxEl      = document.getElementById(`nd-box-${name}`);
    const nextCellEl = document.getElementById(`nd-next-${name}`);
    if (!boxEl || !nextCellEl) continue;

    const boxRect      = boxEl.getBoundingClientRect();
    const nextCellRect = nextCellEl.getBoundingClientRect();

    // Arrow source: right edge of the next cell, vertically centred on the box
    const x1 = nextCellRect.right  - containerRect.left;
    const y1 = boxRect.top - containerRect.top + boxRect.height / 2;

    if (node.nextName === null) {
      svgNullTerminator(svg, x1, y1);
    } else if (node.nextName) {
      const tBoxEl = document.getElementById(`nd-box-${node.nextName}`);
      if (!tBoxEl) continue;
      const tBoxRect = tBoxEl.getBoundingClientRect();
      const x2 = tBoxRect.left - containerRect.left;
      const y2 = tBoxRect.top  - containerRect.top + tBoxRect.height / 2;
      svgArrow(svg, x1, y1, x2, y2);
    }
    // nextName === undefined: next not yet set, show nothing (cell already shows "?")
  }
}

function svgArrow(svg, x1, y1, x2, y2) {
  const dy = y2 - y1;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Arc upward when roughly horizontal, straight-ish for diagonals
  const lift = Math.abs(dy) < 18 ? -30 : (dy > 0 ? -12 : 12);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M${x1},${y1} Q${mx},${my + lift} ${x2},${y2}`);
  path.setAttribute('stroke', '#8a6300');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('marker-end', 'url(#ll-ah)');
  svg.appendChild(path);
}

function svgNullTerminator(svg, x1, y1) {
  // Short dashed stem
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);      line.setAttribute('y1', y1);
  line.setAttribute('x2', x1 + 26); line.setAttribute('y2', y1);
  line.setAttribute('stroke', '#4a3600');
  line.setAttribute('stroke-width', '1');
  line.setAttribute('stroke-dasharray', '4,3');
  svg.appendChild(line);
  // NULL box
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x1 + 26);   rect.setAttribute('y', y1 - 10);
  rect.setAttribute('width', '38');  rect.setAttribute('height', '20');
  rect.setAttribute('rx', '2');
  rect.setAttribute('fill', '#0a0700');
  rect.setAttribute('stroke', '#3a2800');
  rect.setAttribute('stroke-width', '1');
  svg.appendChild(rect);
  // NULL text
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', x1 + 45);  text.setAttribute('y', y1 + 4);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-family', "'JetBrains Mono', monospace");
  text.setAttribute('font-size', '9');
  text.setAttribute('letter-spacing', '0.05em');
  text.setAttribute('fill', '#5a4a30');
  text.textContent = 'NULL';
  svg.appendChild(text);
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function stepOneLine() {
  if (state.currentLine >= state.lines.length) {
    logConsole('// 程式執行完畢', 'dim');
    btnStep.disabled = true;
    return;
  }

  // 快照（undo 用）
  history.push({
    currentLine:  state.currentLine,
    nodes:        state.nodes,
    nodeOrder:    [...state.nodeOrder],
    ptrs:         state.ptrs,
    vars:         state.vars,
    addrCounter:  state.addrCounter,
    consoleHTML:  consoleOutput.innerHTML,
  });
  btnStepBack.disabled = false;

  const line = state.lines[state.currentLine].trim();
  if (typeof window.setActiveLine === 'function') {
    window.setActiveLine(state.currentLine);
  }

  // ── 空行 / 註解 ──────────────────────────────────
  if (RE_BLANK.test(line)) {
    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── while 條件 ───────────────────────────────────
  if (RE_WHILE.test(line)) {
    const m = line.match(RE_WHILE);
    const ptrName = m[1];
    const targetNode = state.ptrs[ptrName];
    if (targetNode !== null && targetNode !== undefined) {
      logConsole(`// while: ${ptrName} != nullptr ✓ (${toHex(state.nodes[targetNode]?.addr ?? 0)})`, 'dim');
      state.currentLine++;
    } else {
      state.currentLine = findMatchingBrace(state.currentLine) + 1;
      logConsole(`// while: ${ptrName} == nullptr，離開迴圈`, 'dim');
    }
    updateStepIndicator();
    return;
  }

  // ── 開括號 { ─────────────────────────────────────
  if (RE_OPEN_BRACE.test(line)) {
    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── 閉括號 } — while 跳回頭，if 則繼續往下 ──────
  if (RE_CLOSE_BRACE.test(line)) {
    const openerIdx = findMatchingOpener(state.currentLine);
    if (openerIdx >= 0 && RE_WHILE.test(state.lines[openerIdx].trim())) {
      state.currentLine = openerIdx;
    } else {
      state.currentLine++;
    }
    updateStepIndicator();
    return;
  }

  // ── new Node(val) ─────────────────────────────────
  const newMatch = line.match(RE_NEW_NODE);
  if (newMatch) {
    const varName = newMatch[1];
    const data    = parseInt(newMatch[2], 10);
    const addr    = state.addrCounter;
    // 不規則 heap fragmentation
    state.addrCounter += 0x40 + state.nodeOrder.length * 0x14;

    state.nodes[varName] = { addr, data, nextName: undefined, freed: false };
    state.nodeOrder.push(varName);
    state.ptrs[varName] = varName;  // varName 指向自身節點

    renderAllNodes();
    renderPtrTracker();

    // spawn animation
    const groupEl = document.getElementById(`nd-group-${varName}`);
    triggerAnimation(groupEl, 'node-spawn', 500);

    logConsole(`Line ${state.currentLine + 1}: Node* ${varName} = new Node(${data})  → ${toHex(addr)}`, 'declare');
    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── Node* ptr = someNode / nullptr ───────────────
  const ptrAssignMatch = line.match(RE_PTR_ASSIGN);
  if (ptrAssignMatch) {
    const lhsName = ptrAssignMatch[1];
    const rhsName = ptrAssignMatch[2];

    if (rhsName === 'nullptr' || rhsName === 'NULL') {
      state.ptrs[lhsName] = null;
      renderAllNodes();
      renderPtrTracker();
      logConsole(`Line ${state.currentLine + 1}: Node* ${lhsName} = nullptr`, 'info');
    } else if (state.ptrs[rhsName] !== undefined) {
      // rhs is a known pointer variable
      state.ptrs[lhsName] = state.ptrs[rhsName];
      renderAllNodes();
      renderPtrTracker();
      const target = state.ptrs[lhsName];
      const addrStr = target ? toHex(state.nodes[target]?.addr ?? 0) : 'nullptr';
      logConsole(`Line ${state.currentLine + 1}: Node* ${lhsName} = ${rhsName}  → ${addrStr}`, 'info');

      // highlight ptr update animation on target node
      if (target) {
        const groupEl = document.getElementById(`nd-group-${target}`);
        triggerAnimation(groupEl, 'node-ptr-update', 950);
      }
    } else {
      logConsole(`Line ${state.currentLine + 1}: [錯誤] "${rhsName}" 未宣告`, 'error');
    }
    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── lhs->next = rhs->next  (複製 next 指標) ──────
  const setNextNextMatch = line.match(RE_SET_NEXT_NEXT);
  if (setNextNextMatch) {
    const lhsPtr = setNextNextMatch[1];
    const rhsPtr = setNextNextMatch[2];

    const lhsNode = state.ptrs[lhsPtr];
    const rhsNode = state.ptrs[rhsPtr];

    if (!lhsNode || !state.nodes[lhsNode]) {
      logConsole(`Line ${state.currentLine + 1}: [錯誤] "${lhsPtr}" 為 nullptr 或未宣告`, 'error');
      state.currentLine++;
      updateStepIndicator();
      return;
    }
    if (!rhsNode || !state.nodes[rhsNode]) {
      logConsole(`Line ${state.currentLine + 1}: [錯誤] "${rhsPtr}" 為 nullptr 或未宣告`, 'error');
      state.currentLine++;
      updateStepIndicator();
      return;
    }

    const copiedNext = state.nodes[rhsNode].nextName;
    state.nodes[lhsNode].nextName = copiedNext ?? null;

    const displayVal = copiedNext ? toHex(state.nodes[copiedNext]?.addr ?? 0) : 'nullptr';
    logConsole(
      `Line ${state.currentLine + 1}: ${lhsPtr}->next = ${rhsPtr}->next  (${displayVal})`,
      'success'
    );

    renderAllNodes();
    renderPtrTracker();
    triggerAnimation(document.getElementById(`nd-group-${lhsNode}`), 'node-highlight', 900);

    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── name->next = rhs ─────────────────────────────
  const setNextMatch = line.match(RE_SET_NEXT);
  if (setNextMatch) {
    const lhsPtrName = setNextMatch[1];
    const rhsName    = setNextMatch[2];

    const targetNodeName = state.ptrs[lhsPtrName];
    if (!targetNodeName || !state.nodes[targetNodeName]) {
      logConsole(`Line ${state.currentLine + 1}: [錯誤] "${lhsPtrName}" 為 nullptr 或未宣告`, 'error');
      // shake
      if (targetNodeName) {
        triggerAnimation(document.getElementById(`nd-group-${targetNodeName}`), 'node-highlight', 900);
      }
      state.currentLine++;
      updateStepIndicator();
      return;
    }

    if (rhsName === 'nullptr' || rhsName === 'NULL') {
      state.nodes[targetNodeName].nextName = null;
      logConsole(`Line ${state.currentLine + 1}: ${lhsPtrName}->next = nullptr`, 'success');
    } else {
      const nextNodeName = state.ptrs[rhsName];
      if (!nextNodeName || !state.nodes[nextNodeName]) {
        logConsole(`Line ${state.currentLine + 1}: [錯誤] "${rhsName}" 為 nullptr 或未宣告`, 'error');
        state.currentLine++;
        updateStepIndicator();
        return;
      }
      state.nodes[targetNodeName].nextName = nextNodeName;
      logConsole(
        `Line ${state.currentLine + 1}: ${lhsPtrName}->next = ${rhsName}  (${toHex(state.nodes[nextNodeName].addr)})`,
        'success'
      );
    }

    renderAllNodes();
    renderPtrTracker();

    // animate the node whose next just changed
    const groupEl = document.getElementById(`nd-group-${targetNodeName}`);
    triggerAnimation(groupEl, 'node-highlight', 900);

    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── name->data = val ─────────────────────────────
  const setDataMatch = line.match(RE_SET_DATA);
  if (setDataMatch) {
    const ptrName = setDataMatch[1];
    const val     = parseInt(setDataMatch[2], 10);
    const nodeName = state.ptrs[ptrName];

    if (!nodeName || !state.nodes[nodeName]) {
      logConsole(`Line ${state.currentLine + 1}: [錯誤] "${ptrName}" 為 nullptr 或未宣告`, 'error');
      state.currentLine++;
      updateStepIndicator();
      return;
    }

    state.nodes[nodeName].data = val;
    renderAllNodes();
    renderPtrTracker();

    const valEl = document.getElementById(`nd-val-${nodeName}`);
    triggerAnimation(valEl, 'node-highlight', 900);
    logConsole(`Line ${state.currentLine + 1}: ${ptrName}->data = ${val}`, 'success');
    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── cout << ptr->data ────────────────────────────
  const coutMatch = line.match(RE_COUT);
  if (coutMatch) {
    const ptrName  = coutMatch[1];
    const nodeName = state.ptrs[ptrName];

    if (!nodeName || !state.nodes[nodeName]) {
      logConsole(`Line ${state.currentLine + 1}: [錯誤] "${ptrName}" 為 nullptr 或未宣告`, 'error');
      state.currentLine++;
      updateStepIndicator();
      return;
    }

    const val = state.nodes[nodeName].data;
    // highlight the data cell
    const dataEl = document.getElementById(`nd-data-${nodeName}`);
    triggerAnimation(dataEl, 'node-highlight', 900);
    logConsole(`Line ${state.currentLine + 1}: cout << ${ptrName}->data  →  ${val}`, 'success');
    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── int x = ptr->data ────────────────────────────
  const readDataMatch = line.match(RE_READ_DATA);
  if (readDataMatch) {
    const lhsVar   = readDataMatch[1];
    const ptrName  = readDataMatch[2];
    const nodeName = state.ptrs[ptrName];

    if (!nodeName || !state.nodes[nodeName]) {
      logConsole(`Line ${state.currentLine + 1}: [錯誤] "${ptrName}" 為 nullptr 或未宣告`, 'error');
      state.currentLine++;
      updateStepIndicator();
      return;
    }

    const val = state.nodes[nodeName].data;
    const dataEl = document.getElementById(`nd-data-${nodeName}`);
    triggerAnimation(dataEl, 'node-highlight', 900);
    logConsole(`Line ${state.currentLine + 1}: int ${lhsVar} = ${ptrName}->data  →  ${val}`, 'success');
    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── Node* temp = ptr->next  (宣告新指標並指向某節點的 next) ──
  const ptrFromNextMatch = line.match(RE_PTR_FROM_NEXT);
  if (ptrFromNextMatch) {
    const lhsName = ptrFromNextMatch[1];
    const rhsPtr  = ptrFromNextMatch[2];
    const rhsNode = state.ptrs[rhsPtr];

    if (!rhsNode || !state.nodes[rhsNode]) {
      logConsole(`Line ${state.currentLine + 1}: [錯誤] "${rhsPtr}" 為 nullptr 或未宣告`, 'error');
      state.currentLine++;
      updateStepIndicator();
      return;
    }

    const nextNode = state.nodes[rhsNode].nextName;
    if (nextNode === undefined || nextNode === null) {
      logConsole(`Line ${state.currentLine + 1}: [錯誤] "${rhsPtr}->next" 尚未設定或為 nullptr`, 'error');
      state.currentLine++;
      updateStepIndicator();
      return;
    }

    state.ptrs[lhsName] = nextNode;
    renderAllNodes();
    renderPtrTracker();

    const addrStr = toHex(state.nodes[nextNode]?.addr ?? 0);
    logConsole(`Line ${state.currentLine + 1}: Node* ${lhsName} = ${rhsPtr}->next  → ${addrStr}`, 'declare');
    triggerAnimation(document.getElementById(`nd-group-${nextNode}`), 'node-ptr-update', 950);

    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── curr = curr->next  (ptr = ptr->next pattern) ─
  // e.g.  curr = curr->next;
  const ptrNextPattern = /^\s*(\w+)\s*=\s*(\w+)\s*->\s*next\s*;\s*(\/\/.*)?$/;
  const ptrNextMatch = line.match(ptrNextPattern);
  if (ptrNextMatch) {
    const lhsPtr   = ptrNextMatch[1];
    const rhsPtr   = ptrNextMatch[2];
    const rhsNode  = state.ptrs[rhsPtr];

    if (!rhsNode || !state.nodes[rhsNode]) {
      logConsole(`Line ${state.currentLine + 1}: [錯誤] "${rhsPtr}" 為 nullptr 或未宣告`, 'error');
      state.currentLine++;
      updateStepIndicator();
      return;
    }

    const nextNode = state.nodes[rhsNode].nextName;
    state.ptrs[lhsPtr] = nextNode ?? null;
    renderAllNodes();
    renderPtrTracker();

    const targetDisplay = nextNode ? toHex(state.nodes[nextNode]?.addr ?? 0) : 'nullptr';
    logConsole(`Line ${state.currentLine + 1}: ${lhsPtr} = ${rhsPtr}->next  →  ${targetDisplay}`, 'info');

    if (nextNode) {
      const groupEl = document.getElementById(`nd-group-${nextNode}`);
      triggerAnimation(groupEl, 'node-ptr-update', 950);
    }
    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── delete ptr ───────────────────────────────────
  const delMatch = line.match(RE_DELETE);
  if (delMatch) {
    const ptrName  = delMatch[1];
    const nodeName = state.ptrs[ptrName];

    if (!nodeName || !state.nodes[nodeName]) {
      logConsole(`Line ${state.currentLine + 1}: [錯誤] "${ptrName}" 為 nullptr 或未宣告`, 'error');
      state.currentLine++;
      updateStepIndicator();
      return;
    }

    // animate delete
    const groupEl = document.getElementById(`nd-group-${nodeName}`);
    triggerAnimation(groupEl, 'node-delete', 600);

    setTimeout(() => {
      state.nodes[nodeName].freed = true;
      state.ptrs[ptrName] = null;
      // remove from nodeOrder
      state.nodeOrder = state.nodeOrder.filter(n => n !== nodeName);
      delete state.nodes[nodeName];
      renderAllNodes();
      renderPtrTracker();
    }, 550);

    logConsole(`Line ${state.currentLine + 1}: delete ${ptrName}  → 釋放 ${toHex(state.nodes[nodeName].addr)}`, 'warn');
    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── int varName = literal ─────────────────────────
  const intDeclMatch = line.match(RE_INT_DECL);
  if (intDeclMatch) {
    const varName = intDeclMatch[1];
    const val     = parseInt(intDeclMatch[2], 10);
    state.vars[varName] = val;
    logConsole(`Line ${state.currentLine + 1}: int ${varName} = ${val}`, 'declare');
    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── bool varName = true/false ─────────────────────
  const boolDeclMatch = line.match(RE_BOOL_DECL);
  if (boolDeclMatch) {
    const varName = boolDeclMatch[1];
    const val     = boolDeclMatch[2] === 'true';
    state.vars[varName] = val;
    logConsole(`Line ${state.currentLine + 1}: bool ${varName} = ${val}`, 'declare');
    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── varName = true/false  (賦值) ──────────────────
  const boolAssignMatch = line.match(RE_BOOL_ASSIGN);
  if (boolAssignMatch) {
    const varName = boolAssignMatch[1];
    const val     = boolAssignMatch[2] === 'true';
    state.vars[varName] = val;
    logConsole(`Line ${state.currentLine + 1}: ${varName} = ${val}`, 'success');
    state.currentLine++;
    updateStepIndicator();
    return;
  }

  // ── if (ptr->data == val/var) { ───────────────────
  const ifDataEqMatch = line.match(RE_IF_DATA_EQ);
  if (ifDataEqMatch) {
    const ptrName  = ifDataEqMatch[1];
    const rhsToken = ifDataEqMatch[2];
    const nodeName = state.ptrs[ptrName];

    if (!nodeName || !state.nodes[nodeName]) {
      logConsole(`Line ${state.currentLine + 1}: [錯誤] "${ptrName}" 為 nullptr 或未宣告`, 'error');
      state.currentLine++;
      updateStepIndicator();
      return;
    }

    const dataVal = state.nodes[nodeName].data;
    const compareVal = /^-?\d+$/.test(rhsToken)
      ? parseInt(rhsToken, 10)
      : (state.vars[rhsToken] !== undefined ? state.vars[rhsToken] : null);

    if (compareVal === null) {
      logConsole(`Line ${state.currentLine + 1}: [錯誤] "${rhsToken}" 未宣告`, 'error');
      state.currentLine++;
      updateStepIndicator();
      return;
    }

    if (dataVal === compareVal) {
      triggerAnimation(document.getElementById(`nd-data-${nodeName}`), 'node-highlight', 900);
      logConsole(
        `Line ${state.currentLine + 1}: if (${ptrName}->data == ${rhsToken}) ✓  (${dataVal} == ${compareVal})`,
        'success'
      );
      state.currentLine++;
    } else {
      logConsole(
        `Line ${state.currentLine + 1}: if (${ptrName}->data == ${rhsToken}) ✗  (${dataVal} ≠ ${compareVal})`,
        'dim'
      );
      state.currentLine = findMatchingBrace(state.currentLine) + 1;
    }
    updateStepIndicator();
    return;
  }

  // ── break ─────────────────────────────────────────
  if (RE_BREAK.test(line)) {
    const whileLine = findEnclosingWhile(state.currentLine - 1);
    if (whileLine >= 0) {
      state.currentLine = findMatchingBrace(whileLine) + 1;
      logConsole(`Line ${state.currentLine}: break → 離開迴圈`, 'info');
    } else {
      state.currentLine++;
    }
    updateStepIndicator();
    return;
  }

  // ── ptr = rhs  (無型別宣告的指標重新指向) ─────────
  const ptrReassignMatch = line.match(RE_PTR_REASSIGN);
  if (ptrReassignMatch) {
    const lhsName = ptrReassignMatch[1];
    const rhsName = ptrReassignMatch[2];

    // 只處理已知 ptr 變數
    if (state.ptrs[lhsName] === undefined) {
      logConsole(`Line ${state.currentLine + 1}: [Skipped] ${line}`, 'warn');
      state.currentLine++;
      updateStepIndicator();
      return;
    }

    if (rhsName === 'nullptr' || rhsName === 'NULL') {
      state.ptrs[lhsName] = null;
      renderAllNodes();
      renderPtrTracker();
      logConsole(`Line ${state.currentLine + 1}: ${lhsName} = nullptr`, 'info');
    } else if (state.ptrs[rhsName] !== undefined) {
      state.ptrs[lhsName] = state.ptrs[rhsName];
      renderAllNodes();
      renderPtrTracker();
      const target = state.ptrs[lhsName];
      const addrStr = target ? toHex(state.nodes[target]?.addr ?? 0) : 'nullptr';
      logConsole(`Line ${state.currentLine + 1}: ${lhsName} = ${rhsName}  → ${addrStr}`, 'info');
      if (target) {
        triggerAnimation(document.getElementById(`nd-group-${target}`), 'node-ptr-update', 950);
      }
    } else {
      logConsole(`Line ${state.currentLine + 1}: [錯誤] "${rhsName}" 未宣告`, 'error');
    }
    state.currentLine++;
    updateStepIndicator();
    return;
  }

  logConsole(`Line ${state.currentLine + 1}: [Skipped] ${line}`, 'warn');
  state.currentLine++;
  updateStepIndicator();
}

// ─── Step Back ────────────────────────────────────────────────────────────────

function stepBack() {
  const snap = history.pop();
  if (!snap) return;

  state.currentLine  = snap.currentLine;
  state.nodes        = snap.nodes;
  state.nodeOrder    = snap.nodeOrder;
  state.ptrs         = snap.ptrs;
  state.vars         = snap.vars;
  state.addrCounter  = snap.addrCounter;

  renderAllNodes();
  renderPtrTracker();

  consoleOutput.innerHTML = snap.consoleHTML;
  updateStepIndicator();

  if (typeof window.setActiveLine === 'function') {
    window.setActiveLine(state.currentLine - 1);
  }

  btnStep.disabled     = false;
  btnStepBack.disabled = history.isEmpty;
}

// ─── Reset ────────────────────────────────────────────────────────────────────

function reset() {
  state.lines       = codeInput.value.split('\n');
  state.currentLine = 0;
  state.nodes       = {};
  state.nodeOrder   = [];
  state.ptrs        = {};
  state.vars        = {};
  state.addrCounter = 0x2000;

  llHeapRegion.innerHTML = '';
  llPtrRegion.innerHTML  = '';
  llEmptyState.classList.remove('hidden');

  consoleOutput.innerHTML =
    '<span class="console-line dim console-placeholder">// 按下 STEP 開始執行...</span>';

  btnStep.disabled     = false;
  btnStepBack.disabled = true;
  history.clear();

  if (typeof window.setActiveLine === 'function') window.setActiveLine(-1);
  updateStepIndicator();
}

// ─── Operation Loader ─────────────────────────────────────────────────────────

window.loadOperation = function (key) {
  const op = OPERATIONS[key];
  if (!op) return;
  state.currentOp = key;

  document.querySelectorAll('.op-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.op === key);
  });

  if (opDesc) opDesc.textContent = op.desc;

  codeInput.value = op.code;
  codeInput.dispatchEvent(new Event('input'));
  reset();
};

// ─── Event Listeners ──────────────────────────────────────────────────────────

btnStep.addEventListener('click', stepOneLine);
btnStepBack.addEventListener('click', stepBack);
btnReset.addEventListener('click', reset);
btnClearConsole.addEventListener('click', () => {
  consoleOutput.innerHTML = '<span class="console-line dim">// console cleared</span>';
});
codeInput.addEventListener('input', () => {
  if (state.currentLine === 0) {
    state.lines = codeInput.value.split('\n');
    updateStepIndicator();
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

(function init() {
  window.loadOperation('build');

  // Re-draw arrows when viewport is resized so clamp()-based widths stay in sync
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => requestAnimationFrame(renderArrows), 100);
  });
})();
