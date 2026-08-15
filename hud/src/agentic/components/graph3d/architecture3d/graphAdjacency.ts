import type { GraphEdge } from './graphTypes';

export function buildAdjacency(edges: GraphEdge[]): {
  adjacency: Map<number, number[]>;
  neighbors: Map<number, number[]>;
} {
  const adjacency = new Map<number, number[]>();
  const neighbors = new Map<number, number[]>();

  for (const edge of edges) {
    const listA = adjacency.get(edge.a) ?? [];
    listA.push(edge.edgeIdx);
    adjacency.set(edge.a, listA);

    const listB = adjacency.get(edge.b) ?? [];
    listB.push(edge.edgeIdx);
    adjacency.set(edge.b, listB);

    const na = neighbors.get(edge.a) ?? [];
    if (!na.includes(edge.b)) na.push(edge.b);
    neighbors.set(edge.a, na);

    const nb = neighbors.get(edge.b) ?? [];
    if (!nb.includes(edge.a)) nb.push(edge.a);
    neighbors.set(edge.b, nb);
  }

  return { adjacency, neighbors };
}

export function edgeNeighbor(edge: GraphEdge, fromNode: number): number {
  return edge.a === fromNode ? edge.b : edge.a;
}

export function buildSubdividedLines(
  edges: GraphEdge[],
  subdiv: number,
): { positions: Float32Array; vertPairCount: number } {
  const segPerEdge = Math.max(1, subdiv - 1);
  const vertPairCount = edges.length * segPerEdge * 2;
  const positions = new Float32Array(vertPairCount * 3);
  let write = 0;

  for (let edgeIdx = 0; edgeIdx < edges.length; edgeIdx++) {
    const edge = edges[edgeIdx]!;
    edge.edgeIdx = edgeIdx;
    edge.lineSegStart = edgeIdx * segPerEdge;

    for (let s = 0; s < segPerEdge; s++) {
      const t0 = s / segPerEdge;
      const t1 = (s + 1) / segPerEdge;
      const i0 = write * 3;
      positions[i0] = edge.ax + (edge.bx - edge.ax) * t0;
      positions[i0 + 1] = edge.ay + (edge.by - edge.ay) * t0;
      positions[i0 + 2] = edge.az + (edge.bz - edge.az) * t0;
      const i1 = i0 + 3;
      positions[i1] = edge.ax + (edge.bx - edge.ax) * t1;
      positions[i1 + 1] = edge.ay + (edge.by - edge.ay) * t1;
      positions[i1 + 2] = edge.az + (edge.bz - edge.az) * t1;
      write += 2;
    }
  }

  return { positions, vertPairCount: write };
}
