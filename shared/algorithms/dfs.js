// dfs.js — DFS traversal step tracer (NO DOM, browser + Node).
// Same graph model as dijkstra.js. Tie-breaking: unvisited neighbours in
// ascending id order (mirrors the visualiser's adjacency ordering).

import { buildAdj } from './dijkstra.js';

export function dfsSteps(graph, source = 0) {
  const n = graph.n;
  const adj = graph.adj instanceof Map ? graph.adj : buildAdj(n, graph.edges);
  const visited = new Set();
  const order = [];

  // Iterative DFS to avoid call-stack depth limit on large graphs,
  // but still visit neighbours in ascending id order (smallest id first).
  function dfsRec(u) {
    visited.add(u);
    order.push(u);
    for (const { to: v } of adj.get(u)) {
      if (!visited.has(v)) dfsRec(v);
    }
  }
  dfsRec(source);

  const steps = order.map((id, k) => ({
    key: `visit-${k}`,
    phase: 'traversal',
    kind: 'pick-node',
    prompt: k === 0
      ? `DFS 從節點 ${source} 出發：第 1 個拜訪（起點）是哪個節點？`
      : `DFS 第 ${k + 1} 步：下一個拜訪的節點是？（優先走 id 最小的未拜訪鄰居）`,
    answer: id,
    focusNode: k > 0 ? order[k - 1] : null,
    meta: { step: k, visited: order.slice(0, k) },
  }));

  return { source, order, steps };
}
