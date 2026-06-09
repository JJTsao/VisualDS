// End-to-end API test: drives the running server over HTTP with a fixed seed,
// using the chapter module locally only to know the correct answers.
import * as bst from './chapters/bst-delete.js';

const BASE = process.env.BASE || 'http://localhost:8090';
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
const get  = (p) => fetch(BASE + p).then(r => r.json());

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok   ' + m); else { fail++; console.error('FAIL ' + m); } };

const seed = 12345;
const local = bst.generate(seed);     // answers, to drive the test

// ── start ──
const start = await post('/api/start', { chapter: 'bst-delete', studentId: 'TEST001', seed });
ok(!!start.sessionId, 'start returns sessionId');
ok(start.total === local.steps.length, 'total matches step count');
ok(start.steps.every(s => !('answer' in s)), 'step shells contain NO answers');
ok(JSON.stringify(start.instance) === JSON.stringify(local.instance), 'instance matches deterministic local gen');

// ── 1) all correct → 100% ──
let idx = 0;
for (const step of local.steps) {
  const r = await post('/api/step', { sessionId: start.sessionId, stepIndex: idx, answer: step.answer });
  ok(r.correct && r.settled, `step ${idx} (${step.kind}) correct & settled`);
  ok(r.expected === step.answer, `step ${idx} reveals expected only after commit`);
  idx++;
}
const res1 = await get('/api/results?token=teacher');
ok(res1.finished.some(x => x.studentId === 'TEST001' && x.percent === 100), 'TEST001 persisted at 100%');

// ── 2) wrong-then-retry: lock-step, diminishing credit ──
const s2 = await post('/api/start', { chapter: 'bst-delete', studentId: 'TEST002', seed });
const step0 = local.steps[0];
const wrong = step0.answer === 'left' ? 'right' : 'left';
let r0 = await post('/api/step', { sessionId: s2.sessionId, stepIndex: 0, answer: wrong });
ok(r0.correct === false && r0.settled === false, 'wrong attempt 1: not settled');
ok(r0.expected === undefined, 'no reveal while retries remain');
ok(r0.attemptsLeft === 2, 'attemptsLeft decremented to 2');
r0 = await post('/api/step', { sessionId: s2.sessionId, stepIndex: 0, answer: step0.answer });
ok(r0.correct && r0.settled, 'retry correct → settled');
ok(r0.creditAwarded === 0.5, 'second-attempt credit = 0.5');

// ── 3) out-of-order rejected ──
const oo = await post('/api/step', { sessionId: s2.sessionId, stepIndex: 99, answer: 'x' });
ok(oo.error === 'out of order', 'out-of-order step rejected');

// ── 4) results needs teacher token ──
const noTok = await get('/api/results');
ok(noTok.error === 'forbidden', 'results requires teacher token');

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAIL`);
process.exit(fail ? 1 : 0);
