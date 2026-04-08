/**
 * queue-vis.js  —  Queue Visualizer
 *
 * Supported syntax (all keyed to a fixed `q[5]` + `front`/`rear` variables):
 *   int q[5];                    → declare the queue array
 *   int front = 0, rear = -1;   → initialise front and rear pointers
 *   q[++rear] = value;           → enqueue
 *   int var = q[front++];        → dequeue (value stays as residual in memory)
 *   int var = q[front];          → peek (front unchanged)
 *
 * Three visual states for each cell:
 *   initialized — front <= i <= rear  (logically part of the queue)
 *   residual    — i < front but was previously enqueued (bits still in memory)
 *   uninit      — never written (never enqueued since last reset)
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const CAPACITY = 5;

// ─── Operation Presets ────────────────────────────────────────────────────────

const OPERATIONS = {
  enqueue: {
    label: 'ENQUEUE',
    zh:    '入列',
    desc:  '將元素加入佇列尾端：rear 先加一再寫入 q[++rear] — O(1)',
    code:
`int q[5];
int front = 0, rear = -1;
// Enqueue three elements
q[++rear] = 10;
q[++rear] = 20;
q[++rear] = 30;`,
  },
  dequeue: {
    label: 'DEQUEUE',
    zh:    '出列',
    desc:  '取出佇列頭端元素：讀取 q[front] 後 front 加一；舊值仍殘留在記憶體 — O(1)',
    code:
`int q[5];
int front = 0, rear = -1;
q[++rear] = 10;
q[++rear] = 20;
q[++rear] = 30;
// Dequeue front element
int val = q[front++];
int val2 = q[front++];`,
  },
  peek: {
    label: 'PEEK',
    zh:    '查頭',
    desc:  '讀取佇列頭端值但不改變 front，front 指標保持不動 — O(1)',
    code:
`int q[5];
int front = 0, rear = -1;
q[++rear] = 42;
q[++rear] = 15;
q[++rear] = 7;
// Peek — read front without dequeuing
int x = q[front];`,
  },
  overflow: {
    label: 'OVERFLOW',
    zh:    '溢出',
    desc:  '容量已滿時繼續 enqueue → Queue Overflow，程式停止',
    code:
`int q[5];
int front = 0, rear = -1;
q[++rear] = 1;
q[++rear] = 2;
q[++rear] = 3;
q[++rear] = 4;
q[++rear] = 5;
// Queue full — overflow!
q[++rear] = 6;`,
  },
  underflow: {
    label: 'UNDERFLOW',
    zh:    '下溢',
    desc:  '空 Queue 執行 dequeue → Queue Underflow / undefined behavior',
    code:
`int q[5];
int front = 0, rear = -1;
// Queue is empty — underflow!
int val = q[front++];`,
  },
};

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  currentLine:  0,
  lines:        [],
  cells:        new Array(CAPACITY).fill(null), // null = never written
  front:        0,
  rear:         -1,
  residual:     [],   // indices of cells that were dequeued (bits still in memory)
  vars:         {},
  addrCounter:  0x1000,
  baseAddr:     null,
  done:         false,
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
const queueContainer  = document.getElementById('queue-container');
const queuePtrRow     = document.getElementById('queue-ptr-row');
const queueIndexRow   = document.getElementById('queue-index-row');
const queueAddrRow    = document.getElementById('queue-addr-row');
const queueWrapper    = document.getElementById('queue-wrapper');
const queueEmpty      = document.getElementById('queue-empty');
const stepIndicator   = document.getElementById('step-indicator');
const queueInfo       = document.getElementById('queue-info');
const cppEquivalent   = document.getElementById('cpp-equivalent');
const cppEquivText    = document.getElementById('cpp-equiv-text');
const opDesc          = document.getElementById('op-desc');

// ─── Regex Patterns ───────────────────────────────────────────────────────────

const RE_DECLARE = /^\s*int\s+q\s*\[\s*(\d+)\s*\];\s*(\/\/.*)?$/;
// Supports: "int front = 0, rear = -1;" (combined) or "int front = 0;" / "int rear = -1;" (single)
const RE_INIT_COMBINED = /^\s*int\s+(front|rear)\s*=\s*(-?\d+)\s*,\s*(front|rear)\s*=\s*(-?\d+)\s*;\s*(\/\/.*)?$/;
const RE_INIT_SINGLE   = /^\s*int\s+(front|rear)\s*=\s*(-?\d+)\s*;\s*(\/\/.*)?$/;
const RE_ENQUEUE = /^\s*q\s*\[\s*\+\+rear\s*\]\s*=\s*(-?\d+)\s*;\s*(\/\/.*)?$/;
const RE_DEQUEUE = /^\s*int\s+(\w+)\s*=\s*q\s*\[\s*front\+\+\s*\];\s*(\/\/.*)?$/;
const RE_PEEK    = /^\s*int\s+(\w+)\s*=\s*q\s*\[\s*front\s*\];\s*(\/\/.*)?$/;
const RE_BLANK   = /^\s*(\/\/.*)?$/;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toHex(addr) {
  return '0x' + addr.toString(16).toUpperCase().padStart(4, '0');
}

function logConsole(message, type = 'info') {
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
  element.classList.remove(className);
  void element.offsetWidth; // force reflow so re-adding fires fresh
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), durationMs);
}

// ─── Queue Rendering ─────────────────────────────────────────────────────────

function renderQueue() {
  queuePtrRow.innerHTML   = '';
  queueContainer.innerHTML = '';
  queueIndexRow.innerHTML  = '';
  queueAddrRow.innerHTML   = '';

  for (let i = 0; i < CAPACITY; i++) {
    // ── Pointer row ──
    const ptrSlot = document.createElement('div');
    ptrSlot.className = 'queue-ptr-slot';
    ptrSlot.id = `queue-ptr-${i}`;

    const isFront = i === state.front;
    const isRear  = i === state.rear;

    if (isFront && isRear) {
      ptrSlot.classList.add('dual');
      ptrSlot.innerHTML =
        '<span class="queue-front-arrow">front↓</span>' +
        '<span class="queue-rear-arrow">rear↓</span>';
    } else if (isFront) {
      ptrSlot.innerHTML = '<span class="queue-front-arrow">front↓</span>';
    } else if (isRear) {
      ptrSlot.innerHTML = '<span class="queue-rear-arrow">rear↓</span>';
    }
    queuePtrRow.appendChild(ptrSlot);

    // ── Cell ──
    const isActive   = i >= state.front && i <= state.rear;
    const isResidual = !isActive && state.residual.includes(i);

    const cell = document.createElement('div');
    cell.id = `queue-cell-${i}`;
    if (isActive) {
      cell.className = 'array-cell queue-cell initialized';
    } else if (isResidual) {
      cell.className = 'array-cell queue-cell queue-cell-residual';
    } else {
      cell.className = 'array-cell queue-cell';
    }

    const valueSpan = document.createElement('span');
    valueSpan.className = 'cell-value';
    valueSpan.id = `queue-val-${i}`;
    valueSpan.textContent = (isActive || isResidual) ? state.cells[i] : '?';
    cell.appendChild(valueSpan);
    queueContainer.appendChild(cell);

    // ── Index row ──
    const indexSlot = document.createElement('div');
    indexSlot.className = 'queue-index-slot';
    indexSlot.textContent = `[${i}]`;
    queueIndexRow.appendChild(indexSlot);

    // ── Addr row ──
    const addrSlot = document.createElement('div');
    addrSlot.className = 'queue-addr-slot';
    addrSlot.textContent = state.baseAddr !== null
      ? toHex(state.baseAddr + i * 4)
      : '—';
    queueAddrRow.appendChild(addrSlot);
  }

  if (queueInfo) {
    queueInfo.textContent = state.baseAddr !== null
      ? `front = ${state.front}  ·  rear = ${state.rear}  ·  capacity = ${CAPACITY}`
      : '';
  }

  if (state.baseAddr !== null) {
    queueEmpty.classList.add('hidden');
    queueWrapper.classList.remove('hidden');
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function stepOneLine() {
  if (state.done) {
    logConsole('Execution halted. Press Reset to start over.', 'dim');
    return;
  }
  if (state.currentLine >= state.lines.length) {
    logConsole('Program finished. Press Reset to start over.', 'dim');
    btnStep.disabled = true;
    return;
  }

  // Snapshot BEFORE any mutation so stepBack() can restore this moment
  history.push({
    currentLine:  state.currentLine,
    cells:        [...state.cells],
    front:        state.front,
    rear:         state.rear,
    residual:     [...state.residual],
    vars:         { ...state.vars },
    addrCounter:  state.addrCounter,
    baseAddr:     state.baseAddr,
    done:         state.done,
    consoleHTML:  consoleOutput.innerHTML,
    cppEquivText: cppEquivalent.classList.contains('hidden')
      ? null : cppEquivText.textContent,
  });
  btnStepBack.disabled = false;

  const rawLine = state.lines[state.currentLine];
  const line    = rawLine.trim();
  state.currentLine++;
  updateStepIndicator();
  if (typeof window.setActiveLine === 'function') {
    window.setActiveLine(state.currentLine - 1);
  }

  // ── Skip blank / comment ────────────────────────────
  if (RE_BLANK.test(line)) return;

  // ── Declare: int q[5]; ──────────────────────────────
  const declMatch = line.match(RE_DECLARE);
  if (declMatch) {
    const size = parseInt(declMatch[1], 10);
    state.baseAddr    = state.addrCounter;
    state.addrCounter += size * 4 + 0x100;
    renderQueue();
    logConsole(
      `Line ${state.currentLine}: Declared  int q[${size}]  — ${size * 4} bytes at ${toHex(state.baseAddr)}`,
      'declare'
    );
    return;
  }

  // ── Init: int front = 0, rear = -1; (combined or single) ──
  const combinedMatch = line.match(RE_INIT_COMBINED);
  if (combinedMatch) {
    const name1 = combinedMatch[1];
    const val1  = parseInt(combinedMatch[2], 10);
    const name2 = combinedMatch[3];
    const val2  = parseInt(combinedMatch[4], 10);

    state.vars[name1] = val1;
    state.vars[name2] = val2;
    if (name1 === 'front' || name2 === 'front') {
      state.front = (name1 === 'front') ? val1 : val2;
    }
    if (name1 === 'rear' || name2 === 'rear') {
      state.rear = (name1 === 'rear') ? val1 : val2;
    }
    if (state.baseAddr !== null) renderQueue();
    logConsole(
      `Line ${state.currentLine}: int front = ${state.front}, rear = ${state.rear}`,
      'info'
    );
    return;
  }

  const singleMatch = line.match(RE_INIT_SINGLE);
  if (singleMatch) {
    const varName = singleMatch[1];
    const value   = parseInt(singleMatch[2], 10);
    state.vars[varName] = value;
    if (varName === 'front') state.front = value;
    if (varName === 'rear')  state.rear  = value;
    if (state.baseAddr !== null) renderQueue();
    logConsole(`Line ${state.currentLine}: int ${varName} = ${value}`, 'info');
    return;
  }

  // ── Enqueue: q[++rear] = value; ─────────────────────
  const enqMatch = line.match(RE_ENQUEUE);
  if (enqMatch) {
    const value = parseInt(enqMatch[1], 10);

    if (state.rear >= CAPACITY - 1) {
      // OVERFLOW
      state.done = true;
      btnStep.disabled = true;
      logConsole(
        `Line ${state.currentLine}: *** QUEUE OVERFLOW! (rear = ${state.rear}, capacity = ${CAPACITY}) ***`,
        'error'
      );
      logConsole('  Attempted to enqueue onto a full queue — undefined behavior in C++!', 'error');
      for (let i = 0; i < CAPACITY; i++) {
        const c = document.getElementById(`queue-cell-${i}`);
        if (c) triggerAnimation(c, 'queue-cell-overflow', 700);
      }
      cppEquivText.textContent = `q[++rear] = ${value};  // ERROR: queue overflow!`;
      cppEquivalent.classList.remove('hidden');
      return;
    }

    state.rear++;
    state.cells[state.rear] = value;
    state.vars['rear'] = state.rear;
    // Overwriting a residual slot clears its residual status
    state.residual = state.residual.filter(i => i !== state.rear);

    const addr = state.baseAddr !== null
      ? toHex(state.baseAddr + state.rear * 4)
      : '—';

    renderQueue();

    const cell = document.getElementById(`queue-cell-${state.rear}`);
    if (cell) triggerAnimation(cell, 'queue-cell-enqueue', 400);

    logConsole(`Line ${state.currentLine}: Enqueue  ${value}  →  q[${state.rear}]  (${addr})`, 'success');
    cppEquivText.textContent =
      `q[++rear] = ${value};  // rear = ${state.rear}, addr = ${addr}`;
    cppEquivalent.classList.remove('hidden');
    return;
  }

  // ── Dequeue: int val = q[front++]; ──────────────────
  const deqMatch = line.match(RE_DEQUEUE);
  if (deqMatch) {
    const varName = deqMatch[1];

    if (state.front > state.rear || state.front >= CAPACITY) {
      state.done = true;
      btnStep.disabled = true;
      logConsole(
        `Line ${state.currentLine}: *** QUEUE UNDERFLOW! (front = ${state.front}, rear = ${state.rear}, queue is empty) ***`,
        'error'
      );
      logConsole('  Attempted to dequeue from an empty queue — undefined behavior in C++!', 'error');
      cppEquivText.textContent =
        `int ${varName} = q[front++];  // ERROR: queue underflow!`;
      cppEquivalent.classList.remove('hidden');
      return;
    }

    const oldFront = state.front;
    const val      = state.cells[oldFront];
    const addr     = state.baseAddr !== null
      ? toHex(state.baseAddr + oldFront * 4)
      : '—';

    // Log before animation
    logConsole(
      `Line ${state.currentLine}: Dequeue  q[${oldFront}] = ${val}  →  ${varName}  (${addr})`,
      'success'
    );
    logConsole(`  → q[${oldFront}] still holds ${val} in memory (residual)`, 'dim');
    cppEquivText.textContent =
      `int ${varName} = q[front++];  // ${varName} = ${val}, front now = ${state.front + 1}`;
    cppEquivalent.classList.remove('hidden');

    // Trigger dequeue animation, then update state + re-render after it completes
    const cellEl = document.getElementById(`queue-cell-${oldFront}`);
    if (cellEl) triggerAnimation(cellEl, 'queue-cell-dequeue', 500);

    setTimeout(() => {
      state.vars[varName] = val;
      state.vars['front'] = state.front + 1;
      state.residual.push(oldFront);
      state.front++;
      renderQueue();
    }, 450);

    return;
  }

  // ── Peek: int x = q[front]; ─────────────────────────
  const peekMatch = line.match(RE_PEEK);
  if (peekMatch) {
    const varName = peekMatch[1];

    if (state.front > state.rear) {
      state.done = true;
      btnStep.disabled = true;
      logConsole(
        `Line ${state.currentLine}: *** QUEUE UNDERFLOW! (front = ${state.front}, rear = ${state.rear}, queue is empty) ***`,
        'error'
      );
      return;
    }

    const val  = state.cells[state.front];
    const addr = state.baseAddr !== null
      ? toHex(state.baseAddr + state.front * 4)
      : '—';
    state.vars[varName] = val;

    const cell = document.getElementById(`queue-cell-${state.front}`);
    if (cell) triggerAnimation(cell, 'highlight', 950);

    logConsole(
      `Line ${state.currentLine}: Peek  q[${state.front}] = ${val}  →  ${varName}  (front unchanged, ${addr})`,
      'success'
    );
    cppEquivText.textContent =
      `int ${varName} = q[front];  // ${varName} = ${val}, front still = ${state.front}`;
    cppEquivalent.classList.remove('hidden');
    return;
  }

  logConsole(`Line ${state.currentLine}: [Skipped] ${line}`, 'warn');
}

// ─── Step Back ───────────────────────────────────────────────────────────────

function stepBack() {
  const snap = history.pop();
  if (!snap) return;

  state.currentLine = snap.currentLine;
  state.cells       = snap.cells;
  state.front       = snap.front;
  state.rear        = snap.rear;
  state.residual    = snap.residual;
  state.vars        = snap.vars;
  state.addrCounter = snap.addrCounter;
  state.baseAddr    = snap.baseAddr;
  state.done        = snap.done;

  if (state.baseAddr === null) {
    queuePtrRow.innerHTML    = '';
    queueContainer.innerHTML = '';
    queueIndexRow.innerHTML  = '';
    queueAddrRow.innerHTML   = '';
    queueWrapper.classList.add('hidden');
    queueEmpty.classList.remove('hidden');
    if (queueInfo) queueInfo.textContent = '';
  } else {
    renderQueue();
  }

  consoleOutput.innerHTML = snap.consoleHTML;
  if (snap.cppEquivText !== null) {
    cppEquivText.textContent = snap.cppEquivText;
    cppEquivalent.classList.remove('hidden');
  } else {
    cppEquivalent.classList.add('hidden');
  }

  updateStepIndicator();
  if (typeof window.setActiveLine === 'function') {
    window.setActiveLine(state.currentLine - 1);
  }

  btnStep.disabled = false;
  btnStepBack.disabled = history.isEmpty;
}

// ─── Reset ───────────────────────────────────────────────────────────────────

function reset() {
  state.lines       = codeInput.value.split('\n');
  state.currentLine = 0;
  state.cells       = new Array(CAPACITY).fill(null);
  state.front       = 0;
  state.rear        = -1;
  state.residual    = [];
  state.vars        = {};
  state.addrCounter = 0x1000;
  state.baseAddr    = null;
  state.done        = false;

  queuePtrRow.innerHTML    = '';
  queueContainer.innerHTML = '';
  queueIndexRow.innerHTML  = '';
  queueAddrRow.innerHTML   = '';
  queueWrapper.classList.add('hidden');
  queueEmpty.classList.remove('hidden');
  if (queueInfo) queueInfo.textContent = '';
  cppEquivalent.classList.add('hidden');
  consoleOutput.innerHTML =
    '<span class="console-line dim console-placeholder">// 按下 STEP 開始執行...</span>';

  btnStep.disabled = false;
  history.clear();
  btnStepBack.disabled = true;
  if (typeof window.setActiveLine === 'function') window.setActiveLine(-1);
  updateStepIndicator();
}

// ─── Operation Loader ────────────────────────────────────────────────────────

window.loadOperation = function (key) {
  const op = OPERATIONS[key];
  if (!op) return;

  document.querySelectorAll('.op-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.op === key);
  });

  if (opDesc) opDesc.textContent = op.desc;
  codeInput.value = op.code;
  codeInput.dispatchEvent(new Event('input')); // sync gutter
  reset();
};

// ─── Event Listeners ─────────────────────────────────────────────────────────

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

// ─── Init ────────────────────────────────────────────────────────────────────

(function init() {
  window.loadOperation('enqueue');
})();
