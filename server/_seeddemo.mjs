// DEMO ONLY — 注入假成績到 data/(gitignore,僅本機預覽矩陣版面用)。
// 跑法:node server/_seeddemo.mjs  → 再 node server/server.js → 開 results.html。
// 清掉:node server/_seeddemo.mjs --clear   (或直接刪 data/results.json、data/config.json)
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, 'data');
const RESULTS = path.join(DATA, 'results.json');
const CONFIG = path.join(DATA, 'config.json');

if (process.argv.includes('--clear')) {
  for (const f of [RESULTS, CONFIG]) if (existsSync(f)) await rm(f);
  console.log('已清除 demo 資料(results.json / config.json)。');
  process.exit(0);
}

const ALL = ['bst-insert', 'bst-delete', 'bst-traversal', 'dfs', 'selection-sort', 'bubble-sort', 'dijkstra', 'merge-sort'];
const POINTS = { 'bst-insert': 10, 'bst-delete': 15, 'bst-traversal': 10, 'dfs': 15, 'selection-sort': 15, 'bubble-sort': 15, 'dijkstra': 25, 'merge-sort': 20 };

// 每筆:某生某章的完成度 ratio(earned/total)。挑幾個不同覆蓋/分數的學生。
const PLAN = {
  B11201001: { 'bst-insert': 1, 'bst-delete': 1, 'bst-traversal': 1, 'dfs': 1, 'selection-sort': .9, 'bubble-sort': 1, 'dijkstra': .9 }, // 強,放棄 merge,封頂
  B11201002: { 'bst-insert': .8, 'bst-delete': 1, 'bst-traversal': 1, 'dfs': .8, 'bubble-sort': 1, 'dijkstra': 1, 'merge-sort': 1 },      // 強,放棄 selection
  B11201003: { 'bst-insert': 1, 'bst-delete': .75, 'bst-traversal': .7, 'dfs': 1, 'selection-sort': 1, 'bubble-sort': .6 },              // 中,沒碰圖/merge
  B11201004: { 'bst-traversal': 1, 'dfs': .5, 'dijkstra': .4 },                                                                          // 弱,只做幾章
  B11201005: { 'bst-insert': 1, 'bst-delete': 1, 'bst-traversal': 1 },                                                                   // 只做 BST
};

const rows = [];
let t = Date.now();
for (const [sid, chs] of Object.entries(PLAN)) {
  for (const [ch, ratio] of Object.entries(chs)) {
    const total = 10;
    const earned = Math.round(ratio * total * 100) / 100;
    t -= 73000;
    rows.push({
      studentId: sid, chapter: ch, seed: 1234,
      earned, total, percent: Math.round(ratio * 100),
      durationSec: 120 + Math.round(ratio * 240),
      finishedAt: new Date(t).toISOString(),
    });
  }
}

await mkdir(DATA, { recursive: true });
await writeFile(RESULTS, JSON.stringify(rows, null, 2));
await writeFile(CONFIG, JSON.stringify({
  examMinutes: 0, phase: 'exam', practiceChapters: ALL, examChapters: ALL, chapterPoints: POINTS,
}));
console.log(`已注入 ${rows.length} 筆 demo 成績(${Object.keys(PLAN).length} 名學生),正式題組 = 全 8 章。`);
console.log('啟動:node server/server.js → 開 http://localhost:8090/exam/results.html(token: teacher)');
console.log('清除:node server/_seeddemo.mjs --clear');
