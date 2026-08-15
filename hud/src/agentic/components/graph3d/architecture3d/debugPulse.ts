import { DEBUG_PULSE } from './debugConfig';
import type { GraphEdge } from './graphTypes';

/** Edge la plus face caméra (caméra à +Z, regard vers origine). */
export function pickFrontDebugEdge(edges: GraphEdge[]): GraphEdge {
  let best = edges[0]!;
  let bestScore = -Infinity;
  for (const edge of edges) {
    const mx = (edge.ax + edge.bx) * 0.5;
    const my = (edge.ay + edge.by) * 0.5;
    const mz = (edge.az + edge.bz) * 0.5;
    const face = mz;
    const centerPenalty = mx * mx + my * my;
    const score = face * 2.4 - centerPenalty * 0.35 + edge.len * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = edge;
    }
  }
  return best;
}

export function writeDebugPulseBand(
  positions: Float32Array,
  colors: Float32Array,
  edge: GraphEdge,
  progress: number,
  scratch: { x: number; y: number; z: number },
): number {
  const half = DEBUG_PULSE.bandLength * 0.5;
  const t0 = Math.max(0, progress - half);
  const t1 = Math.min(1, progress + half);

  const lerp = (t: number) => {
    scratch.x = edge.ax + (edge.bx - edge.ax) * t;
    scratch.y = edge.ay + (edge.by - edge.ay) * t;
    scratch.z = edge.az + (edge.bz - edge.az) * t;
  };

  lerp(t0);
  positions[0] = scratch.x;
  positions[1] = scratch.y;
  positions[2] = scratch.z;
  lerp(t1);
  positions[3] = scratch.x;
  positions[4] = scratch.y;
  positions[5] = scratch.z;

  for (let i = 0; i < 6; i++) colors[i] = 1;

  return 2;
}
