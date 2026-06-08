// ════════════════════════════════════════════════════════════════════════════
//  Random connected weighted graph generator (NO DOM).
//  Seedable so the server can reproduce a student's exact instance for grading,
//  and so each student gets a distinct-but-deterministic graph from their seed.
// ════════════════════════════════════════════════════════════════════════════

/** mulberry32 — tiny deterministic PRNG. Same seed → same sequence everywhere. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fisherYates(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate a connected, undirected, weighted graph with circular layout positions.
 * Connectivity is guaranteed by first laying down a random spanning tree, then
 * sprinkling extra edges (so Dijkstra has alternative paths worth relaxing).
 *
 * @param {object} opts
 * @param {number} opts.n           node count (ids 0..n-1)
 * @param {number} opts.extraEdges  edges added beyond the spanning tree
 * @param {number} opts.minW        min edge weight (inclusive)
 * @param {number} opts.maxW        max edge weight (inclusive)
 * @param {number} opts.seed        PRNG seed (reproducible)
 * @returns {{n:number, edges:Array<{a:number,b:number,w:number}>,
 *            positions:Array<{x:number,y:number}>, seed:number}}
 */
export function generateGraph({ n = 6, extraEdges = 3, minW = 1, maxW = 20, seed = 1 } = {}) {
  const rng = makeRng(seed);
  const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

  const edges = [];
  const have = new Set();
  const addEdge = (a, b) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    edges.push({ a: lo, b: hi, w: randInt(minW, maxW) });
    have.add(key(lo, hi));
  };

  // 1) Random spanning tree: each new node links to one earlier node ⇒ connected.
  const order = fisherYates([...Array(n).keys()], rng);
  for (let i = 1; i < n; i++) addEdge(order[i], order[randInt(0, i - 1)]);

  // 2) Extra chords (skip self-loops and duplicates).
  let added = 0;
  for (let tries = 0; added < extraEdges && tries < extraEdges * 30; tries++) {
    const a = randInt(0, n - 1), b = randInt(0, n - 1);
    if (a === b || have.has(key(a, b))) continue;
    addEdge(a, b);
    added++;
  }

  // 3) Circular layout (fractional 0..1 coords; the renderer scales to its canvas).
  const positions = [];
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / n - Math.PI / 2;
    positions.push({ x: 0.5 + 0.4 * Math.cos(ang), y: 0.5 + 0.4 * Math.sin(ang) });
  }

  return { n, edges, positions, seed };
}
