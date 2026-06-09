// ════════════════════════════════════════════════════════════════════════════
//  Generic trace engine (NO DOM) — the chapter-agnostic core.
//
//  Every chapter reduces its algorithm to an ordered list of ATOMIC STEPS, each
//  with a single canonical `answer`. The UI renders a widget per step `kind`;
//  this engine grades any step the same way (compare given vs answer). New
//  chapters need only a stepper that emits steps + a renderer per kind — the
//  grading/scoring below is shared. Dijkstra (extract + each relax = one step)
//  and BST-delete (search dir / classify / pick-node / number) both fit this.
//
//  Step shape:
//    { key:string, phase:string|number, kind:string, prompt:string,
//      answer:any, options?:[{value,label}], focusNode?:any, ...meta }
// ════════════════════════════════════════════════════════════════════════════

/** Equality that treats Infinity as a value and compares numbers loosely (UI gives strings). */
export function answersEqual(given, expected) {
  if (given === Infinity || expected === Infinity) return given === expected;
  if (typeof expected === 'number' || typeof given === 'number') return Number(given) === Number(expected);
  return given === expected;
}

/** Grade one step. */
export function gradeStep(step, given) {
  return { key: step.key, correct: answersEqual(given, step.answer), given, expected: step.answer };
}

/**
 * Score a full submission.
 * @param {Array} steps                 reference steps (the canonical trace)
 * @param {Object<string,any>} answers  map step.key → student's given answer
 */
export function scoreSteps(steps, answers) {
  let earned = 0;
  const results = steps.map((s) => {
    const r = gradeStep(s, answers ? answers[s.key] : undefined);
    if (r.correct) earned++;
    return r;
  });
  return {
    earned,
    total: steps.length,
    percent: steps.length ? Math.round((earned / steps.length) * 100) : 0,
    results,
  };
}

/** Group steps by their `phase` (preserving first-seen order) — used for lock-step UI. */
export function groupByPhase(steps) {
  const order = [];
  const map = new Map();
  for (const s of steps) {
    if (!map.has(s.phase)) { map.set(s.phase, []); order.push(s.phase); }
    map.get(s.phase).push(s);
  }
  return order.map((phase) => ({ phase, steps: map.get(phase) }));
}
