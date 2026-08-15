/**
 * OrbLayout — positions DANS le volume. Pas une peau de satellites.
 * Les autres layouts (cube / layered / network) sont des skins de pose
 * du même modèle ; la scène reste commune.
 */
import { CLOUD_R } from '../theme';
import type { Graph3DModel, GraphLayoutId, Vec3 } from '../types';

const INSIDE = CLOUD_R * 0.86;

const ORB_INTERIOR: Record<string, Vec3> = {
  core: [0, 0, 0],
  hermes: [-0.62, 0.18, 0.42],
  policy: [0.12, 1.22, 0.38],
  memory: [-0.48, 0.82, -0.62],
  hud: [-1.05, -0.9, 0.32],
  devices: [0.28, -1.15, 0.22],
  voice: [1.05, 0.9, 0.48],
  vision: [1.16, 0.08, -0.52],
  home: [0.8, -0.85, -0.66],
};

function len3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function clampInside(v: Vec3, maxR: number): Vec3 {
  const L = len3(v);
  if (L === 0 || L <= maxR) return v;
  const s = maxR / L;
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function fibonacciSphere(n: number, radius: number): Vec3[] {
  if (n <= 0) return [];
  if (n === 1) return [[0, 0, radius]];
  const pts: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    pts.push([Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius]);
  }
  return pts;
}

function cubeVertices(n: number): Vec3[] {
  const corners: Vec3[] = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ];
  const extra: Vec3[] = [
    [0, 1.25, 0],
    [0, -1.25, 0],
    [1.25, 0, 0],
    [-1.25, 0, 0],
  ];
  const pool = [...corners, ...extra];
  return Array.from({ length: n }, (_, i) => {
    const v = pool[i] ?? fibonacciSphere(n, 1.6)[i]!;
    return clampInside(v, 1.85);
  });
}

function layeredPositions(ids: string[]): Record<string, Vec3> {
  const bands: Record<string, number> = {
    hud: 1.45,
    voice: 1.45,
    vision: 1.45,
    core: 0.25,
    policy: 0.25,
    hermes: 0.25,
    memory: -0.85,
    devices: -1.55,
    home: -1.55,
  };
  const byY = new Map<number, string[]>();
  for (const id of ids) {
    const y = bands[id] ?? 0;
    const list = byY.get(y) ?? [];
    list.push(id);
    byY.set(y, list);
  }
  const out: Record<string, Vec3> = {};
  for (const [y, group] of byY) {
    group.forEach((id, i) => {
      const spread = Math.max(1.4, (group.length - 1) * 0.95);
      const x = group.length === 1 ? 0 : (i / (group.length - 1) - 0.5) * spread * 2;
      const z = (i % 2 === 0 ? 0.35 : -0.45) * (group.length > 1 ? 1 : 0);
      out[id] = [x, y, z];
    });
  }
  return out;
}

function networkPositions(ids: string[]): Record<string, Vec3> {
  const out: Record<string, Vec3> = {};
  const ring = ids.filter((id) => id !== 'core');
  out.core = [0, 0.08, 0];
  ring.forEach((id, i) => {
    const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
    out[id] = [Math.cos(a) * 1.55, Math.sin(a) * 0.18, Math.sin(a) * 1.55];
  });
  return out;
}

function orbPositions(model: Graph3DModel): Record<string, Vec3> {
  const ids = model.nodes.map((n) => n.id);
  const fib = fibonacciSphere(ids.length, INSIDE * 0.72);
  const out: Record<string, Vec3> = {};
  ids.forEach((id, i) => {
    const node = model.nodes[i]!;
    if (node.position) {
      out[id] = clampInside(node.position, INSIDE);
      return;
    }
    out[id] = clampInside(ORB_INTERIOR[id] ?? fib[i]!, INSIDE);
  });
  return out;
}

export function layoutPositions(model: Graph3DModel, layout: GraphLayoutId): Record<string, Vec3> {
  const ids = model.nodes.map((n) => n.id);
  if (layout === 'layered') return layeredPositions(ids);
  if (layout === 'network') return networkPositions(ids);
  if (layout === 'cube') {
    const verts = cubeVertices(ids.length);
    const out: Record<string, Vec3> = {};
    ids.forEach((id, i) => {
      out[id] = verts[i]!;
    });
    return out;
  }
  return orbPositions(model);
}

export function kNearestPairs(positions: Record<string, Vec3>, k = 4): Array<[string, string]> {
  const ids = Object.keys(positions);
  const seen = new Set<string>();
  const pairs: Array<[string, string]> = [];
  for (const a of ids) {
    const pa = positions[a]!;
    const ranked = ids
      .filter((b) => b !== a)
      .map((b) => {
        const pb = positions[b]!;
        const d = (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2 + (pa[2] - pb[2]) ** 2;
        return { b, d };
      })
      .sort((x, y) => x.d - y.d)
      .slice(0, k);
    for (const { b } of ranked) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([a, b]);
    }
  }
  return pairs;
}
