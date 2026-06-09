// ════════════════════════════════════════════════════════════════════════════
//  Dijkstra — pure reference stepper (NO DOM).
//  Runs in both the browser (ES module) and Node (server-side grading).
//
//  Produces a deterministic, round-by-round TRACE that the exam UI renders as a
//  step form and the grader compares student answers against. Determinism comes
//  from two PINNED rules (mirror these in the question wording shown to students):
//    Rule A — extract-min ties break toward the SMALLEST node id.
//    Rule B — relax a neighbour only when the new distance is STRICTLY smaller.
//  Neighbour iteration is forced into ascending `to`-id order so the expected
//  relaxation sequence is unique.
// ════════════════════════════════════════════════════════════════════════════

export const INF = Infinity;

/**
 * Build an adjacency map from an undirected edge list, with each neighbour list
 * sorted ascending by `to` id (the pinned iteration order).
 * @param {number} n  node count; ids are 0..n-1
 * @param {Array<{a:number,b:number,w:number}>} edges
 * @returns {Map<number, Array<{to:number, w:number}>>}
 */
export function buildAdj(n, edges) {
  const adj = new Map();
  for (let i = 0; i < n; i++) adj.set(i, []);
  for (const { a, b, w } of edges) {
    adj.get(a).push({ to: b, w });
    adj.get(b).push({ to: a, w });
  }
  for (const list of adj.values()) list.sort((x, y) => x.to - y.to);
  return adj;
}

/**
 * Run Dijkstra and capture the full trace.
 * @param {{n:number, edges?:Array, adj?:Map}} graph
 * @param {number} source
 * @returns {{
 *   source:number, n:number, finalDist:number[],
 *   rounds: Array<{
 *     index:number,
 *     distBefore:number[],        // tentative distances entering this round
 *     unvisitedBefore:number[],   // ids still unvisited entering this round
 *     extract:number,             // correct node to settle (Rule A applied)
 *     extractDist:number,
 *     relaxations:Array<{to:number, edgeWeight:number, oldDist:number, newDist:number}>,
 *     distAfter:number[],         // tentative distances after this round's relaxations
 *   }>
 * }}
 */
export function dijkstraTrace(graph, source = 0) {
  const n = graph.n;
  const adj = graph.adj instanceof Map ? graph.adj : buildAdj(n, graph.edges);

  const dist = new Array(n).fill(INF);
  const visited = new Array(n).fill(false);
  dist[source] = 0;

  const rounds = [];
  while (true) {
    // Extract-min over unvisited; strict `<` + ascending scan ⇒ ties → smallest id (Rule A).
    let u = -1, best = INF;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < best) { best = dist[i]; u = i; }
    }
    if (u === -1) break; // no reachable unvisited vertex remains

    const distBefore = dist.slice();
    const unvisitedBefore = [];
    for (let i = 0; i < n; i++) if (!visited[i]) unvisitedBefore.push(i);

    visited[u] = true;
    const relaxations = [];
    for (const { to: v, w } of adj.get(u)) {
      if (visited[v]) continue;
      const alt = dist[u] + w;
      if (alt < dist[v]) {                 // Rule B — strict improvement only
        const oldDist = dist[v];
        dist[v] = alt;
        relaxations.push({ to: v, edgeWeight: w, oldDist, newDist: alt });
      }
    }

    rounds.push({
      index: rounds.length,
      distBefore,
      unvisitedBefore,
      extract: u,
      extractDist: best,
      relaxations,            // already ascending by `to` (adj is sorted)
      distAfter: dist.slice(),
    });
  }

  return { source, n, rounds, finalDist: dist.slice() };
}

/**
 * Decompose the Dijkstra trace into generic ATOMIC STEPS (for trace-engine.js /
 * the exam server), so Dijkstra is graded by the same engine as every chapter.
 * Each round → one 'pick-node' extract step + one 'number' step per relax target.
 * @returns {{source:number, steps:Array, trace:object}}
 */
export function dijkstraSteps(graph, source = 0) {
  const trace = dijkstraTrace(graph, source);
  const steps = [];
  trace.rounds.forEach((round, i) => {
    steps.push({
      key: `r${i}-extract`, phase: `round-${i}`, kind: 'pick-node',
      prompt: `第 ${i + 1} 輪:在未拜訪節點 {${round.unvisitedBefore.join(', ')}} 中,點選暫定距離最小者（平手取 id 較小）。`,
      answer: round.extract, focusNode: null,
      meta: { type: 'extract', round: i },
    });
    for (const { to } of relaxTargets(graph, round)) {
      steps.push({
        key: `r${i}-relax-${to}`, phase: `round-${i}`, kind: 'number',
        prompt: `鬆弛節點 ${round.extract} 的鄰居 ${to}:它的新暫定距離 =（無改善就填原值）`,
        answer: round.distAfter[to], focusNode: round.extract,
        meta: { type: 'relax', node: to, from: round.extract },
      });
    }
  });
  return { source, steps, trace };
}

/**
 * Unvisited neighbours of a round's extracted node, ascending by id — these are
 * the cells the student must fill (the new tentative distance, whether it changed
 * or not). Shared by the UI (to render inputs) and the grader (to score them).
 * @returns {Array<{to:number, expected:number}>}
 */
export function relaxTargets(graph, round) {
  const n = graph.n;
  const adj = graph.adj instanceof Map ? graph.adj : buildAdj(n, graph.edges);
  const unvisited = new Set(round.unvisitedBefore);
  const out = [];
  for (const { to: v } of adj.get(round.extract)) {
    if (v !== round.extract && unvisited.has(v)) {
      out.push({ to: v, expected: round.distAfter[v] });
    }
  }
  return out; // ascending by `to` (adj sorted)
}
