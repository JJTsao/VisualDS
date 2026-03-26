/**
 * array-vis.js
 * Array Visualizer — Core Parser & Animation Logic
 *
 * Supported C++ syntax:
 *   int <name>[<size>];              → declare array, render cells
 *   <name>[<index>] = <value>;       → assign value (with bounds check)
 */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  currentLine: 0,       // index into lines[]
  lines: [],            // raw lines from textarea
  arrayName: null,      // declared array variable name
  arraySize: 0,         // declared array size
  baseAddress: 0x1000,  // simulated base memory address
  values: [],           // current values in each cell (null = uninitialized)
};

// ─── DOM References ───────────────────────────────────────────────────────────

const codeInput      = document.getElementById('code-input');
const btnStep        = document.getElementById('btn-step');
const btnReset       = document.getElementById('btn-reset');
const btnClearConsole = document.getElementById('btn-clear-console');
const consoleOutput  = document.getElementById('console-output');
const arrayContainer = document.getElementById('array-container');
const arrayWrapper   = document.getElementById('array-wrapper');
const emptyState     = document.getElementById('empty-state');
const stepIndicator  = document.getElementById('step-indicator');
const arrayInfo      = document.getElementById('array-info');
const cppEquivalent  = document.getElementById('cpp-equivalent');
const cppEquivText   = document.getElementById('cpp-equiv-text');

// ─── Regex Patterns ───────────────────────────────────────────────────────────

const RE_DECLARE  = /^\s*int\s+(\w+)\s*\[\s*(\d+)\s*\]\s*;\s*(\/\/.*)?$/;
const RE_ASSIGN   = /^\s*(\w+)\s*\[\s*(\d+)\s*\]\s*=\s*(-?\d+)\s*;\s*(\/\/.*)?$/;
const RE_BLANK    = /^\s*(\/\/.*)?$/;  // blank line or comment-only

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a number to a hex address string: 0x1000 */
function toHex(addr) {
  return '0x' + addr.toString(16).toUpperCase().padStart(4, '0');
}

/** Append a line to the console output */
function logConsole(message, type = 'info') {
  // Remove initial placeholder if still showing
  const placeholder = consoleOutput.querySelector('p.text-slate-600');
  if (placeholder) placeholder.remove();

  const span = document.createElement('span');
  span.className = `console-line ${type}`;

  // Add a prompt prefix per type
  const prefix = {
    info:    '  ',
    success: '✓ ',
    warn:    '⚠ ',
    error:   '✗ ',
    declare: '» ',
    dim:     '  ',
  }[type] || '  ';

  span.textContent = prefix + message;
  consoleOutput.appendChild(span);
  consoleOutput.appendChild(document.createElement('br'));
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

/** Update the step counter badge */
function updateStepIndicator() {
  const total = state.lines.length;
  const current = Math.min(state.currentLine, total);
  stepIndicator.textContent = `line: ${current} / ${total}`;
}

/** Flash an animation class on an element, then remove it */
function triggerAnimation(element, className, durationMs = 1000) {
  element.classList.remove(className);
  // Force reflow so the animation restarts if triggered again
  void element.offsetWidth;
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), durationMs);
}

// ─── Array Rendering ─────────────────────────────────────────────────────────

/**
 * Build the initial array cells after a declaration.
 * Each cell shows: [address above] [value box] [index below]
 */
function renderArrayCells() {
  arrayContainer.innerHTML = '';

  for (let i = 0; i < state.arraySize; i++) {
    const addr = state.baseAddress + i * 4;
    const val  = state.values[i];

    const wrapper = document.createElement('div');
    wrapper.className = 'array-cell-wrapper';
    wrapper.id = `cell-wrapper-${i}`;

    // Address label (top)
    const addrEl = document.createElement('div');
    addrEl.className = 'cell-address';
    addrEl.textContent = toHex(addr);

    // Cell box
    const cell = document.createElement('div');
    cell.className = 'array-cell';
    cell.id = `cell-${i}`;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'cell-value';
    valueSpan.id = `cell-value-${i}`;
    valueSpan.textContent = val !== null ? val : '?';

    cell.appendChild(valueSpan);

    // Index label (bottom)
    const indexEl = document.createElement('div');
    indexEl.className = 'cell-index';
    indexEl.innerHTML = `<span class="cell-index-label">[</span>${i}<span class="cell-index-label">]</span>`;

    wrapper.appendChild(addrEl);
    wrapper.appendChild(cell);
    wrapper.appendChild(indexEl);
    arrayContainer.appendChild(wrapper);
  }

  // Show array, hide empty state
  emptyState.classList.add('hidden');
  arrayWrapper.classList.remove('hidden');

  // Update info badge
  arrayInfo.textContent = `${state.arrayName}[${state.arraySize}]  base: ${toHex(state.baseAddress)}  total: ${state.arraySize * 4} bytes`;
}

/** Update a single cell's displayed value */
function updateCellValue(index, value) {
  state.values[index] = value;
  const cell      = document.getElementById(`cell-${index}`);
  const valueSpan = document.getElementById(`cell-value-${index}`);
  if (!cell || !valueSpan) return;

  // Mark as initialized
  cell.classList.add('initialized');

  // Animate highlight (access flash) on the cell
  triggerAnimation(cell, 'highlight', 950);

  // Update the value text and animate it
  setTimeout(() => {
    valueSpan.textContent = value;
    triggerAnimation(valueSpan, 'value-change', 600);
  }, 200);

  // Update C++ pointer-arithmetic equivalent
  showCppEquivalent(index, value);
}

/** Show the pointer arithmetic equivalent */
function showCppEquivalent(index, value) {
  const addr = toHex(state.baseAddress + index * 4);
  cppEquivText.textContent =
    `*(${state.arrayName} + ${index})  =  ${value};   // ${addr}`;
  cppEquivalent.classList.remove('hidden');
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse and execute one line of code.
 * Returns false if there are no more lines.
 */
function stepOneLine() {
  if (state.currentLine >= state.lines.length) {
    logConsole('Program finished. Press Reset to start over.', 'dim');
    btnStep.disabled = true;
    btnStep.classList.add('opacity-40', 'cursor-not-allowed');
    return;
  }

  const rawLine = state.lines[state.currentLine];
  const line    = rawLine.trim();
  state.currentLine++;
  updateStepIndicator();

  // Highlight current line in the textarea (visual cue via step indicator)
  highlightTextareaLine(state.currentLine - 1);

  // ── Skip blank lines / comments ─────────────────────
  if (RE_BLANK.test(line)) {
    logConsole(`Line ${state.currentLine}: (skipped)`, 'dim');
    return;
  }

  // ── Declaration: int name[size]; ────────────────────
  const declMatch = line.match(RE_DECLARE);
  if (declMatch) {
    const name = declMatch[1];
    const size = parseInt(declMatch[2], 10);

    state.arrayName = name;
    state.arraySize = size;
    state.values    = new Array(size).fill(null);

    renderArrayCells();

    logConsole(`Line ${state.currentLine}: Declared  int ${name}[${size}]`, 'declare');
    logConsole(
      `Allocated ${size * 4} bytes at ${toHex(state.baseAddress)} – ${toHex(state.baseAddress + size * 4 - 1)}`,
      'info'
    );
    return;
  }

  // ── Assignment: name[index] = value; ────────────────
  const assignMatch = line.match(RE_ASSIGN);
  if (assignMatch) {
    const name  = assignMatch[1];
    const index = parseInt(assignMatch[2], 10);
    const value = parseInt(assignMatch[3], 10);

    // Verify the variable name matches what was declared
    if (state.arrayName === null) {
      logConsole(`Line ${state.currentLine}: Error — array "${name}" not declared yet.`, 'error');
      return;
    }
    if (name !== state.arrayName) {
      logConsole(`Line ${state.currentLine}: Error — unknown variable "${name}".`, 'error');
      return;
    }

    // ── Bounds Check ──────────────────────────────────
    if (index >= state.arraySize || index < 0) {
      // Shake the whole array container
      triggerAnimation(arrayContainer, 'error-shake', 700);

      // Log in big red text
      logConsole(
        `Line ${state.currentLine}: *** Error: Index Out of Bounds! ***`,
        'error'
      );
      logConsole(
        `  Attempted access: ${name}[${index}]  (valid range: 0 – ${state.arraySize - 1})`,
        'error'
      );
      logConsole(
        `  Memory Access Violation! (Segmentation Fault in real C++)`,
        'error'
      );
      return;
    }

    // ── Legal Assignment ───────────────────────────────
    updateCellValue(index, value);

    const addr = toHex(state.baseAddress + index * 4);
    logConsole(
      `Line ${state.currentLine}: Assigned value ${value} to ${name}[${index}]  (${addr})`,
      'success'
    );
    return;
  }

  // ── Unrecognised syntax ──────────────────────────────
  logConsole(`Line ${state.currentLine}: [Skipped] Unsupported syntax: "${line}"`, 'warn');
}

// ─── Textarea Line Highlighting ───────────────────────────────────────────────

/**
 * Sync the line gutter highlight in array-vis.html.
 * Calls window.setActiveLine() which is defined inline in the HTML.
 */
function highlightTextareaLine(lineIndex) {
  if (typeof window.setActiveLine === 'function') {
    window.setActiveLine(lineIndex);
  }
}

// ─── Reset ────────────────────────────────────────────────────────────────────

function reset() {
  // Parse textarea fresh
  const raw = codeInput.value;
  state.lines       = raw.split('\n');
  state.currentLine = 0;
  state.arrayName   = null;
  state.arraySize   = 0;
  state.values      = [];

  // Clear UI
  arrayContainer.innerHTML = '';
  arrayWrapper.classList.add('hidden');
  emptyState.classList.remove('hidden');
  arrayInfo.textContent = '';
  cppEquivalent.classList.add('hidden');

  // Reset console
  consoleOutput.innerHTML = '<p class="text-slate-600 italic">// 按下 Step 開始執行程式碼...</p>';

  // Re-enable step button
  btnStep.disabled = false;
  btnStep.classList.remove('opacity-40', 'cursor-not-allowed');

  updateStepIndicator();
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

btnStep.addEventListener('click', stepOneLine);

btnReset.addEventListener('click', reset);

btnClearConsole.addEventListener('click', () => {
  consoleOutput.innerHTML = '<p class="text-slate-600 italic">// console cleared</p>';
});

// Re-parse whenever the user edits the textarea
codeInput.addEventListener('input', () => {
  // If not yet started, just update line count in indicator
  if (state.currentLine === 0) {
    state.lines = codeInput.value.split('\n');
    updateStepIndicator();
  }
});

// ─── Initialise on Load ───────────────────────────────────────────────────────

(function init() {
  state.lines = codeInput.value.split('\n');
  updateStepIndicator();

  logConsole('Visualizer ready. Press Step to execute line by line.', 'dim');
})();
