/**
 * LayoutSnapshot — contrat géométrique entre le solveur et le rendu.
 *
 * Le RECTANGLE est la source de vérité (x/y/width/height), pas `gridColumn` :
 * ça vit dans `gridRenderer.ts`, une conversion de rendu explicitement
 * temporaire. Un futur rendu spatial/absolu (V2) consommerait ce même
 * snapshot sans que `solver.ts`/`node.ts` changent.
 *
 * Zéro import React/DOM/CSS.
 */

import type { SectionChromeState } from './tokens';
import type { DegradeTier } from './priority';

export interface LayoutSnapshotEntry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  /** État de chrome effectif — peut différer de l'état propre du node si le solveur force `collapsed`. */
  state: SectionChromeState;
  /** Palier de dégradation atteint — debug/tests, jamais consommé par le rendu. */
  tier: DegradeTier;
}

export type LayoutSnapshot = Map<string, LayoutSnapshotEntry>;

export function emptySnapshot(): LayoutSnapshot {
  return new Map();
}
