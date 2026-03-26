/**
 * array-vis.js  —  Array Visualizer (multi-array refactor)
 *
 * Supported syntax:
 *   int name[size];            → declare array
 *   name[i] = number;          → assign literal value
 *   dst[i] = src[j];           → copy element between arrays (or within same)
 *   int x = name[i];           → read / access (highlight only)
 */

'use strict';

// ─── Operation Presets ────────────────────────────────────────────────────────

const OPERATIONS = {
  access: {
    label: 'ACCESS',
    zh: '元素檢索',
    desc: '透過索引直接存取元素，定址公式：base + i × 4 — O(1)',
    code:
`int arr[6];
arr[0] = 10;
arr[1] = 25;
arr[2] = 37;
arr[3] = 42;
arr[4] = 58;
arr[5] = 71;
// 直接索引存取 — O(1)
int x = arr[3];
int y = arr[0];`,
  },
  write: {
    label: 'WRITE',
    zh: '元素覆寫',
    desc: '覆寫指定索引的值，原值直接被取代 — O(1)',
    code:
`int arr[5] = {10, 20, 30, 40, 50};
// 覆寫 index 2
arr[2] = 99;
arr[4] = 77;`,
  },
  copy: {
    label: 'COPY',
    zh: '陣列複製',
    desc: '逐元素複製到新陣列，需 O(n) 時間與額外 O(n) 空間',
    code:
`int src[4] = {5, 12, 8, 3};
// 複製到 dst
int dst[4] = {0, 0, 0, 0};
dst[0] = src[0];
dst[1] = src[1];
dst[2] = src[2];
dst[3] = src[3];`,
  },
  insert: {
    label: 'INSERT',
    zh: '插入元素',
    desc: '在 index 2 插入 99，後續元素需逐一右移 — O(n)',
    code:
`int arr[6] = {10, 20, 30, 40, 50, 0};
// 在 index 2 插入 99 (先右移)
arr[5] = arr[4];
arr[4] = arr[3];
arr[3] = arr[2];
arr[2] = 99;`,
  },
  delete: {
    label: 'DELETE',
    zh: '刪除元素',
    desc: '刪除 index 2，後續元素需逐一左移，末位清零 — O(n)',
    code:
`int arr[5] = {10, 20, 30, 40, 50};
// 刪除 index 2 (左移覆蓋)
arr[2] = arr[3];
arr[3] = arr[4];
arr[4] = 0;`,
  },
};

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  currentLine:  0,
  lines:        [],
  arrays:       {},      // name → { size, values[], baseAddr }
  arrayOrder:   [],      // names in declaration order
  addrCounter:  0x1000,  // next base address to assign
  currentOp:    null,
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
const arrayContainer  = document.getElementById('array-container');
const arrayWrapper    = document.getElementById('array-wrapper');
const emptyState      = document.getElementById('empty-state');
const stepIndicator   = document.getElementById('step-indicator');
const arrayInfo       = document.getElementById('array-info');
const cppEquivalent   = document.getElementById('cpp-equivalent');
const cppEquivText    = document.getElementById('cpp-equiv-text');
const opDesc          = document.getElementById('op-desc');

// ─── Regex Patterns ───────────────────────────────────────────────────────────

const RE_DECLARE      = /^\s*int\s+(\w+)\s*\[\s*(\d+)\s*\];\s*(\/\/.*)?$/;
const RE_DECLARE_INIT = /^\s*int\s+(\w+)\s*\[\s*(\d+)\s*\]\s*=\s*\{([^}]*)\};\s*(\/\/.*)?$/;
const RE_ASSIGN_LIT   = /^\s*(\w+)\s*\[\s*(\d+)\s*\]\s*=\s*(-?\d+)\s*;\s*(\/\/.*)?$/;
const RE_ASSIGN_ARR   = /^\s*(\w+)\s*\[\s*(\d+)\s*\]\s*=\s*(\w+)\s*\[\s*(\d+)\s*\];\s*(\/\/.*)?$/;
const RE_READ         = /^\s*int\s+\w+\s*=\s*(\w+)\s*\[\s*(\d+)\s*\];\s*(\/\/.*)?$/;
const RE_BLANK        = /^\s*(\/\/.*)?$/;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), durationMs);
}

// ─── ID Conventions ───────────────────────────────────────────────────────────

const cellId      = (name, i) => `cell-${name}-${i}`;
const cellValueId = (name, i) => `cell-value-${name}-${i}`;
const cellsId     = (name)    => `array-cells-${name}`;

// ─── Array Rendering ──────────────────────────────────────────────────────────

function renderAllArrays() {
  arrayContainer.innerHTML = '';

  for (const name of state.arrayOrder) {
    const arr = state.arrays[name];

    // Group container
    const group = document.createElement('div');
    group.className = 'array-group';
    group.id = `array-group-${name}`;

    // Header: variable name + memory info
    const header = document.createElement('div');
    header.className = 'array-group-header';
    header.innerHTML =
      `<span class="array-group-name">${name}</span>` +
      `<span class="array-group-meta">` +
        `base: ${toHex(arr.baseAddr)} &nbsp;·&nbsp; ${arr.size} × 4 = ${arr.size * 4} bytes` +
      `</span>`;
    group.appendChild(header);

    // Cells row
    const cellsRow = document.createElement('div');
    cellsRow.className = 'array-cells';
    cellsRow.id = cellsId(name);

    for (let i = 0; i < arr.size; i++) {
      const addr = arr.baseAddr + i * 4;

      const wrapper = document.createElement('div');
      wrapper.className = 'array-cell-wrapper';

      const addrEl = document.createElement('div');
      addrEl.className = 'cell-address';
      addrEl.textContent = toHex(addr);

      const cell = document.createElement('div');
      cell.className = 'array-cell';
      cell.id = cellId(name, i);

      const valueSpan = document.createElement('span');
      valueSpan.className = 'cell-value';
      valueSpan.id = cellValueId(name, i);
      valueSpan.textContent = arr.values[i] !== null ? arr.values[i] : '?';
      if (arr.values[i] !== null) cell.classList.add('initialized');
      cell.appendChild(valueSpan);

      const indexEl = document.createElement('div');
      indexEl.className = 'cell-index';
      indexEl.innerHTML = `<span class="cell-index-label">[</span>${i}<span class="cell-index-label">]</span>`;

      wrapper.appendChild(addrEl);
      wrapper.appendChild(cell);
      wrapper.appendChild(indexEl);
      cellsRow.appendChild(wrapper);
    }

    group.appendChild(cellsRow);
    arrayContainer.appendChild(group);
  }

  // Update info badge
  const summary = state.arrayOrder
    .map(n => `${n}[${state.arrays[n].size}]`)
    .join('  ');
  arrayInfo.textContent = summary;

  emptyState.classList.add('hidden');
  arrayWrapper.classList.remove('hidden');
}

function updateCellValue(name, index, value) {
  const arr = state.arrays[name];
  arr.values[index] = value;

  const cell      = document.getElementById(cellId(name, index));
  const valueSpan = document.getElementById(cellValueId(name, index));
  if (!cell || !valueSpan) return;

  cell.classList.add('initialized');
  triggerAnimation(cell, 'highlight', 950);
  setTimeout(() => {
    valueSpan.textContent = value;
    triggerAnimation(valueSpan, 'value-change', 600);
  }, 200);
}

function highlightRead(name, index) {
  const cell = document.getElementById(cellId(name, index));
  if (cell) triggerAnimation(cell, 'highlight', 950);
}

function triggerOOBError(name) {
  const cellsEl = document.getElementById(cellsId(name));
  if (cellsEl) triggerAnimation(cellsEl, 'error-shake', 700);
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function stepOneLine() {
  if (state.currentLine >= state.lines.length) {
    logConsole('Program finished. Press Reset to start over.', 'dim');
    btnStep.disabled = true;
    return;
  }

  // Snapshot BEFORE any mutation so stepBack() can restore this moment
  history.push({
    currentLine:  state.currentLine,
    arrays:       state.arrays,
    arrayOrder:   state.arrayOrder,
    addrCounter:  state.addrCounter,
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

  // ── Skip blank / comment ─────────────────────────────
  if (RE_BLANK.test(line)) return;

  // ── Declaration: int name[size]; ────────────────────
  const declMatch = line.match(RE_DECLARE);
  if (declMatch) {
    const name = declMatch[1];
    const size = parseInt(declMatch[2], 10);
    const base = state.addrCounter;
    state.addrCounter += size * 4 + 0x100; // gap between arrays

    state.arrays[name] = { size, values: new Array(size).fill(null), baseAddr: base };
    state.arrayOrder.push(name);
    renderAllArrays();

    logConsole(`Line ${state.currentLine}: Declared  int ${name}[${size}]`, 'declare');
    logConsole(`  → ${size * 4} bytes at ${toHex(base)} – ${toHex(base + size * 4 - 1)}`, 'info');
    return;
  }

  // ── Declaration with init: int name[size] = {v0, v1, ...}; ─
  const declInitMatch = line.match(RE_DECLARE_INIT);
  if (declInitMatch) {
    const name   = declInitMatch[1];
    const size   = parseInt(declInitMatch[2], 10);
    const tokens = declInitMatch[3].split(',').map(s => s.trim()).filter(s => s !== '');
    const base   = state.addrCounter;
    state.addrCounter += size * 4 + 0x100;

    const values = new Array(size).fill(null);
    for (let i = 0; i < size && i < tokens.length; i++) {
      const v = parseInt(tokens[i], 10);
      if (!isNaN(v)) values[i] = v;
    }

    state.arrays[name] = { size, values, baseAddr: base };
    state.arrayOrder.push(name);
    renderAllArrays();

    logConsole(`Line ${state.currentLine}: Declared  int ${name}[${size}] = {${tokens.slice(0, size).join(', ')}}`, 'declare');
    logConsole(`  → ${size * 4} bytes at ${toHex(base)} – ${toHex(base + size * 4 - 1)}`, 'info');
    return;
  }

  // ── Read: int x = name[i]; ──────────────────────────
  const readMatch = line.match(RE_READ);
  if (readMatch) {
    const srcName  = readMatch[1];
    const srcIndex = parseInt(readMatch[2], 10);
    const arr = state.arrays[srcName];

    if (!arr) {
      logConsole(`Line ${state.currentLine}: Error — "${srcName}" not declared.`, 'error');
      return;
    }
    if (srcIndex < 0 || srcIndex >= arr.size) {
      triggerOOBError(srcName);
      logConsole(`Line ${state.currentLine}: *** Index Out of Bounds — ${srcName}[${srcIndex}] ***`, 'error');
      return;
    }

    const val  = arr.values[srcIndex] !== null ? arr.values[srcIndex] : '?';
    const addr = toHex(arr.baseAddr + srcIndex * 4);
    highlightRead(srcName, srcIndex);
    logConsole(`Line ${state.currentLine}: Read  ${srcName}[${srcIndex}] = ${val}  (${addr})`, 'success');
    cppEquivText.textContent = `*(${srcName} + ${srcIndex})  →  ${val};   // ${addr}`;
    cppEquivalent.classList.remove('hidden');
    return;
  }

  // ── Assign from array: dst[i] = src[j]; ─────────────
  // Must check BEFORE RE_ASSIGN_LIT to avoid false match
  const arrMatch = line.match(RE_ASSIGN_ARR);
  if (arrMatch) {
    const dstName  = arrMatch[1], dstIdx = parseInt(arrMatch[2], 10);
    const srcName  = arrMatch[3], srcIdx = parseInt(arrMatch[4], 10);
    const dstArr   = state.arrays[dstName];
    const srcArr   = state.arrays[srcName];

    if (!srcArr) { logConsole(`Line ${state.currentLine}: Error — "${srcName}" not declared.`, 'error'); return; }
    if (!dstArr) { logConsole(`Line ${state.currentLine}: Error — "${dstName}" not declared.`, 'error'); return; }
    if (srcIdx < 0 || srcIdx >= srcArr.size) {
      triggerOOBError(srcName);
      logConsole(`Line ${state.currentLine}: *** Index Out of Bounds — ${srcName}[${srcIdx}] ***`, 'error');
      return;
    }
    if (dstIdx < 0 || dstIdx >= dstArr.size) {
      triggerOOBError(dstName);
      logConsole(`Line ${state.currentLine}: *** Index Out of Bounds — ${dstName}[${dstIdx}] ***`, 'error');
      return;
    }

    const val = srcArr.values[srcIdx] !== null ? srcArr.values[srcIdx] : 0;
    // Read source first, then write to destination
    highlightRead(srcName, srcIdx);
    setTimeout(() => updateCellValue(dstName, dstIdx, val), 200);

    const srcAddr = toHex(srcArr.baseAddr + srcIdx * 4);
    const dstAddr = toHex(dstArr.baseAddr + dstIdx * 4);
    logConsole(
      `Line ${state.currentLine}: Copy  ${srcName}[${srcIdx}](${srcAddr}) → ${dstName}[${dstIdx}](${dstAddr})  val=${val}`,
      'success'
    );
    cppEquivText.textContent =
      `*(${dstName}+${dstIdx}) = *(${srcName}+${srcIdx});   // val = ${val}`;
    cppEquivalent.classList.remove('hidden');
    return;
  }

  // ── Assign literal: name[i] = value; ────────────────
  const litMatch = line.match(RE_ASSIGN_LIT);
  if (litMatch) {
    const name  = litMatch[1];
    const index = parseInt(litMatch[2], 10);
    const value = parseInt(litMatch[3], 10);
    const arr   = state.arrays[name];

    if (!arr) { logConsole(`Line ${state.currentLine}: Error — "${name}" not declared.`, 'error'); return; }

    if (index < 0 || index >= arr.size) {
      triggerOOBError(name);
      logConsole(`Line ${state.currentLine}: *** Error: Index Out of Bounds! ***`, 'error');
      logConsole(`  Attempted: ${name}[${index}]  valid range: 0 – ${arr.size - 1}`, 'error');
      logConsole(`  Memory Access Violation! (Segmentation Fault in C++)`, 'error');
      return;
    }

    updateCellValue(name, index, value);
    const addr = toHex(arr.baseAddr + index * 4);
    logConsole(`Line ${state.currentLine}: Assigned ${value} → ${name}[${index}]  (${addr})`, 'success');
    cppEquivText.textContent = `*(${name} + ${index})  =  ${value};   // ${addr}`;
    cppEquivalent.classList.remove('hidden');
    return;
  }

  logConsole(`Line ${state.currentLine}: [Skipped] ${line}`, 'warn');
}

// ─── Step Back ───────────────────────────────────────────────────────────────

function stepBack() {
  const snap = history.pop();
  if (!snap) return;

  // Restore interpreter state
  state.currentLine  = snap.currentLine;
  state.arrays       = snap.arrays;
  state.arrayOrder   = snap.arrayOrder;
  state.addrCounter  = snap.addrCounter;

  // Re-render memory layout from restored state
  if (state.arrayOrder.length === 0) {
    arrayContainer.innerHTML = '';
    arrayWrapper.classList.add('hidden');
    emptyState.classList.remove('hidden');
    arrayInfo.textContent = '';
  } else {
    renderAllArrays();
  }

  // Restore console and cpp-equiv panel
  consoleOutput.innerHTML = snap.consoleHTML;
  if (snap.cppEquivText !== null) {
    cppEquivText.textContent = snap.cppEquivText;
    cppEquivalent.classList.remove('hidden');
  } else {
    cppEquivalent.classList.add('hidden');
  }

  // Sync indicators
  updateStepIndicator();
  if (typeof window.setActiveLine === 'function') {
    window.setActiveLine(state.currentLine - 1);
  }

  // Re-enable step; disable back if stack is now empty
  btnStep.disabled = false;
  btnStepBack.disabled = history.isEmpty;
}

// ─── Reset ───────────────────────────────────────────────────────────────────

function reset() {
  state.lines       = codeInput.value.split('\n');
  state.currentLine = 0;
  state.arrays      = {};
  state.arrayOrder  = [];
  state.addrCounter = 0x1000;

  arrayContainer.innerHTML = '';
  arrayWrapper.classList.add('hidden');
  emptyState.classList.remove('hidden');
  arrayInfo.textContent = '';
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
  state.currentOp = key;

  // Update active tab
  document.querySelectorAll('.op-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.op === key);
  });

  // Update description
  if (opDesc) opDesc.textContent = op.desc;

  // Load preset code and reset
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
  window.loadOperation('access');
})();
