/**
 * stack-vis.js  —  Stack Visualizer
 *
 * Supported syntax (all keyed to a fixed `stk[5]` + `top` variable):
 *   int stk[5];             → declare the stack array
 *   int top = -1;           → initialise the top pointer
 *   stk[++top] = value;     → push
 *   int var = stk[top--];   → pop  (value lingers in memory for ~400ms)
 *   int var = stk[top];     → peek (top unchanged)
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const CAPACITY = 5;

// ─── Operation Presets ────────────────────────────────────────────────────────

const OPERATIONS = {
  push: {
    label: 'PUSH',
    zh:    '推入',
    desc:  '將元素推入頂端：top 先加一再寫入 stk[++top] — O(1)',
    code:
`int stk[5];
int top = -1;
// Push three elements
stk[++top] = 10;
stk[++top] = 20;
stk[++top] = 30;`,
  },
  pop: {
    label: 'POP',
    zh:    '彈出',
    desc:  '取出頂端元素：讀取後 top 後減一；舊值仍殘留在記憶體 — O(1)',
    code:
`int stk[5];
int top = -1;
stk[++top] = 10;
stk[++top] = 20;
stk[++top] = 30;
// Pop top element
int val = stk[top--];
int val2 = stk[top--];`,
  },
  peek: {
    label: 'PEEK',
    zh:    '查頂',
    desc:  '讀取頂端值但不改變 top，top 指標保持不動 — O(1)',
    code:
`int stk[5];
int top = -1;
stk[++top] = 42;
stk[++top] = 15;
stk[++top] = 7;
// Peek — read without popping
int x = stk[top];`,
  },
  overflow: {
    label: 'OVERFLOW',
    zh:    '溢出',
    desc:  '容量已滿時繼續 push → Stack Overflow，程式停止',
    code:
`int stk[5];
int top = -1;
stk[++top] = 1;
stk[++top] = 2;
stk[++top] = 3;
stk[++top] = 4;
stk[++top] = 5;
// Stack full — overflow!
stk[++top] = 6;`,
  },
  underflow: {
    label: 'UNDERFLOW',
    zh:    '下溢',
    desc:  '空 Stack 執行 pop → Stack Underflow / undefined behavior',
    code:
`int stk[5];
int top = -1;
// Stack is empty — underflow!
int val = stk[top--];`,
  },
};

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  currentLine:  0,
  lines:        [],
  cells:        new Array(CAPACITY).fill(null), // null = uninitialised
  top:          -1,
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
const stackContainer  = document.getElementById('stack-container');
const stackWrapper    = document.getElementById('stack-wrapper');
const stackEmpty      = document.getElementById('stack-empty');
const stepIndicator   = document.getElementById('step-indicator');
const stackInfo       = document.getElementById('stack-info');
const cppEquivalent   = document.getElementById('cpp-equivalent');
const cppEquivText    = document.getElementById('cpp-equiv-text');
const opDesc          = document.getElementById('op-desc');

// ─── Regex Patterns ───────────────────────────────────────────────────────────

const RE_DECLARE = /^\s*int\s+stk\s*\[\s*(\d+)\s*\];\s*(\/\/.*)?$/;
const RE_INIT    = /^\s*int\s+(\w+)\s*=\s*(-?\d+)\s*;\s*(\/\/.*)?$/;
const RE_PUSH    = /^\s*stk\s*\[\s*\+\+top\s*\]\s*=\s*(-?\d+)\s*;\s*(\/\/.*)?$/;
const RE_POP     = /^\s*int\s+(\w+)\s*=\s*stk\s*\[\s*top--\s*\];\s*(\/\/.*)?$/;
const RE_PEEK    = /^\s*int\s+(\w+)\s*=\s*stk\s*\[\s*top\s*\];\s*(\/\/.*)?$/;
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

// ─── Stack Rendering ─────────────────────────────────────────────────────────

function renderStack() {
  stackContainer.innerHTML = '';

  for (let i = CAPACITY - 1; i >= 0; i--) {
    const row = document.createElement('div');
    row.className = 'stack-row';
    row.id = `stack-row-${i}`;

    // Left: top-pointer column
    const ptrCol = document.createElement('div');
    ptrCol.className = 'stack-top-ptr';
    ptrCol.id = `stack-ptr-${i}`;
    if (i === state.top) {
      ptrCol.innerHTML = '<span class="top-arrow">→ top</span>';
    }

    // Center: cell
    const cell = document.createElement('div');
    cell.className = 'array-cell stack-cell';
    cell.id = `stack-cell-${i}`;
    if (state.cells[i] !== null) cell.classList.add('initialized');

    const valueSpan = document.createElement('span');
    valueSpan.className = 'cell-value';
    valueSpan.id = `stack-val-${i}`;
    valueSpan.textContent = state.cells[i] !== null ? state.cells[i] : '?';
    cell.appendChild(valueSpan);

    // Right: index label
    const indexEl = document.createElement('div');
    indexEl.className = 'cell-index stack-cell-index';
    indexEl.innerHTML =
      `<span class="cell-index-label">[</span>${i}<span class="cell-index-label">]</span>`;

    // Right: address label
    const addrEl = document.createElement('div');
    addrEl.className = 'stack-cell-addr';
    addrEl.textContent = state.baseAddr !== null
      ? toHex(state.baseAddr + i * 4)
      : '—';

    row.appendChild(ptrCol);
    row.appendChild(cell);
    row.appendChild(indexEl);
    row.appendChild(addrEl);
    stackContainer.appendChild(row);
  }

  if (stackInfo) {
    stackInfo.textContent = state.baseAddr !== null
      ? `top = ${state.top}  ·  capacity = ${CAPACITY}`
      : '';
  }

  if (state.baseAddr !== null) {
    stackEmpty.classList.add('hidden');
    stackWrapper.classList.remove('hidden');
  }
}

/** Refresh only the top-pointer badges and info text (no full re-render). */
function updateTopPointer() {
  for (let i = 0; i < CAPACITY; i++) {
    const ptrEl = document.getElementById(`stack-ptr-${i}`);
    if (!ptrEl) continue;
    ptrEl.innerHTML = i === state.top
      ? '<span class="top-arrow">→ top</span>'
      : '';
  }
  if (stackInfo) {
    stackInfo.textContent = `top = ${state.top}  ·  capacity = ${CAPACITY}`;
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
    top:          state.top,
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

  // ── Declare: int stk[5]; ────────────────────────────
  const declMatch = line.match(RE_DECLARE);
  if (declMatch) {
    const size = parseInt(declMatch[1], 10);
    state.baseAddr    = state.addrCounter;
    state.addrCounter += size * 4 + 0x100;
    renderStack();
    logConsole(
      `Line ${state.currentLine}: Declared  int stk[${size}]  — ${size * 4} bytes at ${toHex(state.baseAddr)}`,
      'declare'
    );
    return;
  }

  // ── Init variable: int top = -1; ────────────────────
  const initMatch = line.match(RE_INIT);
  if (initMatch) {
    const varName = initMatch[1];
    const value   = parseInt(initMatch[2], 10);
    state.vars[varName] = value;
    if (varName === 'top') {
      state.top = value;
      if (state.baseAddr !== null) updateTopPointer();
    }
    logConsole(`Line ${state.currentLine}: int ${varName} = ${value}`, 'info');
    return;
  }

  // ── Push: stk[++top] = value; ───────────────────────
  const pushMatch = line.match(RE_PUSH);
  if (pushMatch) {
    const value = parseInt(pushMatch[1], 10);

    if (state.top >= CAPACITY - 1) {
      // OVERFLOW
      state.done = true;
      btnStep.disabled = true;
      logConsole(
        `Line ${state.currentLine}: *** STACK OVERFLOW! (top = ${state.top}, capacity = ${CAPACITY}) ***`,
        'error'
      );
      logConsole('  Attempted to push onto a full stack — undefined behavior in C++!', 'error');
      // Shake + red-pulse all cells
      for (let i = 0; i < CAPACITY; i++) {
        const c = document.getElementById(`stack-cell-${i}`);
        if (c) triggerAnimation(c, 'stack-cell-overflow', 700);
      }
      cppEquivText.textContent = `stk[++top] = ${value};  // ERROR: stack overflow!`;
      cppEquivalent.classList.remove('hidden');
      return;
    }

    state.top++;
    state.cells[state.top] = value;
    state.vars['top']      = state.top;

    const addr = state.baseAddr !== null
      ? toHex(state.baseAddr + state.top * 4)
      : '—';

    renderStack();

    const cell = document.getElementById(`stack-cell-${state.top}`);
    if (cell) triggerAnimation(cell, 'stack-cell-push', 450);

    logConsole(`Line ${state.currentLine}: Push  ${value}  →  stk[${state.top}]  (${addr})`, 'success');
    cppEquivText.textContent =
      `stk[++top] = ${value};  // top = ${state.top}, addr = ${addr}`;
    cppEquivalent.classList.remove('hidden');
    return;
  }

  // ── Pop: int val = stk[top--]; ──────────────────────
  const popMatch = line.match(RE_POP);
  if (popMatch) {
    const varName = popMatch[1];

    if (state.top < 0) {
      state.done = true;
      btnStep.disabled = true;
      logConsole(
        `Line ${state.currentLine}: *** STACK UNDERFLOW! (top = ${state.top}, stack is empty) ***`,
        'error'
      );
      logConsole('  Attempted to pop from an empty stack — undefined behavior in C++!', 'error');
      cppEquivText.textContent =
        `int ${varName} = stk[top--];  // ERROR: stack underflow!`;
      cppEquivalent.classList.remove('hidden');
      return;
    }

    const oldTop = state.top;
    const val    = state.cells[oldTop];
    const addr   = state.baseAddr !== null
      ? toHex(state.baseAddr + oldTop * 4)
      : '—';

    // Mutate state immediately (for correct stepBack snapshots)
    state.vars[varName] = val;
    state.vars['top']   = state.top - 1;
    state.top--;
    state.cells[oldTop] = null; // logically popped

    // Re-render (this draws oldTop cell as uninitialized / '?')
    renderStack();

    // Cosmetic: briefly restore residual value in the DOM to simulate
    // C++ memory semantics (bits are still there until overwritten)
    const cellEl  = document.getElementById(`stack-cell-${oldTop}`);
    const valSpan = document.getElementById(`stack-val-${oldTop}`);
    if (cellEl && valSpan) {
      valSpan.textContent = val;          // show residual value
      cellEl.classList.add('initialized');
      triggerAnimation(cellEl, 'stack-cell-pop', 600);
      setTimeout(() => {
        if (valSpan) valSpan.textContent = '?';
        if (cellEl)  cellEl.classList.remove('initialized');
      }, 400);
    }

    logConsole(
      `Line ${state.currentLine}: Pop  stk[${oldTop}] = ${val}  →  ${varName}  (${addr})`,
      'success'
    );
    logConsole(`  → Memory at ${addr} still holds ${val} until overwritten`, 'dim');
    cppEquivText.textContent =
      `int ${varName} = stk[top--];  // ${varName} = ${val}, top now = ${state.top}`;
    cppEquivalent.classList.remove('hidden');
    return;
  }

  // ── Peek: int x = stk[top]; ─────────────────────────
  const peekMatch = line.match(RE_PEEK);
  if (peekMatch) {
    const varName = peekMatch[1];

    if (state.top < 0) {
      state.done = true;
      btnStep.disabled = true;
      logConsole(
        `Line ${state.currentLine}: *** STACK UNDERFLOW! (top = ${state.top}, stack is empty) ***`,
        'error'
      );
      return;
    }

    const val  = state.cells[state.top];
    const addr = state.baseAddr !== null
      ? toHex(state.baseAddr + state.top * 4)
      : '—';
    state.vars[varName] = val;

    const cell = document.getElementById(`stack-cell-${state.top}`);
    if (cell) triggerAnimation(cell, 'highlight', 950);

    logConsole(
      `Line ${state.currentLine}: Peek  stk[${state.top}] = ${val}  →  ${varName}  (top unchanged, ${addr})`,
      'success'
    );
    cppEquivText.textContent =
      `int ${varName} = stk[top];  // ${varName} = ${val}, top still = ${state.top}`;
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
  state.top         = snap.top;
  state.vars        = snap.vars;
  state.addrCounter = snap.addrCounter;
  state.baseAddr    = snap.baseAddr;
  state.done        = snap.done;

  if (state.baseAddr === null) {
    stackContainer.innerHTML = '';
    stackWrapper.classList.add('hidden');
    stackEmpty.classList.remove('hidden');
    if (stackInfo) stackInfo.textContent = '';
  } else {
    renderStack();
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
  state.top         = -1;
  state.vars        = {};
  state.addrCounter = 0x1000;
  state.baseAddr    = null;
  state.done        = false;

  stackContainer.innerHTML = '';
  stackWrapper.classList.add('hidden');
  stackEmpty.classList.remove('hidden');
  if (stackInfo) stackInfo.textContent = '';
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
  window.loadOperation('push');
})();
