import * as THREE from 'three';
import type { SpatialMode } from '../../../../spatial/theme/SpatialTheme';
import { orbColorFromDTop } from './orbPalette';

const UP = new THREE.Vector3(0, 1, 0);
const FALLBACK = new THREE.Vector3(1, 0, 0);
const n = new THREE.Vector3();
const t1 = new THREE.Vector3();
const t2 = new THREE.Vector3();

/** Bras de croix en unités monde — TIER_SIZE 1/3/6/10/16 → jonction synaptique, pas sprite. */
const ARM_SCALE = 0.0072;

/** 2 segments × 2 sommets = 4 sommets par nœud. */
export const VERTS_PER_NODE_CROSS = 4;

export function nodeCrossVertCount(nodeCount: number): number {
  return nodeCount * VERTS_PER_NODE_CROSS;
}

/** Croix (+) tangente à la sphère — géométrie ligne réelle. */
export function writeNodeCrossPositions(
  centers: Float32Array,
  sizes: Float32Array,
  nodeCount: number,
  out: Float32Array,
): void {
  for (let i = 0; i < nodeCount; i++) {
    const i3 = i * 3;
    const cx = centers[i3]!;
    const cy = centers[i3 + 1]!;
    const cz = centers[i3 + 2]!;
    const arm = sizes[i]! * ARM_SCALE;

    n.set(cx, cy, cz);
    if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
    n.normalize();
    t1.crossVectors(n, UP);
    if (t1.lengthSq() < 1e-6) t1.crossVectors(n, FALLBACK);
    t1.normalize();
    t2.crossVectors(n, t1).normalize();

    const b = i * VERTS_PER_NODE_CROSS * 3;
    out[b] = cx - t1.x * arm;
    out[b + 1] = cy - t1.y * arm;
    out[b + 2] = cz - t1.z * arm;
    out[b + 3] = cx + t1.x * arm;
    out[b + 4] = cy + t1.y * arm;
    out[b + 5] = cz + t1.z * arm;
    out[b + 6] = cx - t2.x * arm;
    out[b + 7] = cy - t2.y * arm;
    out[b + 8] = cz - t2.z * arm;
    out[b + 9] = cx + t2.x * arm;
    out[b + 10] = cy + t2.y * arm;
    out[b + 11] = cz + t2.z * arm;
  }
}

export function paintNodeCrossGradient(
  centers: Float32Array,
  colors: Float32Array,
  jitters: Float32Array | null,
  nodeCount: number,
  mode: SpatialMode,
  modelView: THREE.Matrix4,
  scratch: THREE.Vector3,
): void {
  for (let i = 0; i < nodeCount; i++) {
    const i3 = i * 3;
    scratch.set(centers[i3]!, centers[i3 + 1]!, centers[i3 + 2]!);
    scratch.normalize();
    scratch.applyMatrix4(modelView);
    const jitter = jitters ? (jitters[i] ?? 0) : 0;
    const dTop = Math.max(0, Math.min(1, 0.5 - scratch.y * 0.42 + jitter));
    const c = orbColorFromDTop(dTop, mode);
    for (let v = 0; v < VERTS_PER_NODE_CROSS; v++) {
      const vi = (i * VERTS_PER_NODE_CROSS + v) * 3;
      colors[vi] = c.r;
      colors[vi + 1] = c.g;
      colors[vi + 2] = c.b;
    }
  }
}
