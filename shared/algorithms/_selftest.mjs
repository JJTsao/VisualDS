import { dijkstraTrace, buildAdj } from './dijkstra.js';
import { generateGraph } from './graph-gen.js';
import { scoreSubmission, checkExtract } from './trace-grader.js';

let failures = 0;
const eq = (a, b, msg) => {
  const pass = JSON.stringify(a) === JSON.stringify(b);
  if (!pass) { failures++; console.error(`FAIL ${msg}\n  got     ${JSON.stringify(a)}\n  want    ${JSON.stringify(b)}`); }
  else console.log(`ok   ${msg}`);
};

// ── Worked example: tie at round 2 must break to smaller id ───────────────────
//   0-1(2) 0-2(2) 1-3(3) 2-3(3), source 0  ⇒ dist [0,2,2,5]; extract order 0,1,2,3
const g = { n: 4, edges: [
  { a: 0, b: 1, w: 2 }, { a: 0, b: 2, w: 2 },
  { a: 1, b: 3, w: 3 }, { a: 2, b: 3, w: 3 },
] };
const t = dijkstraTrace(g, 0);
eq(t.finalDist, [0, 2, 2, 5], 'final distances');
eq(t.rounds.map(r => r.extract), [0, 1, 2, 3], 'extract order (tie→smaller id)');
// round index 2 settles node 2; relaxing 3 gives 2+3=5 which is NOT < 5 ⇒ no relaxation
eq(t.rounds[2].relaxations, [], 'no relaxation when alt == dist (Rule B strict)');

// ── Classic example with a later improvement via node 2 ───────────────────────
//   0-1(4) 0-2(1) 2-1(2) 1-3(5) 2-3(8), source 0 ⇒ dist [0,3,1,8]
const g2 = { n: 4, edges: [
  { a: 0, b: 1, w: 4 }, { a: 0, b: 2, w: 1 },
  { a: 1, b: 2, w: 2 }, { a: 1, b: 3, w: 5 }, { a: 2, b: 3, w: 8 },
] };
const t2 = dijkstraTrace(g2, 0);
eq(t2.finalDist, [0, 3, 1, 8], 'final distances (relax improves dist[1] via node 2)');
eq(t2.rounds.map(r => r.extract), [0, 2, 1, 3], 'extract order');

// ── Generated graph is connected & Dijkstra reaches every node ────────────────
for (let seed = 1; seed <= 50; seed++) {
  const gg = generateGraph({ n: 6, extraEdges: 3, seed });
  const tt = dijkstraTrace(gg, 0);
  const reached = tt.finalDist.filter(d => d !== Infinity).length;
  if (reached !== 6) { failures++; console.error(`FAIL connectivity seed=${seed}: reached ${reached}/6`); }
}
console.log('ok   50 generated graphs all connected');

// ── Grader: perfect answer = 100%, one wrong extract loses exactly 1 unit ─────
const perfect = t2.rounds.map(r => {
  const dists = {};
  for (let i = 0; i < t2.n; i++) dists[i] = r.distAfter[i];
  return { extract: r.extract, dists };
});
const sPerfect = scoreSubmission(g2, t2, perfect);
eq([sPerfect.earned, sPerfect.total, sPerfect.percent], [sPerfect.total, sPerfect.total, 100], 'perfect submission = 100%');

const wrong = perfect.map((a, i) => i === 1 ? { ...a, extract: 99 } : a);
const sWrong = scoreSubmission(g2, t2, wrong);
eq(sWrong.earned, sPerfect.total - 1, 'one wrong extract loses exactly 1 unit (no cascade)');
eq(checkExtract(t2.rounds[1], 99).expected, t2.rounds[1].extract, 'checkExtract reports expected node');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
