/**
 * Adapter — Architecture Awareness → Graph3DModel.
 * Le renderer ne connaît pas ce fichier.
 */
import type { Graph3DModel, GraphNode, GraphNodeStatus } from '../types';

export interface ArchitectureSnapshotLite {
  snapshot_id: string;
  as_of?: string;
  core: {
    role: string;
    host: string;
    status: string;
    provenance: string;
    note?: string;
  };
  services: Array<{
    id: string;
    label: string;
    status: string;
    provenance: string;
    host?: string;
    note?: string;
    cluster?: string;
  }>;
  surfaces: Array<{
    id: string;
    label: string;
    status: string;
    provenance: string;
    note?: string;
  }>;
  connections: Array<{ id: string; from: string; to: string; kind: string }>;
}

const CAPTIONS: Record<string, string> = {
  core: 'Noyau central — Calcul & Orchestration',
  policy: 'Règles & Gouvernance',
  hermes: 'Réseau de communication',
  memory: 'Mémoire contextuelle',
  devices: 'Périphériques connectés',
  home: 'Maison connectée',
  hud: 'Interface adaptative',
  voice: 'Voix & synthèse',
  vision: 'Gestes & objets',
};

/** Rails UI — aligné vendor/jarvis-neural-architecture/data/architectureData.ts */
const UI_ANCHORS: Record<string, { uiSide: 'left' | 'right'; uiAnchorTop: number }> = {
  core: { uiSide: 'left', uiAnchorTop: 22 },
  hermes: { uiSide: 'left', uiAnchorTop: 36 },
  memory: { uiSide: 'left', uiAnchorTop: 50 },
  policy: { uiSide: 'left', uiAnchorTop: 64 },
  hud: { uiSide: 'left', uiAnchorTop: 78 },
  devices: { uiSide: 'right', uiAnchorTop: 39 },
  home: { uiSide: 'right', uiAnchorTop: 54 },
  voice: { uiSide: 'right', uiAnchorTop: 69 },
  vision: { uiSide: 'right', uiAnchorTop: 62 },
};

function withUiAnchor(node: GraphNode): GraphNode {
  const anchor = UI_ANCHORS[node.id];
  return anchor ? { ...node, ...anchor } : node;
}

/** Sous-ensemble jugé "vivant" par défaut (sans focus) — pas tout, sinon plus aucun contraste. */
const ACTIVE_CONNECTION_IDS = new Set([
  'hud-core',
  'core-hermes',
  'core-memory',
  'hermes-memory',
  'policy-hermes',
  'core-voice',
]);

function toStatus(raw: string): GraphNodeStatus {
  const s = raw.toLowerCase();
  if (s === 'available') return 'available';
  if (s === 'configured') return 'configured';
  if (s === 'stale') return 'stale';
  if (s === 'conflict') return 'conflict';
  return 'unknown';
}

export function architectureLabSnapshot(): ArchitectureSnapshotLite {
  return {
    snapshot_id: 'lab-architecture-v0',
    as_of: 'lab',
    core: {
      role: 'architecture_authority',
      host: 'nuc-main',
      status: 'CONFIGURED',
      provenance: 'CODE',
      note: 'Core compile le snapshot ; ce nœud n’est pas une sonde réseau.',
    },
    services: [
      {
        id: 'policy',
        label: 'POLICY',
        status: 'AVAILABLE',
        provenance: 'CODE',
        host: 'nuc-main',
        note: 'Policy Engine — IA → proposition → autorisation → exécution.',
        cluster: 'core-plane',
      },
      {
        id: 'hermes',
        label: 'HERMES',
        status: 'CONFLICT',
        provenance: 'DOC',
        host: 'nuc (DOC) / vps (DOC)',
        note: 'Conflit d’hôte documenté, non résolu.',
        cluster: 'core-plane',
      },
      {
        id: 'memory',
        label: 'MEMORY',
        status: 'AVAILABLE',
        provenance: 'CODE',
        host: 'postgres',
        note: 'MemoryAPI · PgAdapter prod.',
        cluster: 'core-plane',
      },
      {
        id: 'devices',
        label: 'DEVICES',
        status: 'CONFIGURED',
        provenance: 'CODE',
        note: 'DeviceRegistry — discovery ≠ droits.',
        cluster: 'edge',
      },
      {
        id: 'home',
        label: 'HOME',
        status: 'CONFIGURED',
        provenance: 'CODE',
        host: 'pi-salon',
        note: 'Home Assistant adapter Core, pas cerveau.',
        cluster: 'edge',
      },
    ],
    surfaces: [
      {
        id: 'hud',
        label: 'HUD',
        status: 'AVAILABLE',
        provenance: 'CODE',
        note: 'React · propriétaire du pixel (P3).',
      },
      {
        id: 'voice',
        label: 'VOICE',
        status: 'CONFIGURED',
        provenance: 'CODE',
        note: 'voicebox VPS + ElevenLabs repli.',
      },
      {
        id: 'vision',
        label: 'VISION',
        status: 'CONFIGURED',
        provenance: 'CODE',
        note: 'Holomat / caméra — gestes & objets, pas auth.',
      },
    ],
    connections: [
      { id: 'hud-core', from: 'hud', to: 'core', kind: 'ws' },
      { id: 'core-policy', from: 'core', to: 'policy', kind: 'inproc' },
      { id: 'core-hermes', from: 'core', to: 'hermes', kind: 'http' },
      { id: 'core-memory', from: 'core', to: 'memory', kind: 'sql' },
      { id: 'core-devices', from: 'core', to: 'devices', kind: 'registry' },
      { id: 'devices-home', from: 'devices', to: 'home', kind: 'http' },
      { id: 'hud-voice', from: 'hud', to: 'voice', kind: 'media' },
      { id: 'hud-vision', from: 'hud', to: 'vision', kind: 'ws' },
      { id: 'hermes-memory', from: 'hermes', to: 'memory', kind: 'http' },
      { id: 'policy-hermes', from: 'policy', to: 'hermes', kind: 'gate' },
      { id: 'policy-memory', from: 'policy', to: 'memory', kind: 'gate' },
      { id: 'hud-memory', from: 'hud', to: 'memory', kind: 'ws' },
      { id: 'hud-hermes', from: 'hud', to: 'hermes', kind: 'ws' },
      { id: 'voice-vision', from: 'voice', to: 'vision', kind: 'bus' },
      { id: 'vision-devices', from: 'vision', to: 'devices', kind: 'bus' },
      { id: 'hermes-devices', from: 'hermes', to: 'devices', kind: 'http' },
      { id: 'core-voice', from: 'core', to: 'voice', kind: 'tts' },
      { id: 'core-home', from: 'core', to: 'home', kind: 'http' },
      { id: 'memory-devices', from: 'memory', to: 'devices', kind: 'bus' },
    ],
  };
}

export function adaptArchitectureSnapshot(snap: ArchitectureSnapshotLite): Graph3DModel {
  const core: GraphNode = {
    id: 'core',
    label: 'CORE',
    type: 'authority',
    cluster: 'core-plane',
    status: toStatus(snap.core.status),
    importance: 1,
    summary: snap.core.note,
    caption: CAPTIONS.core,
    facts: [
      { key: 'Rôle', value: snap.core.role },
      { key: 'Hôte', value: snap.core.host },
      { key: 'Statut', value: snap.core.status },
      { key: 'Provenance', value: snap.core.provenance },
      { key: 'Snapshot', value: snap.snapshot_id },
    ],
  };

  const services: GraphNode[] = snap.services.map((s) => ({
    id: s.id,
    label: s.label,
    type: 'service',
    cluster: s.cluster,
    status: toStatus(s.status),
    importance: s.id === 'hermes' ? 0.88 : s.id === 'policy' ? 0.78 : 0.7,
    summary: s.note,
    caption: CAPTIONS[s.id],
    facts: [
      { key: 'Statut', value: s.status },
      { key: 'Provenance', value: s.provenance },
      ...(s.host ? [{ key: 'Hôte', value: s.host }] : []),
    ],
  }));

  const surfaces: GraphNode[] = snap.surfaces.map((s) => ({
    id: s.id,
    label: s.label,
    type: 'surface',
    cluster: 'surfaces',
    status: toStatus(s.status),
    importance: s.id === 'hud' ? 0.82 : 0.62,
    summary: s.note,
    caption: CAPTIONS[s.id],
    facts: [
      { key: 'Statut', value: s.status },
      { key: 'Provenance', value: s.provenance },
    ],
  }));

  return {
    id: snap.snapshot_id,
    title: 'Architecture',
    level: 'global',
    nodes: [core, ...services, ...surfaces].map(withUiAnchor),
    edges: snap.connections.map((c) => ({
      id: c.id,
      source: c.from,
      target: c.to,
      type: c.kind,
      active: ACTIVE_CONNECTION_IDS.has(c.id),
    })),
    clusters: [
      { id: 'core-plane', label: 'Plan Core', nodeIds: ['core', 'policy', 'hermes', 'memory'] },
      { id: 'surfaces', label: 'Surfaces', nodeIds: ['hud', 'voice', 'vision'] },
      { id: 'edge', label: 'Bord', nodeIds: ['devices', 'home'] },
    ],
  };
}

export function architectureGraphLab(): Graph3DModel {
  return adaptArchitectureSnapshot(architectureLabSnapshot());
}
