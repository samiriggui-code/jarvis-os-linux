import type { Graph3DModel, GraphFocusAnchor, GraphLevel, Vec3 } from './types';
import { CLOUD_R } from './theme';

export type GraphFocusRailSide = 'left' | 'right';

/** Côté latéral du nœud dans l’orbe (3D), pas l’inverse. */
export function focusRailSide(anchor: GraphFocusAnchor | null): GraphFocusRailSide {
  if (!anchor) return 'left';
  const wx = anchor.worldX;
  if (Math.abs(wx) < 0.06) return anchor.nx <= 0 ? 'left' : 'right';
  return wx < 0 ? 'left' : 'right';
}

/** Décalage vertical, calé sur la projection écran du nœud. */
export function focusRailTop(anchor: GraphFocusAnchor | null, cardH = 280, pad = 16): number {
  if (!anchor) return pad;
  const maxTop = Math.max(pad, anchor.canvasH - cardH - pad);
  return Math.max(pad, Math.min(anchor.y - 48, maxTop));
}

/** Côté UI déclaré par l’adapter (vendor) ; repli projection 3D. */
export function nodeUiSide(
  node: { uiSide?: 'left' | 'right' } | null,
  anchor: GraphFocusAnchor | null,
): GraphFocusRailSide {
  if (node?.uiSide) return node.uiSide;
  return focusRailSide(anchor);
}

export interface GraphFocusSideDock {
  side: GraphFocusRailSide;
  top: number;
  width: number;
  left?: number;
  right?: number;
}

/**
 * Dock latéral vendor — overlay absolu (left/right: 22px), canvas plein écran.
 * Pas de grille, pas de placeBeside au centre.
 */
export function focusSideDock(
  anchor: GraphFocusAnchor | null,
  node: { uiSide?: 'left' | 'right'; uiAnchorTop?: number } | null,
  cardH = 280,
  edgePad = 22,
): GraphFocusSideDock | null {
  if (!anchor || !node) return null;
  const side = nodeUiSide(node, anchor);
  const width = Math.min(280, Math.max(200, Math.round(anchor.canvasW * 0.18)));
  const topPct = node.uiAnchorTop ?? 45;
  let top = (topPct / 100) * anchor.canvasH - cardH * 0.35;
  top = Math.max(16, Math.min(top, anchor.canvasH - cardH - 16));
  if (side === 'left') return { side, top, width, left: edgePad };
  return { side, top, width, right: edgePad };
}

/** @deprecated — focusSideDock */
export interface GraphFocusCardBox {
  side: GraphFocusRailSide;
  left: number;
  top: number;
  width: number;
}

export function focusCardBox(
  anchor: GraphFocusAnchor | null,
  node: { uiSide?: 'left' | 'right'; uiAnchorTop?: number } | null,
  cardW = 280,
  cardH = 280,
  pad = 22,
): GraphFocusCardBox | null {
  const dock = focusSideDock(anchor, node, cardH, pad);
  if (!dock) return null;
  const left =
    dock.left ??
    (dock.right !== undefined ? anchor!.canvasW - dock.width - dock.right : pad);
  return { side: dock.side, left, top: dock.top, width: dock.width };
}

/** @deprecated Utiliser focusCardBox — conservé pour compat. */
export interface GraphFocusRailBox {
  side: GraphFocusRailSide;
  top: number;
  width: number;
  left?: number;
  right?: number;
}

export function focusRailBox(
  anchor: GraphFocusAnchor | null,
  node: { uiSide?: 'left' | 'right'; uiAnchorTop?: number } | null,
  cardW = 280,
  pad = 22,
): GraphFocusRailBox {
  const box = focusCardBox(anchor, node, cardW, 280, pad);
  if (!box) return { side: 'left', top: pad, width: cardW, left: pad };
  return { side: box.side, top: box.top, width: box.width, left: box.left };
}

export function neighborsOf(model: Graph3DModel, id: string): Set<string> {
  const next = new Set<string>([id]);
  for (const e of model.edges) {
    if (e.source === id) next.add(e.target);
    if (e.target === id) next.add(e.source);
  }
  const node = model.nodes.find((n) => n.id === id);
  const clusterId = node?.cluster ?? node?.group;
  if (clusterId && model.clusters) {
    model.clusters.find((c) => c.id === clusterId)?.nodeIds.forEach((n) => next.add(n));
  }
  return next;
}

export function visibleNodeIds(
  model: Graph3DModel,
  level: GraphLevel,
  focusId: string | null,
): Set<string> {
  const all = new Set(model.nodes.map((n) => n.id));
  if (!focusId || level === 'global') return all;
  const near = neighborsOf(model, focusId);
  if (level === 'detail') return new Set([focusId]);
  if (level === 'component') {
    const t = model.nodes.find((n) => n.id === focusId)?.type;
    const same = model.nodes.filter((n) => n.type === t).map((n) => n.id);
    return new Set([focusId, ...same, ...near]);
  }
  return near;
}

/** Labels hors du nuage. CORE = haut-gauche (référence visuelle). */
export function labelAnchor(id: string, p: Vec3): Vec3 {
  const L = Math.hypot(p[0], p[1], p[2]);
  if (id === 'core' || L < 0.08) return [-2.7, 1.78, 0.12];
  const s = (CLOUD_R + 1.05) / L;
  return [p[0] * s, p[1] * s, p[2] * s];
}
