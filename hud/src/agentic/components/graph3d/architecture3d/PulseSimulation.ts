import {
  PULSE_CONFIG,
  TIER_BRANCH,
  TIER_RANK,
  type GraphEdge,
  type NeuralGraphData,
  type NodeTier,
  type Pulse,
} from './graphTypes';
import { edgeNeighbor } from './graphAdjacency';
import { getNodeTier } from './neuralGraphBuild';

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickSpawnNode(graph: NeuralGraphData): number {
  const { adjacency, count } = graph;
  for (let tries = 0; tries < 32; tries++) {
    const node = Math.floor(Math.random() * count);
    if ((adjacency.get(node)?.length ?? 0) > 0) return node;
  }
  for (const [node, edges] of adjacency) {
    if (edges.length > 0) return node;
  }
  return 0;
}

function weightedPickEdge(
  graph: NeuralGraphData,
  fromNode: number,
  prevNode: number,
  direction: 'in' | 'out',
): { edgeId: number; nextNodeId: number } | null {
  const candidates = (graph.adjacency.get(fromNode) ?? []).filter((edgeId) => {
    const edge = graph.edgeSegments[edgeId];
    if (!edge) return false;
    return edgeNeighbor(edge, fromNode) !== prevNode;
  });
  if (candidates.length === 0) return null;

  const weights: number[] = [];
  let total = 0;
  for (const edgeId of candidates) {
    const edge = graph.edgeSegments[edgeId]!;
    const nb = edgeNeighbor(edge, fromNode);
    const tier = getNodeTier(graph, nb);
    const rank = TIER_RANK[tier];
    const fromRank = TIER_RANK[getNodeTier(graph, fromNode)];
    const climb = Math.max(0, rank - fromRank);
    const descend = Math.max(0, fromRank - rank);
    const bias =
      direction === 'in'
        ? 1 + climb * 0.35 + rank * 0.06
        : 1 + descend * 0.28 + (4 - rank) * 0.04;
    const w = bias * (0.85 + Math.random() * 0.3);
    weights.push(w);
    total += w;
  }

  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) {
      const edgeId = candidates[i]!;
      const edge = graph.edgeSegments[edgeId]!;
      return { edgeId, nextNodeId: edgeNeighbor(edge, fromNode) };
    }
  }

  const edgeId = candidates[candidates.length - 1]!;
  const edge = graph.edgeSegments[edgeId]!;
  return { edgeId, nextNodeId: edgeNeighbor(edge, fromNode) };
}

export function createPulse(graph: NeuralGraphData, sourceNode: number): Pulse | null {
  const pick = weightedPickEdge(graph, sourceNode, -1, Math.random() < 0.55 ? 'in' : 'out');
  if (!pick) return null;

  return {
    currentNodeId: sourceNode,
    nextNodeId: pick.nextNodeId,
    edgeId: pick.edgeId,
    progress: 0,
    speed: randRange(PULSE_CONFIG.edgeSpeedMin, PULSE_CONFIG.edgeSpeedMax),
    energy: 1,
    direction: Math.random() < 0.5 ? 'in' : 'out',
    phase: 'discharge',
    flashElapsed: 0,
    flashDuration: randRange(PULSE_CONFIG.flashMinMs, PULSE_CONFIG.flashMaxMs),
    prevNodeId: -1,
    hopsLeft: Math.floor(randRange(PULSE_CONFIG.hopMin, PULSE_CONFIG.hopMax + 0.999)),
    touchedEdges: [],
  };
}

function maybeBranch(
  graph: NeuralGraphData,
  pulse: Pulse,
  pulses: Pulse[],
  maxPulses: number,
): void {
  if (pulses.length >= maxPulses) return;
  const tier = getNodeTier(graph, pulse.currentNodeId);
  if (Math.random() >= TIER_BRANCH[tier]) return;

  const pick = weightedPickEdge(graph, pulse.currentNodeId, pulse.prevNodeId, pulse.direction);
  if (!pick || pick.edgeId === pulse.edgeId) return;

  pulses.push({
    currentNodeId: pulse.currentNodeId,
    nextNodeId: pick.nextNodeId,
    edgeId: pick.edgeId,
    progress: 0,
    speed: pulse.speed * randRange(0.85, 1.15),
    energy: pulse.energy * 0.82,
    direction: pulse.direction,
    phase: 'travel',
    flashElapsed: 0,
    flashDuration: 0,
    prevNodeId: pulse.prevNodeId,
    hopsLeft: Math.max(1, pulse.hopsLeft - 1),
    touchedEdges: [],
  });
}

export class PulseSimulation {
  readonly pulses: Pulse[] = [];
  private spawnElapsed = 0;
  private nextSpawnMs = randRange(PULSE_CONFIG.spawnMinMs, PULSE_CONFIG.spawnMaxMs);
  private activeCap =
    PULSE_CONFIG.activePulsesMin +
    Math.floor(Math.random() * (PULSE_CONFIG.activePulsesMax - PULSE_CONFIG.activePulsesMin + 1));

  seed(graph: NeuralGraphData, count = PULSE_CONFIG.activePulsesMin): void {
    for (let i = 0; i < count && this.pulses.length < this.activeCap; i++) {
      const source = pickSpawnNode(graph);
      const pulse = createPulse(graph, source);
      if (!pulse) continue;
      pulse.phase = 'travel';
      pulse.progress = Math.random();
      this.pulses.push(pulse);
    }
  }

  tick(deltaSec: number, graph: NeuralGraphData): void {
    this.spawnElapsed += deltaSec * 1000;
    if (this.spawnElapsed >= this.nextSpawnMs && this.pulses.length < this.activeCap) {
      const source = pickSpawnNode(graph);
      const pulse = createPulse(graph, source);
      if (pulse) this.pulses.push(pulse);
      this.spawnElapsed = 0;
      this.nextSpawnMs = randRange(PULSE_CONFIG.spawnMinMs, PULSE_CONFIG.spawnMaxMs);
      this.activeCap =
        PULSE_CONFIG.activePulsesMin +
        Math.floor(Math.random() * (PULSE_CONFIG.activePulsesMax - PULSE_CONFIG.activePulsesMin + 1));
    }

    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pulse = this.pulses[i]!;
      this.advance(pulse, deltaSec, graph, this.activeCap);
      if (pulse.energy <= 0.01 && pulse.phase === 'fade') {
        this.pulses.splice(i, 1);
      }
    }
  }

  private advance(pulse: Pulse, deltaSec: number, graph: NeuralGraphData, cap: number): void {
    if (pulse.phase === 'discharge') {
      pulse.flashElapsed += deltaSec * 1000;
      pulse.energy = 1;
      if (pulse.flashElapsed >= pulse.flashDuration) {
        pulse.phase = 'travel';
      }
      return;
    }

    if (pulse.phase === 'travel') {
      pulse.energy = 1;
      pulse.progress += pulse.speed * deltaSec;

      if (pulse.progress < 1) return;

      const traveledEdge = pulse.edgeId;
      if (!pulse.touchedEdges.includes(traveledEdge)) {
        pulse.touchedEdges.push(traveledEdge);
      }

      const fromNode = pulse.currentNodeId;
      pulse.currentNodeId = pulse.nextNodeId;
      pulse.progress = 0;
      pulse.flashElapsed = 0;
      pulse.flashDuration = randRange(PULSE_CONFIG.flashMinMs, PULSE_CONFIG.flashMaxMs);
      pulse.prevNodeId = fromNode;
      pulse.phase = 'discharge';

      maybeBranch(graph, pulse, this.pulses, cap);

      pulse.hopsLeft--;
      if (pulse.hopsLeft <= 0) {
        pulse.phase = 'fade';
        pulse.energy = 1;
        return;
      }

      const pick = weightedPickEdge(graph, pulse.currentNodeId, pulse.prevNodeId, pulse.direction);
      if (!pick) {
        pulse.phase = 'fade';
        return;
      }

      pulse.edgeId = pick.edgeId;
      pulse.nextNodeId = pick.nextNodeId;
      pulse.direction = Math.random() < 0.72 ? pulse.direction : pulse.direction === 'in' ? 'out' : 'in';
      return;
    }

    pulse.energy = Math.max(0, pulse.energy - deltaSec / (PULSE_CONFIG.fadeMs / 1000));
  }
}

export function tierAtNode(graph: NeuralGraphData, nodeId: number): NodeTier {
  return getNodeTier(graph, nodeId);
}
