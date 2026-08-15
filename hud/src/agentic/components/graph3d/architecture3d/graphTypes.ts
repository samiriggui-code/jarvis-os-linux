export type NodeTier = 'file' | 'folder' | 'module' | 'subsystem' | 'major_process';

export const TIER_SIZE: Record<NodeTier, number> = {
  file: 1,
  folder: 3,
  module: 6,
  subsystem: 10,
  major_process: 16,
};

export const TIER_BRANCH: Record<NodeTier, number> = {
  file: 0.06,
  folder: 0.1,
  module: 0.16,
  subsystem: 0.22,
  major_process: 0.28,
};

export const TIER_RANK: Record<NodeTier, number> = {
  file: 0,
  folder: 1,
  module: 2,
  subsystem: 3,
  major_process: 4,
};

export type GraphEdge = {
  edgeIdx: number;
  a: number;
  b: number;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  len: number;
  lineSegStart: number;
};

export type TierCounts = Record<NodeTier, number>;

export type NeuralGraphData = {
  positions: Float32Array;
  jitters: Float32Array;
  nodeTiers: NodeTier[];
  nodeSizes: Float32Array;
  nodeIntensity: Float32Array;
  /** Index du process major (0–8) propriétaire de chaque nœud. */
  nodeMajorIndex: Uint8Array;
  /** ids process dans le même ordre que Graph3DModel.nodes. */
  majorIds: string[];
  edgeSegments: GraphEdge[];
  adjacency: Map<number, number[]>;
  neighbors: Map<number, number[]>;
  linePositions: Float32Array;
  lineVertCount: number;
  count: number;
  tierCounts: TierCounts;
};

export type PulsePhase = 'discharge' | 'travel' | 'fade';

/** Simulation — indices du maillage existant (string = futur id sémantique). */
export type Pulse = {
  currentNodeId: number;
  nextNodeId: number;
  edgeId: number;
  progress: number;
  speed: number;
  energy: number;
  direction: 'in' | 'out';
  phase: PulsePhase;
  flashElapsed: number;
  flashDuration: number;
  prevNodeId: number;
  hopsLeft: number;
  touchedEdges: number[];
};

/** Réservé — convergence sémantique (CORE, VOICE, …). */
export type SimulationFocus = {
  regionId?: string | null;
  weight?: number;
};

export const PULSE_CONFIG = {
  pulseColor: '#FFFFFF',
  pulseLength: 0.16,
  pulseOpacity: 0.95,
  nodeFlashSize: 1.08,
  nodeFlashLum: 1.18,
  activePulsesMin: 5,
  activePulsesMax: 10,
  spawnMinMs: 220,
  spawnMaxMs: 520,
  edgeSubdiv: 8,
  fadeMs: 380,
  flashMinMs: 90,
  flashMaxMs: 180,
  edgeSpeedMin: 1.8,
  edgeSpeedMax: 3.4,
  hopMin: 3,
  hopMax: 7,
  basePointSize: 0.08,
  maxPulseSegments: 96,
} as const;
