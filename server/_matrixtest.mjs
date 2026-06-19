// End-to-end test for the score-matrix aggregation in /api/results.
// Launches a fresh server on a test port with an ISOLATED data dir (backs up and
// restores any real data/ files), drives a few completions, and checks the matrix.
import { spawn } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as bst from './chapters/bst-delete.js';
import * as dij from './chapters/dijkstra.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, 'data');
const dataFiles = ['config.json', 'results.json', 'exams.json'].map((f) => path.join(DATA, f));

// ── back up + clear real data so the test boots clean ──
const backup = {};
for (const f of dataFiles) { if (existsSync(f)) { backup[f] = await readFile(f); await rm(f); } }
async function restore() {
  for (const f of dataFiles) {
    if (backup[f] != null) await writeFile(f, backup[f]);
    else if (existsSync(f)) await rm(f);
  }
}

const PORT = 8097, TOKEN = 'mtest', BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('node', [path.join(__dirname, 'server.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', TEACHER_TOKEN: TOKEN, SHEETS_WEBHOOK_URL: '' },
  stdio: 'ignore',
});

const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const get = (p) => fetch(BASE + p).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok   ' + m); else { fail++; console.error('FAIL ' + m); } };

async function complete(studentId, chapter, seed, mode, steps) {
  const st = await post('/api/start', { chapter, studentId, seed });
  if (st.error) { console.error('start failed', studentId, chapter, st); return st; }
  for (let i = 0; i < steps.length; i++) {
    if (mode === 'correct') {
      await post('/api/step', { sessionId: st.sessionId, stepIndex: i, answer: steps[i].answer });
    } else {
      for (let t = 0; t < 3; t++) await post('/api/step', { sessionId: st.sessionId, stepIndex: i, answer: '__WRONG__' });
    }
  }
  return st;
}

try {
  // wait for boot
  for (let i = 0; i < 60; i++) { try { await get('/api/exam-info?studentId=x'); break; } catch { await sleep(100); } }

  // phase off (all chapters open, results recorded, no timer); exam set = two chapters; custom weights
  const seedB = 12345, seedD = 6789;
  const cfg = await post('/api/config', {
    token: TOKEN, phase: 'off', minutes: 0,
    examChapters: ['bst-delete', 'dijkstra'],
    chapterPoints: { 'bst-delete': 80, 'dijkstra': 80 },
  });
  ok(cfg.chapterPoints['bst-delete'] === 80, 'config stores custom weight 80');
  ok(cfg.examChapters.join() === 'bst-delete,dijkstra', 'config stores exam set');

  // exam-info exposes points/cap/title for the student menu
  const ei = await get('/api/exam-info?studentId=');
  ok(ei.chapterPoints?.['dijkstra'] === 80, 'exam-info exposes chapterPoints');
  ok(ei.scoreCap === 100, 'exam-info exposes scoreCap');
  const ct = await post('/api/config', { token: TOKEN, examTitle: '資料結構期末考' });
  ok(ct.examTitle === '資料結構期末考', 'config stores examTitle');
  const ei2 = await get('/api/exam-info?studentId=');
  ok(ei2.examTitle === '資料結構期末考', 'exam-info exposes examTitle');

  const bstLocal = bst.generate(seedB), dijLocal = dij.generate(seedD);

  await complete('MX_A', 'bst-delete', seedB, 'correct', bstLocal.steps);
  await complete('MX_A', 'dijkstra', seedD, 'correct', dijLocal.steps);
  await complete('MX_B', 'bst-delete', seedB, 'correct', bstLocal.steps);
  await complete('MX_C', 'bst-delete', seedB, 'wrong', bstLocal.steps);

  let res = await get('/api/results?token=' + TOKEN);
  const by = () => Object.fromEntries(res.students.map((s) => [s.studentId, s]));
  let m = by();

  ok(res.examChapters.join() === 'bst-delete,dijkstra', 'results echoes exam set');
  ok(res.chapterPoints['dijkstra'] === 80, 'results echoes weights');
  ok(res.scoreCap === 100, 'results echoes score cap 100');

  ok(m.MX_A?.chapters['bst-delete']?.points === 80, 'A bst-delete full 80 pts');
  ok(m.MX_A?.chapters['dijkstra']?.points === 80, 'A dijkstra full 80 pts');
  ok(m.MX_A?.rawTotal === 160, 'A raw total 160');
  ok(m.MX_A?.total === 100, 'A total capped at 100');

  ok(m.MX_B?.total === 80, 'B total 80 (one chapter)');
  ok(!m.MX_B?.chapters['dijkstra'], 'B has no dijkstra cell');

  ok(m.MX_C?.chapters['bst-delete']?.points === 0, 'C all-wrong → 0 pts');
  ok(m.MX_C?.total === 0, 'C total 0');

  // re-scope exam set to dijkstra only → B drops out, A keeps only dijkstra
  await post('/api/config', { token: TOKEN, examChapters: ['dijkstra'] });
  res = await get('/api/results?token=' + TOKEN);
  m = by();
  ok(res.examChapters.join() === 'dijkstra', 'exam set re-scoped to dijkstra');
  ok(m.MX_A?.total === 80, 'A total now 80 (dijkstra only)');
  ok(!m.MX_B, 'B drops out of matrix (no dijkstra record)');

  // ── reset: wipes grades, keeps config ──
  const badReset = await post('/api/reset', { token: 'WRONG' });
  ok(badReset.error === 'forbidden', 'reset rejects bad token');
  const okReset = await post('/api/reset', { token: TOKEN });
  ok(okReset.cleared === true, 'reset clears with valid token');
  res = await get('/api/results?token=' + TOKEN);
  ok((res.finished || []).length === 0, 'reset → finished empty');
  ok((res.students || []).length === 0, 'reset → matrix empty');
  ok(res.chapterPoints?.['dijkstra'] === 80, 'reset KEEPS weights');
  ok(res.examChapters?.join() === 'dijkstra', 'reset KEEPS exam set');
} finally {
  child.kill();
  await sleep(150);
  await restore();
}

console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
