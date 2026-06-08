// ════════════════════════════════════════════════════════════════════════════
//  Trace grader (NO DOM) — compares a student's step answers against a reference
//  trace, lock-step. Each step is scored independently against the CANONICAL
//  state, so one wrong step never cascades (the UI reveals the correct state and
//  advances from it). Pure functions: usable live in the front-end prototype and
//  authoritatively on the server.
//
//  This grader is generic in spirit; the helpers below are the Dijkstra binding.
// ════════════════════════════════════════════════════════════════════════════

import { relaxTargets } from './dijkstra.js';

/** Numeric equality that treats Infinity (∞) as a first-class value. */
export function numEq(a, b) {
  if (a === Infinity || b === Infinity) return a === b;
  return Number(a) === Number(b);
}

/**
 * Grade the "which node to extract this round?" sub-step.
 * @returns {{unit:'extract', correct:boolean, given:number, expected:number}}
 */
export function checkExtract(round, studentNode) {
  return {
    unit: 'extract',
    correct: studentNode === round.extract,
    given: studentNode,
    expected: round.extract,
  };
}

/**
 * Grade the relaxation fills for a round. The student enters the resulting
 * tentative distance for every unvisited neighbour of the (correct) extracted
 * node — including neighbours that did NOT improve (must repeat the old value).
 * @param {object} graph
 * @param {object} round
 * @param {Object<number, number>} studentDists  map nodeId → entered distance (Infinity for ∞)
 * @returns {Array<{unit:'relax', to:number, correct:boolean, given:number, expected:number}>}
 */
export function checkRelaxations(graph, round, studentDists) {
  return relaxTargets(graph, round).map(({ to, expected }) => ({
    unit: 'relax',
    to,
    correct: numEq(studentDists?.[to], expected),
    given: studentDists?.[to],
    expected,
  }));
}

/**
 * Score one full submission against the reference trace.
 * @param {object} graph
 * @param {{rounds:Array}} ref  output of dijkstraTrace
 * @param {Array<{extract:number, dists:Object<number,number>}>} answers  one entry per round
 * @returns {{
 *   earned:number, total:number, percent:number,
 *   rounds:Array<{index:number, extract:object, relax:Array}>
 * }}
 */
export function scoreSubmission(graph, ref, answers) {
  let earned = 0, total = 0;
  const rounds = ref.rounds.map((round, i) => {
    const ans = answers[i] || {};
    const extract = checkExtract(round, ans.extract);
    const relax = checkRelaxations(graph, round, ans.dists || {});
    const units = [extract, ...relax];
    total += units.length;
    earned += units.filter((u) => u.correct).length;
    return { index: round.index, extract, relax };
  });
  return {
    earned,
    total,
    percent: total === 0 ? 0 : Math.round((earned / total) * 100),
    rounds,
  };
}
