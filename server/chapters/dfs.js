import { generateGraph } from '../../shared/algorithms/graph-gen.js';
import { dfsSteps } from '../../shared/algorithms/dfs.js';

export const meta = { id: 'dfs', title: 'DFS 走訪', n: 5 };

export function generate(seed) {
  const g = generateGraph({ n: meta.n, extraEdges: 2, minW: 1, maxW: 1, seed });
  const { steps } = dfsSteps(g, 0);

  // Instance: graph topology only (no answer info)
  const nodes = g.positions.map((p, id) => ({ id, x: p.x, y: p.y }));
  return {
    instance: { source: 0, nodes, edges: g.edges },
    steps,
  };
}
