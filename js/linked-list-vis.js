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
};

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  currentLine:  0,
  lines:        [],

  // { [varName]: { addr: number, data: number|null, nextName: string|null, freed: boolean } }
  nodes:        {},
  nodeOrder:    [],   // 建立順序

  // 所有 Node* 變數 → 所指向的 nodeVarName 或 null
  ptrs:         {},   // { [varName]: string|null }

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

const RE_BLANK        = /^\s*(\/\/.*)?$/;
const RE_NEW_NODE     = /^\s*Node\s*\*\s*(\w+)\s*=\s*new\s+Node\s*\(\s*(-?\d+)\s*\)\s*;\s*(\/\/.*)?$/;
const RE_PTR_ASSIGN   = /^\s*Node\s*\*\s*(\w+)\s*=\s*(nullptr|NULL|\w+)\s*;\s*(\/\/.*)?$/;
const RE_SET_NEXT     = /^\s*(\w+)\s*->\s*next\s*=\s*(nullptr|NULL|\w+)\s*;\s*(\/\/.*)?$/;
const RE_SET_DATA     = /^\s*(\w+)\s*->\s*data\s*=\s*(-?\d+)\s*;\s*(\/\/.*)?$/;
const RE_READ_DATA    = /^\s*int\s+(\w+)\s*=\s*(\w+)\s*->\s*data\s*;\s*(\/\/.*)?$/;
const RE_COUT         = /^\s*cout\s*<<\s*(\w+)->data\s*(<<\s*["\s]+)?\s*;?\s*(\/\/.*)?$/;
const RE_WHILE        = /^\s*while\s*\(\s*(\w+)\s*!=\s*(nullptr|NULL)\s*\)\s*\{?\s*$/;
const RE_OPEN_BRACE   = /^\s*\{\s*$/;
const RE_CLOSE_BRACE  = /^\s*\}\s*$/;
const RE_DELETE       = /^\s*delete\s+(\w+)\s*;\s*(\/\/.*)?$/;

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
    return;
  }

  llEmptyState.classList.add('hidden');

  chain.forEach((name, idx) => {
    const node = state.nodes[name];
    if (!node) return;

    const dataAddr = toHex(node.addr);
    const nextAddr = toHex(node.addr + 4);

    // ── node group ──
    const group = document.createElement('div');
    group.className = 'll-node-group';
    group.id = `nd-group-${name}`;

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

    // var labels (all ptrs pointing to this node)
    const labelRow = document.createElement('div');
    labelRow.className = 'node-name-row';
    const pointingPtrs = ptrsPointingTo(name);
    // Always show the node's own var name if it's in ptrs
    const labelsToShow = pointingPtrs.length > 0 ? pointingPtrs : [name];
    labelsToShow.forEach(lbl => {
      const sp = document.createElement('span');
      sp.className = 'node-var-label';
      sp.textContent = lbl;
      labelRow.appendChild(sp);
    });

    group.appendChild(addrRow);
    group.appendChild(box);
    group.appendChild(labelRow);

    llHeapRegion.appendChild(group);

    // ── arrow or null after node ──
    const isLast = idx === chain.length - 1;
    const hasNext = node.nextName !== null && node.nextName !== undefined;

    if (hasNext && !isLast) {
      const arrow = document.createElement('div');
      arrow.className = 'node-arrow';
      arrow.id = `nd-arrow-${name}`;
      llHeapRegion.appendChild(arrow);
    } else if (node.nextName === null) {
      // explicit nullptr
      const nullDiv = document.createElement('div');
      nullDiv.className = 'node-null';
      nullDiv.id = `nd-arrow-${name}`;
      nullDiv.innerHTML = `<span class="node-null-label">NULL</span>`;
      llHeapRegion.appendChild(nullDiv);
    } else if (!hasNext && isLast) {
      // next not set yet — show question mark
      const nullDiv = document.createElement('div');
      nullDiv.className = 'node-null';
      nullDiv.id = `nd-arrow-${name}`;
      nullDiv.innerHTML = `<span class="node-null-label" style="color:var(--text-muted);">?</span>`;
      llHeapRegion.appendChild(nullDiv);
    }
  });
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

  // ── 閉括號 } — 跳回 while ────────────────────────
  if (RE_CLOSE_BRACE.test(line)) {
    state.currentLine = findLoopStart(state.currentLine);
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
})();
