import { buildBST, bstDeleteTrace, layoutTree, treeDepth } from './bst.js';
import { generateBST } from './bst-gen.js';
import { scoreSteps, groupByPhase } from './trace-engine.js';

let failures = 0;
const eq = (a, b, msg) => {
  const pass = JSON.stringify(a) === JSON.stringify(b);
  if (!pass) { failures++; console.error(`FAIL ${msg}\n  got  ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`); }
  else console.log(`ok   ${msg}`);
};

// Fixed tree:        50
//                  /    \
//                30      70
//               /  \    /  \
//              20  40  60  80
//                       \
//                       65
const tree = buildBST([50, 30, 70, 20, 40, 60, 80, 65]);

// helper: extract (key→answer) and the resolve-phase keys
const ans = (t) => Object.fromEntries(t.steps.map(s => [s.key, s.answer]));

// ── leaf delete (20) ──
const tLeaf = bstDeleteTrace(tree, 20);
eq(tLeaf.klass, 'leaf', 'delete 20 → leaf case');
eq(tLeaf.steps.map(s => s.answer), ['left', 'left', 'found', 'leaf'], 'leaf: search dirs + classify');

// ── one-child delete (60 → child 65) ──
const tOne = bstDeleteTrace(tree, 60);
eq(tOne.klass, 'one', 'delete 60 → one-child case');
eq(ans(tOne).replace, 65, 'one: replacement node is 65');
eq(tOne.steps.map(s => s.answer), ['right', 'left', 'found', 'one', 65], 'one: full answer sequence');

// ── two-children delete (30 → successor 40) ──
const tTwo = bstDeleteTrace(tree, 30);
eq(tTwo.klass, 'two', 'delete 30 → two-children case');
eq(ans(tTwo).successor, 40, 'two: inorder successor of 30 is 40');
eq(ans(tTwo).newvalue, 40, 'two: new value placed is 40');
eq(ans(tTwo)['succ-case'], 'leaf', 'two: successor 40 removal is leaf');

// ── two-children delete at ROOT (50 → successor 60, which has a right child) ──
const tRoot = bstDeleteTrace(tree, 50);
eq(ans(tRoot).successor, 60, 'root two: successor of 50 is 60');
eq(ans(tRoot).newvalue, 60, 'root two: new value is 60');
eq(ans(tRoot)['succ-case'], 'one', 'root two: successor 60 removal is one-child');

// ── layout sanity: every node positioned, x within (0,1), in-order x increases ──
const pos = layoutTree(tree);
eq(pos.size, 8, 'layout positions all 8 nodes');
const inorderVals = [20, 30, 40, 50, 60, 65, 70, 80];
const xs = inorderVals.map(v => pos.get(v).x);
eq(xs.every((x, i) => i === 0 || x > xs[i - 1]), true, 'in-order nodes have strictly increasing x');
eq(treeDepth(tree), 3, 'tree depth is 3');

// ── generic grader: perfect = 100%, one wrong = -1, phases group ──
const perfect = ans(tTwo);
const sPerfect = scoreSteps(tTwo.steps, perfect);
eq([sPerfect.earned, sPerfect.percent], [sPerfect.total, 100], 'perfect submission = 100%');
const wrong = { ...perfect, classify: 'leaf' };
eq(scoreSteps(tTwo.steps, wrong).earned, sPerfect.total - 1, 'one wrong step loses exactly 1');
eq(groupByPhase(tTwo.steps).map(g => g.phase), ['search', 'classify', 'resolve'], 'phases group in order');

// ── generator: prefers a two-children target, trace runs, target exists ──
let twoCount = 0;
for (let seed = 1; seed <= 40; seed++) {
  const inst = generateBST({ n: 9, seed, prefer: 'two' });
  if (!inst.values.includes(inst.target)) { failures++; console.error(`FAIL gen seed=${seed}: target not in values`); }
  const g = buildBST(inst.values);
  const node = g.nodes.get(inst.target);
  const c = (node.left !== null ? 1 : 0) + (node.right !== null ? 1 : 0);
  if (c === 2) twoCount++;
  bstDeleteTrace(g, inst.target); // must not throw
}
console.log(`ok   40 generated BSTs: ${twoCount}/40 hit two-children target`);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
