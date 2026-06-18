// ════════════════════════════════════════════════════════════════════════════
//  VisualDS Exam Server — ZERO external dependencies (Node built-ins only).
//  Run:  node server/server.js     (only `node` needed; no npm install)
//
//  Responsibilities (the integrity-critical half of the exam):
//   • serve the static exam frontend + shared modules
//   • /api/start  — create a session, pick a per-student instance, keep the
//                   answer key SERVER-SIDE; send only presentational data + step
//                   shells (prompts/options, NO answers)
//   • /api/step   — grade ONE step authoritatively; reveal that step's answer
//                   only AFTER the student has committed (lock-step); track score
//   • /api/results— teacher view (behind a token); also persisted to data/results.json
//
//  The score lives here and cannot be forged by the client. Answers are never
//  sent as a whole key. See server/README.md.
// ════════════════════════════════════════════════════════════════════════════

import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gradeStep } from '../shared/algorithms/trace-engine.js';
import * as bstDelete   from './chapters/bst-delete.js';
import * as bstInsert   from './chapters/bst-insert.js';
import * as bstTraversal from './chapters/bst-traversal.js';
import * as dijkstra    from './chapters/dijkstra.js';
import * as dfs         from './chapters/dfs.js';
import * as bubbleSort  from './chapters/bubble-sort.js';
import * as selectionSort from './chapters/selection-sort.js';
import * as mergeSort   from './chapters/merge-sort.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');            // project root → static base
const DATA = path.join(__dirname, 'data');
const RESULTS = path.join(DATA, 'results.json');

const PORT = Number(process.env.PORT) || 8090;
const HOST = process.env.HOST || '0.0.0.0';            // 0.0.0.0 ⇒ reachable over LAN
const TEACHER_TOKEN = process.env.TEACHER_TOKEN || 'teacher';
const ATTEMPT_CREDIT = [1, 0.5, 0.25];                 // diminishing credit per attempt

// Optional Google Sheets sink (a published Apps Script web app URL). When set,
// each finished result is POSTed there so grades survive ephemeral cloud disks.
// Local data/results.json is always kept too, as a backup.
const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || '';
const SHEETS_TOKEN = process.env.SHEETS_TOKEN || '';

const CHAPTERS = {
  'bst-delete':    bstDelete,
  'bst-insert':    bstInsert,
  'bst-traversal': bstTraversal,
  'dijkstra':      dijkstra,
  'dfs':           dfs,
  'bubble-sort':   bubbleSort,
  'selection-sort': selectionSort,
  'merge-sort':    mergeSort,
};

const sessions = new Map();   // sessionId → session object (in-memory)
let sidSeq = 1;

// (studentId → Set<chapter>) of FINISHED attempts — enforces one attempt per
// student per chapter. Rebuilt from results.json on boot (single instance).
const doneByStudent = new Map();
function markDone(studentId, chapter) {
  if (!doneByStudent.has(studentId)) doneByStudent.set(studentId, new Set());
  doneByStudent.get(studentId).add(chapter);
}
async function loadCompleted() {
  if (!existsSync(RESULTS)) return;
  try {
    const arr = JSON.parse(await readFile(RESULTS, 'utf8'));
    for (const r of arr) if (r.studentId && r.chapter) markDone(r.studentId, r.chapter);
  } catch { /* ignore */ }
}

// ── Timed-exam state ─────────────────────────────────────────────────────────
// examMinutes: 0 = no limit (default). Teacher sets it at runtime via /api/config.
// examStartAt: per-student exam start time; the deadline = start + minutes. Both
// persisted so a server restart doesn't reset the clock mid-exam.
const CONFIG_FILE = path.join(DATA, 'config.json');
const EXAMS_FILE  = path.join(DATA, 'exams.json');
const ALL_CHAPTERS = Object.keys(CHAPTERS);

let examMinutes = Number(process.env.EXAM_MINUTES) || 0;
let phase = 'off';                              // 'off' (all open) | 'practice' | 'exam'
let practiceChapters = [...ALL_CHAPTERS];
let examChapters = [...ALL_CHAPTERS];
const examStartAt = new Map();                  // studentId → epoch ms

function activeChapters() { return phase === 'practice' ? practiceChapters : phase === 'exam' ? examChapters : ALL_CHAPTERS; }
function isPractice() { return phase === 'practice'; }       // ungraded, unlimited, untimed
function timerActive() { return phase === 'exam' && examMinutes > 0; }
function examEndsAt(sid) { const s = examStartAt.get(sid); return s ? s + examMinutes * 60000 : null; }
function examExpired(sid) { const e = examEndsAt(sid); return e != null && Date.now() > e; }

async function loadTimer() {
  if (existsSync(CONFIG_FILE)) { try {
    const c = JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
    if (Number.isFinite(c.examMinutes)) examMinutes = c.examMinutes;
    if (['off', 'practice', 'exam'].includes(c.phase)) phase = c.phase;
    if (Array.isArray(c.practiceChapters)) practiceChapters = c.practiceChapters.filter((x) => ALL_CHAPTERS.includes(x));
    if (Array.isArray(c.examChapters)) examChapters = c.examChapters.filter((x) => ALL_CHAPTERS.includes(x));
  } catch { /* ignore */ } }
  if (existsSync(EXAMS_FILE)) { try { const e = JSON.parse(await readFile(EXAMS_FILE, 'utf8')); for (const [k, v] of Object.entries(e)) examStartAt.set(k, v); } catch { /* ignore */ } }
}
async function saveConfig() { if (!existsSync(DATA)) await mkdir(DATA, { recursive: true }); await writeFile(CONFIG_FILE, JSON.stringify({ examMinutes, phase, practiceChapters, examChapters })); }
async function saveExams()  { if (!existsSync(DATA)) await mkdir(DATA, { recursive: true }); await writeFile(EXAMS_FILE, JSON.stringify(Object.fromEntries(examStartAt))); }

function examInfo(sid) {
  const startedAt = sid && examStartAt.has(sid) ? examStartAt.get(sid) : null;
  const minutes = timerActive() ? examMinutes : 0;
  return {
    phase, chapters: activeChapters(), practice: isPractice(), minutes,
    startedAt, endsAt: (startedAt && minutes > 0) ? startedAt + examMinutes * 60000 : null,
    now: Date.now(),
    completed: sid ? [...(doneByStudent.get(sid) || [])] : [],
  };
}

// A non-crypto seed source that avoids Math.random determinism concerns for a
// classroom: mix time + a counter. (Reproducible runs can pass an explicit seed.)
let seedSeq = 1;
function pickSeed() { return ((Date.now() & 0x7fffffff) ^ (seedSeq++ * 2654435761)) >>> 0; }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.map': 'application/json; charset=utf-8',
};

// ── helpers ──────────────────────────────────────────────────────────────────
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function stepShells(steps) {
  // everything the client needs to render the step — but NOT the answer
  return steps.map((s) => ({
    key: s.key, phase: s.phase, kind: s.kind, prompt: s.prompt,
    options: s.options, focusNode: s.focusNode, meta: s.meta,
  }));
}
async function persistResult(rec) {
  if (!existsSync(DATA)) await mkdir(DATA, { recursive: true });
  let arr = [];
  if (existsSync(RESULTS)) { try { arr = JSON.parse(await readFile(RESULTS, 'utf8')); } catch { arr = []; } }
  arr.push(rec);
  await writeFile(RESULTS, JSON.stringify(arr, null, 2));
}

// POST a finished result to the Google Sheets Apps Script web app (if configured).
// Best-effort: a failure here never breaks the student's finish (JSON is backup).
async function postToSheet(rec) {
  if (!SHEETS_WEBHOOK_URL) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rec, token: SHEETS_TOKEN }),
      signal: ctrl.signal, redirect: 'follow',
    });
  } catch (e) { console.error('[sheets] post failed:', e.message); }
  finally { clearTimeout(timer); }
}

// ── API handlers ─────────────────────────────────────────────────────────────
async function apiStart(req, res) {
  const body = await readBody(req);
  const chapter = String(body.chapter || '');
  const studentId = String(body.studentId || '').trim();
  const mod = CHAPTERS[chapter];
  if (!mod) return sendJSON(res, 400, { error: 'unknown chapter' });
  if (!studentId) return sendJSON(res, 400, { error: 'studentId required' });
  if (!activeChapters().includes(chapter)) return sendJSON(res, 409, { error: 'chapter-locked', message: '此章節目前未開放。' });
  if (timerActive()) {
    if (!examStartAt.has(studentId)) return sendJSON(res, 409, { error: 'exam-not-started', message: '請先在選單按「開始考試」。' });
    if (examExpired(studentId)) return sendJSON(res, 409, { error: 'exam-over', message: '考試時間已結束。' });
  }
  if (!isPractice() && doneByStudent.get(studentId)?.has(chapter)) {
    return sendJSON(res, 409, { error: 'already-done', message: '你已完成此章節,不可重做。' });
  }

  const seed = (body.seed != null) ? (Number(body.seed) >>> 0) : pickSeed();
  const gen = mod.generate(seed);
  const id = 's' + (sidSeq++);
  sessions.set(id, {
    id, studentId, chapter, seed,
    steps: gen.steps, instance: gen.instance, meta: gen.klass,
    cursor: 0, attempts: 0, earned: 0, total: gen.steps.length,
    startedAt: Date.now(), done: false, practice: isPractice(),
  });
  sendJSON(res, 200, {
    sessionId: id, chapter, seed, total: gen.steps.length, practice: isPractice(),
    instance: gen.instance, steps: stepShells(gen.steps),
  });
}

async function apiStep(req, res) {
  const body = await readBody(req);
  const sess = sessions.get(String(body.sessionId || ''));
  if (!sess) return sendJSON(res, 404, { error: 'no such session' });
  if (sess.done) return sendJSON(res, 409, { error: 'session finished' });
  if (timerActive() && examExpired(sess.studentId)) return sendJSON(res, 409, { error: 'exam-over', message: '考試時間已結束。' });
  if (Number(body.stepIndex) !== sess.cursor) {
    return sendJSON(res, 409, { error: 'out of order', expectedStepIndex: sess.cursor });
  }

  const step = sess.steps[sess.cursor];
  const result = gradeStep(step, body.answer);
  let settled = false, creditAwarded = 0;

  if (result.correct) {
    creditAwarded = ATTEMPT_CREDIT[Math.min(sess.attempts, ATTEMPT_CREDIT.length - 1)];
    sess.earned += creditAwarded;
    settled = true;
  } else {
    sess.attempts++;
    if (sess.attempts >= ATTEMPT_CREDIT.length) settled = true;   // exhausted → reveal, 0 credit
  }

  const payload = {
    correct: result.correct,
    settled,
    creditAwarded,
    attemptsLeft: settled ? 0 : (ATTEMPT_CREDIT.length - sess.attempts),
  };

  if (settled) {
    payload.expected = step.answer;            // revealed only after commit
    sess.cursor++;
    sess.attempts = 0;
    if (sess.cursor >= sess.total) {
      sess.done = true;
      const durationSec = Math.round((Date.now() - sess.startedAt) / 1000);
      const percent = sess.total ? Math.round((sess.earned / sess.total) * 100) : 0;
      const rec = {
        studentId: sess.studentId, chapter: sess.chapter, seed: sess.seed,
        earned: Number(sess.earned.toFixed(2)), total: sess.total, percent,
        durationSec, finishedAt: new Date(sess.startedAt + durationSec * 1000).toISOString(),
      };
      if (!sess.practice) {                       // practice attempts are NOT recorded
        markDone(sess.studentId, sess.chapter);   // one attempt per student per chapter
        await persistResult(rec);                 // local backup
        await postToSheet(rec);                   // durable store (if configured)
      }
    }
    payload.nextStepIndex = sess.done ? null : sess.cursor;
    payload.done = sess.done;
  }

  payload.earned = Number(sess.earned.toFixed(2));
  payload.total = sess.total;
  payload.percent = sess.total ? Math.round((sess.earned / sess.total) * 100) : 0;
  sendJSON(res, 200, payload);
}

// Exam-timer: read current minutes + this student's start/deadline (drives countdown).
function apiExamInfo(res, url) {
  sendJSON(res, 200, examInfo((url.searchParams.get('studentId') || '').trim()));
}
// Student presses "開始考試" — records their start time once (idempotent).
async function apiExamStart(req, res) {
  const body = await readBody(req);
  const sid = String(body.studentId || '').trim();
  if (!sid) return sendJSON(res, 400, { error: 'studentId required' });
  if (examMinutes > 0 && !examStartAt.has(sid)) { examStartAt.set(sid, Date.now()); await saveExams(); }
  sendJSON(res, 200, examInfo(sid));
}
// Teacher sets the exam duration at runtime (token-protected, persisted).
async function apiConfig(req, res, url) {
  const snapshot = () => ({ examMinutes, phase, practiceChapters, examChapters, allChapters: ALL_CHAPTERS });
  if (req.method === 'GET') {
    if (url.searchParams.get('token') !== TEACHER_TOKEN) return sendJSON(res, 403, { error: 'forbidden' });
    return sendJSON(res, 200, snapshot());
  }
  const body = await readBody(req);
  if (body.token !== TEACHER_TOKEN) return sendJSON(res, 403, { error: 'forbidden' });
  if (body.minutes != null) {
    const m = Number(body.minutes);
    if (!Number.isFinite(m) || m < 0) return sendJSON(res, 400, { error: 'bad minutes' });
    examMinutes = Math.round(m);
  }
  if (body.phase != null) {
    if (!['off', 'practice', 'exam'].includes(body.phase)) return sendJSON(res, 400, { error: 'bad phase' });
    phase = body.phase;
  }
  if (Array.isArray(body.practiceChapters)) practiceChapters = body.practiceChapters.filter((x) => ALL_CHAPTERS.includes(x));
  if (Array.isArray(body.examChapters)) examChapters = body.examChapters.filter((x) => ALL_CHAPTERS.includes(x));
  await saveConfig();
  sendJSON(res, 200, snapshot());
}

// Which chapters has this student already finished? (drives the menu's ✓ marks)
function apiMyStatus(res, url) {
  const sid = (url.searchParams.get('studentId') || '').trim();
  const completed = sid ? [...(doneByStudent.get(sid) || [])] : [];
  sendJSON(res, 200, { studentId: sid, completed });
}

async function apiResults(req, res, url) {
  if (url.searchParams.get('token') !== TEACHER_TOKEN) return sendJSON(res, 403, { error: 'forbidden' });
  let arr = [];
  if (existsSync(RESULTS)) { try { arr = JSON.parse(await readFile(RESULTS, 'utf8')); } catch { arr = []; } }
  const live = [...sessions.values()].filter((s) => !s.done).map((s) => ({
    studentId: s.studentId, chapter: s.chapter, percent: s.total ? Math.round((s.earned / s.total) * 100) : 0,
    progress: `${s.cursor}/${s.total}`, inProgress: true,
  }));
  sendJSON(res, 200, { finished: arr, inProgress: live });
}

// ── static files ─────────────────────────────────────────────────────────────
async function serveStatic(req, res, url) {
  // Root → redirect to /exam/ (NOT serve the menu at '/', or the menu's relative
  // links like play.html would resolve to /play.html instead of /exam/play.html).
  if (url.pathname === '/') { res.writeHead(302, { Location: '/exam/' }); return res.end(); }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';        // e.g. /exam/ → /exam/index.html
  const filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }   // no traversal
  if (!existsSync(filePath)) { res.writeHead(404); return res.end('not found'); }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(500); res.end('error'); }
}

// ── router ───────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/start' && req.method === 'POST') return await apiStart(req, res);
    if (url.pathname === '/api/step' && req.method === 'POST') return await apiStep(req, res);
    if (url.pathname === '/api/my-status' && req.method === 'GET') return apiMyStatus(res, url);
    if (url.pathname === '/api/exam-info' && req.method === 'GET') return apiExamInfo(res, url);
    if (url.pathname === '/api/exam-start' && req.method === 'POST') return await apiExamStart(req, res);
    if (url.pathname === '/api/config') return await apiConfig(req, res, url);
    if (url.pathname === '/api/results' && req.method === 'GET') return await apiResults(req, res, url);
    if (url.pathname.startsWith('/api/')) return sendJSON(res, 404, { error: 'no such endpoint' });
    return await serveStatic(req, res, url);
  } catch (err) {
    sendJSON(res, 500, { error: String(err && err.message || err) });
  }
});

await loadCompleted();   // rebuild "already finished" index from results.json
await loadTimer();       // restore exam duration + per-student start times

server.listen(PORT, HOST, () => {
  console.log(`\n  VisualDS Exam Server`);
  console.log(`  ────────────────────`);
  console.log(`  學生請開:  http://<本機區網IP>:${PORT}/exam/   （章節選單）`);
  console.log(`  本機測試:  http://localhost:${PORT}/exam/`);
  console.log(`  老師成績:  http://localhost:${PORT}/api/results?token=${TEACHER_TOKEN}\n`);
});
