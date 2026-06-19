// Verifies env-var defaults take effect on a fresh boot (no config.json) — the
// safety net for when Render's ephemeral disk wipes config on restart.
import { spawn } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, 'data');
const dataFiles = ['config.json', 'results.json', 'exams.json'].map((f) => path.join(DATA, f));

const backup = {};
for (const f of dataFiles) { if (existsSync(f)) { backup[f] = await readFile(f); await rm(f); } }
async function restore() {
  for (const f of dataFiles) {
    if (backup[f] != null) await writeFile(f, backup[f]);
    else if (existsSync(f)) await rm(f);
  }
}

const PORT = 8098, TOKEN = 'envtest', BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('node', [path.join(__dirname, 'server.js')], {
  env: {
    ...process.env, PORT: String(PORT), HOST: '127.0.0.1', TEACHER_TOKEN: TOKEN, SHEETS_WEBHOOK_URL: '',
    EXAM_PHASE: 'practice', PRACTICE_CHAPTERS: 'bst-delete,dijkstra', EXAM_CHAPTERS: 'bst-insert,merge-sort',
    EXAM_TITLE: '期末練習', EXAM_MINUTES: '45',
  },
  stdio: 'ignore',
});
const get = (p) => fetch(BASE + p).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok   ' + m); else { fail++; console.error('FAIL ' + m); } };

try {
  for (let i = 0; i < 60; i++) { try { await get('/api/exam-info?studentId=x'); break; } catch { await sleep(100); } }
  const cfg = await get('/api/config?token=' + TOKEN);
  ok(cfg.phase === 'practice', 'env EXAM_PHASE → practice on fresh boot');
  ok(cfg.practiceChapters.join() === 'bst-delete,dijkstra', 'env PRACTICE_CHAPTERS applied');
  ok(cfg.examChapters.join() === 'bst-insert,merge-sort', 'env EXAM_CHAPTERS applied');
  ok(cfg.examTitle === '期末練習', 'env EXAM_TITLE applied');
  ok(cfg.examMinutes === 45, 'env EXAM_MINUTES applied');

  const ei = await get('/api/exam-info?studentId=');
  ok(ei.phase === 'practice', 'exam-info reflects practice phase');
  ok(ei.practice === true, 'exam-info practice flag true');
  ok(ei.chapters.join() === 'bst-delete,dijkstra', 'exam-info active = practice set');
} finally {
  child.kill();
  await sleep(150);
  await restore();
}
console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
