'use strict';

/**
 * history.js — Generic undo stack for *-vis units.
 *
 * Each unit creates one StepHistory instance and manages its own snapshot
 * schema. This module only handles push / pop / clear — it knows nothing
 * about any specific data structure.
 *
 * Typical usage in a *-vis.js unit:
 *
 *   const history = new StepHistory();
 *
 *   // At the START of stepOneLine(), before any mutation:
 *   history.push({
 *     // ...unit-specific state fields (plain JSON-serialisable values)...
 *     consoleHTML:  consoleOutput.innerHTML,
 *   });
 *   btnStepBack.disabled = false;
 *
 *   // In stepBack():
 *   const snap = history.pop();
 *   if (!snap) return;
 *   // ...restore state fields and re-render...
 *   btnStepBack.disabled = history.isEmpty;
 *
 *   // In reset():
 *   history.clear();
 *   btnStepBack.disabled = true;
 */
class StepHistory {
  constructor() {
    this._stack = [];
  }

  /**
   * Push a snapshot. The snapshot is deep-copied via JSON round-trip,
   * so all fields must be plain JSON-serialisable (no DOM refs, no Functions).
   * @param {object} snapshot
   */
  push(snapshot) {
    this._stack.push(JSON.parse(JSON.stringify(snapshot)));
  }

  /**
   * Remove and return the most recent snapshot, or null if the stack is empty.
   * @returns {object|null}
   */
  pop() {
    return this._stack.length > 0 ? this._stack.pop() : null;
  }

  /** Discard all stored snapshots. Call this on reset. */
  clear() {
    this._stack = [];
  }

  /** True when there is nothing to step back to. */
  get isEmpty() {
    return this._stack.length === 0;
  }
}
