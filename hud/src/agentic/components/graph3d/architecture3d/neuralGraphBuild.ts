import * as THREE from 'three';
import type { Graph3DModel } from '../types';
import { architectureGraphLab } from '../adapters/architecture';
import {
  PULSE_CONFIG,
  TIER_SIZE,
  type GraphEdge,
  type NeuralGraphData,
  type NodeTier,
} from './graphTypes';
import { buildAdjacency, buildSubdividedLines } from './graphAdjacency';
import { countTiers } from './debugConfig';
import {
  computeNeuralTierBudget,
  tierAtIndex,
  totalNeuralNodes,
} from './neuralTierBudget';

const RADIUS = 3.15;
const ORB_SCALE = RADIUS * 0.72;

/** Positions intérieures vendor — `layouts/orb.ts` ORB_INTERIOR. */
const ORB_INTERIOR: Record<string, [number, number, number]> = {
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

export const DEFAULT_NEURAL_NODE_COUNT = totalNeuralNodes(
  computeNeuralTierBudget(architectureGraphLab()),
);

function fibonacciOnSphere(n: number, radius: number, out: THREE.Vector3[]) {
  if (n <= 0) return;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    out.push(
      new THREE.Vector3(Math.cos(theta) * ring * radius, y * radius, Math.sin(theta) * ring * radius),
    );
  }
}

function randomInVolume(minR: number, maxR: number): THREE.Vector3 {
  const u = Math.random();
  const v = Math.random();
  const theta = Math.PI * 2 * u;
  const cosPhi = 2 * v - 1;
  const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
  const r = minR + (maxR - minR) * Math.cbrt(Math.random());
  return new THREE.Vector3(r * sinPhi * Math.cos(theta), r * cosPhi, r * sinPhi * Math.sin(theta));
}

function assignExplicitTiers(budget: ReturnType<typeof computeNeuralTierBudget>) {
  const count = totalNeuralNodes(budget);
  const nodeTiers: NodeTier[] = new Array(count);
  const nodeSizes = new Float32Array(count);
  const nodeIntensity = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const tier = tierAtIndex(budget, i);
    nodeTiers[i] = tier;
    nodeSizes[i] = TIER_SIZE[tier];
    nodeIntensity[i] = 1;
  }

  return { nodeTiers, nodeSizes, nodeIntensity, count };
}

/** Graphe neural calé sur le modèle architecture prod (9 + 6 + 18 + …). */
export function buildNeuralGraph(model: Graph3DModel = architectureGraphLab()): NeuralGraphData {
  const budget = computeNeuralTierBudget(model);
  const { nodeTiers, nodeSizes, nodeIntensity, count } = assignExplicitTiers(budget);
  const points: THREE.Vector3[] = new Array(count);
  const majorIndexById = new Map<string, number>();

  // major_process — 9 nœuds sémantiques (positions vendor ORB_INTERIOR)
  model.nodes.forEach((node, i) => {
    majorIndexById.set(node.id, i);
    const interior = ORB_INTERIOR[node.id];
    points[i] = interior
      ? new THREE.Vector3(interior[0] * ORB_SCALE, interior[1] * ORB_SCALE, interior[2] * ORB_SCALE)
      : fibonacciOnSphere(1, RADIUS * 0.55, [])[0]!;
  });

  let cursor = budget.major_process;

  const subsystemShell: THREE.Vector3[] = [];
  fibonacciOnSphere(budget.subsystem, RADIUS * 0.58, subsystemShell);
  for (let i = 0; i < budget.subsystem; i++) {
    points[cursor++] = subsystemShell[i]!.clone();
  }

  const moduleStart = cursor;
  for (let m = 0; m < budget.module; m++) {
    const edge = model.edges[m];
    if (edge) {
      const a = majorIndexById.get(edge.source);
      const b = majorIndexById.get(edge.target);
      if (a != null && b != null) {
        points[cursor] = points[a]!.clone().lerp(points[b]!, 0.5);
      } else {
        points[cursor] = randomInVolume(RADIUS * 0.35, RADIUS * 0.62);
      }
    } else {
      points[cursor] = randomInVolume(RADIUS * 0.35, RADIUS * 0.62);
    }
    cursor++;
  }

  for (let i = 0; i < budget.folder; i++) {
    points[cursor++] = randomInVolume(RADIUS * 0.42, RADIUS * 0.78);
  }

  for (let i = 0; i < budget.file; i++) {
    points[cursor++] = randomInVolume(RADIUS * 0.12, RADIUS * 0.94);
  }

  const positions = new Float32Array(count * 3);
  const jitters = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = points[i]!;
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
    jitters[i] = (Math.random() - 0.5) * 0.04;
  }

  const edgeSegments: GraphEdge[] = [];
  const seen = new Set<string>();

  const pushEdge = (i: number, j: number) => {
    if (i === j) return;
    const a = Math.min(i, j);
    const b = Math.max(i, j);
    const edgeKey = `${a}-${b}`;
    if (seen.has(edgeKey)) return;
    seen.add(edgeKey);
    const p = points[a]!;
    const q = points[b]!;
    edgeSegments.push({
      edgeIdx: edgeSegments.length,
      a,
      b,
      ax: p.x,
      ay: p.y,
      az: p.z,
      bx: q.x,
      by: q.y,
      bz: q.z,
      len: p.distanceTo(q),
      lineSegStart: 0,
    });
  };

  const subsystemStart = budget.major_process;
  const moduleStartIdx = budget.major_process + budget.subsystem;

  // Synapses prod — connexions sémantiques Graph3DModel
  for (const edge of model.edges) {
    const a = majorIndexById.get(edge.source);
    const b = majorIndexById.get(edge.target);
    if (a == null || b == null) continue;
    pushEdge(a, b);
  }

  // Modules pontent leurs extrémités sémantiques
  for (let m = 0; m < budget.module; m++) {
    const moduleIdx = moduleStartIdx + m;
    const edge = model.edges[m];
    if (!edge) continue;
    const a = majorIndexById.get(edge.source);
    const b = majorIndexById.get(edge.target);
    if (a == null || b == null) continue;
    pushEdge(moduleIdx, a);
    pushEdge(moduleIdx, b);
  }

  // Modules sans synapse directe → subsystem le plus proche
  for (let m = model.edges.length; m < budget.module; m++) {
    const moduleIdx = moduleStartIdx + m;
    let bestSub = subsystemStart;
    let bestD = Infinity;
    for (let s = subsystemStart; s < subsystemStart + budget.subsystem; s++) {
      const d = points[moduleIdx]!.distanceToSquared(points[s]!);
      if (d < bestD) {
        bestD = d;
        bestSub = s;
      }
    }
    pushEdge(moduleIdx, bestSub);
  }

  // Subsystems → major le plus proche
  for (let s = 0; s < budget.subsystem; s++) {
    const subIdx = subsystemStart + s;
    let bestMajor = 0;
    let bestD = Infinity;
    for (let mj = 0; mj < budget.major_process; mj++) {
      const d = points[subIdx]!.distanceToSquared(points[mj]!);
      if (d < bestD) {
        bestD = d;
        bestMajor = mj;
      }
    }
    pushEdge(subIdx, bestMajor);
  }

  // Maille locale — folders/files traversent le volume (grille spatiale si n > 120)
  const ambientStart = budget.major_process + budget.subsystem + budget.module;
  const ambientConnections = budget.file > 200 ? 2 : 3;
  const cellSize = RADIUS * 0.38;
  const grid = new Map<string, number[]>();
  const gridKey = (x: number, y: number, z: number) => `${x}|${y}|${z}`;

  for (let i = ambientStart; i < count; i++) {
    const p = points[i]!;
    const gx = Math.floor(p.x / cellSize);
    const gy = Math.floor(p.y / cellSize);
    const gz = Math.floor(p.z / cellSize);
    const k = gridKey(gx, gy, gz);
    const list = grid.get(k) ?? [];
    list.push(i);
    grid.set(k, list);
  }

  for (let i = ambientStart; i < count; i++) {
    const p = points[i]!;
    const gx = Math.floor(p.x / cellSize);
    const gy = Math.floor(p.y / cellSize);
    const gz = Math.floor(p.z / cellSize);
    const ranked: Array<[number, number]> = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(gridKey(gx + dx, gy + dy, gz + dz));
          if (!bucket) continue;
          for (const j of bucket) {
            if (i === j) continue;
            ranked.push([j, p.distanceToSquared(points[j]!)]);
          }
        }
      }
    }

    ranked.sort((a, b) => a[1] - b[1]);
    for (let n = 0; n < Math.min(ambientConnections, ranked.length); n++) {
      pushEdge(i, ranked[n]![0]);
    }

    if (tierAtIndex(budget, i) === 'file' && budget.module > 0 && Math.random() < 0.25) {
      let bestModule = moduleStartIdx;
      let bestD = Infinity;
      for (let m = moduleStartIdx; m < moduleStartIdx + budget.module; m++) {
        const d = p.distanceToSquared(points[m]!);
        if (d < bestD) {
          bestD = d;
          bestModule = m;
        }
      }
      pushEdge(i, bestModule);
    }

    if (tierAtIndex(budget, i) === 'file' && Math.random() < 0.04) {
      pushEdge(i, Math.floor(Math.random() * budget.major_process));
    }
  }

  const { adjacency, neighbors } = buildAdjacency(edgeSegments);
  const { positions: linePositions, vertPairCount } = buildSubdividedLines(
    edgeSegments,
    PULSE_CONFIG.edgeSubdiv,
  );

  const majorIds = model.nodes.map((n) => n.id);
  const nodeMajorIndex = new Uint8Array(count);
  for (let i = 0; i < budget.major_process; i++) {
    nodeMajorIndex[i] = i;
  }

  for (let s = 0; s < budget.subsystem; s++) {
    const subIdx = subsystemStart + s;
    let bestMajor = 0;
    let bestD = Infinity;
    for (let mj = 0; mj < budget.major_process; mj++) {
      const d = points[subIdx]!.distanceToSquared(points[mj]!);
      if (d < bestD) {
        bestD = d;
        bestMajor = mj;
      }
    }
    nodeMajorIndex[subIdx] = bestMajor;
  }

  for (let m = 0; m < budget.module; m++) {
    const moduleIdx = moduleStartIdx + m;
    const edge = model.edges[m];
    let owner = 0;
    if (edge) {
      const a = majorIndexById.get(edge.source);
      const b = majorIndexById.get(edge.target);
      owner = a ?? b ?? 0;
    } else {
      owner = nodeMajorIndex[subsystemStart] ?? 0;
    }
    nodeMajorIndex[moduleIdx] = owner;
  }

  for (let i = ambientStart; i < count; i++) {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let j = 0; j < i; j++) {
      if (nodeTiers[j] === 'file' && j >= ambientStart) continue;
      const d = points[i]!.distanceToSquared(points[j]!);
      if (d < bestD) {
        bestD = d;
        bestIdx = j;
      }
    }
    nodeMajorIndex[i] = nodeMajorIndex[bestIdx] ?? 0;
  }

  return {
    positions,
    jitters,
    nodeTiers,
    nodeSizes,
    nodeIntensity,
    nodeMajorIndex,
    majorIds,
    edgeSegments,
    adjacency,
    neighbors,
    linePositions,
    lineVertCount: vertPairCount,
    count,
    tierCounts: countTiers(nodeTiers),
  };
}

export function getNodeTier(
  graph: Pick<NeuralGraphData, 'nodeTiers'>,
  nodeId: number,
): NodeTier {
  return graph.nodeTiers[nodeId] ?? 'file';
}
