// ════════════════════════════════════════════════════════════════════════════
//  Server-side chapter adapter: Dijkstra shortest paths.
//  generate(seed) → { instance (presentational, no answers), steps (with answers) }
// ════════════════════════════════════════════════════════════════════════════

import { generateGraph } from '../../shared/algorithms/graph-gen.js';
import { dijkstraSteps } from '../../shared/algorithms/dijkstra.js';

export const meta = { id: 'dijkstra', title: 'Dijkstra 最短路徑', n: 6 };

export function generate(seed) {
  const g = generateGraph({ n: meta.n, extraEdges: 3, minW: 1, maxW: 20, seed });
  const { steps } = dijkstraSteps(g, 0);
  const nodes = g.positions.map((p, id) => ({ id, x: p.x, y: p.y }));
  const instance = { source: 0, nodes, edges: g.edges };
  return { instance, steps };
}
