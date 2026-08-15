/**
 * Graph3DModel — contrat générique d'un graphe spatial.
 *
 * Le renderer ne connaît que ce fichier. Un adapter (architecture, HA,
 * agents, repo…) produit ce modèle ; il n'envoie jamais de Three.js.
 */

export type GraphLevel = 'global' | 'cluster' | 'component' | 'detail';

export type GraphLayoutId = 'orb' | 'cube' | 'layered' | 'network';

export type GraphNodeStatus = 'available' | 'configured' | 'unknown' | 'stale' | 'conflict';

export type Vec3 = readonly [number, number, number];

/** Projection écran du nœud focus — pour ancrer l’UI 2D au bon côté. */
export interface GraphFocusAnchor {
  x: number;
  y: number;
  nx: number;
  ny: number;
  /** Position X monde du nœud — côté gauche/droite stable (indépendant de l’orbit). */
  worldX: number;
  canvasW: number;
  canvasH: number;
}

export interface GraphNode {
  id: string;
  label: string;
  /** Groupe sémantique (ex. authority, service, surface) — pas un style. */
  type: string;
  group?: string;
  cluster?: string;
  status?: GraphNodeStatus;
  /** 0–1, taille / halo du nœud sémantique. */
  importance?: number;
  caption?: string;
  summary?: string;
  facts?: Array<{ key: string; value: string }>;
  /** Override de layout si l'adapter connaît déjà une pose. */
  position?: Vec3;
  /** Rail UI 2D — réf. vendor jarvis-neural-architecture. */
  uiSide?: 'left' | 'right';
  /** Position verticale du rail (% viewport), 0–100. */
  uiAnchorTop?: number;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id?: string;
  source: string;
  target: string;
  type?: string;
  strength?: number;
  /** Flux live vs dépendance structurelle. */
  active?: boolean;
  metadata?: Record<string, unknown>;
}

export interface GraphCluster {
  id: string;
  label: string;
  nodeIds: string[];
  importance?: number;
  metadata?: Record<string, unknown>;
}

export interface Graph3DModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters?: GraphCluster[];
  focus?: string;
  level?: GraphLevel;
  id?: string;
  title?: string;
}

export const GRAPH_LAYOUTS: { id: GraphLayoutId; label: string }[] = [
  { id: 'orb', label: 'Orbe' },
  { id: 'cube', label: 'Cube' },
  { id: 'layered', label: 'Couches' },
  { id: 'network', label: 'Réseau' },
];

export const GRAPH_LEVELS: { id: GraphLevel; label: string }[] = [
  { id: 'global', label: 'Global' },
  { id: 'cluster', label: 'Cluster' },
  { id: 'component', label: 'Composant' },
  { id: 'detail', label: 'Détail' },
];
