/**
 * Rendu CSS Grid — conversion EXPLICITEMENT TEMPORAIRE rectangle → `gridColumn`.
 *
 * C'est le seul endroit où le V1 parle encore CSS Grid ; un futur rendu
 * spatial/absolu (V2) remplace ce fichier, jamais `solver.ts`/`node.ts`.
 *
 * `profileForWidth` (de `responsivePack.ts`) ne sert ici qu'à choisir combien
 * de colonnes de rendu pour la quantification CSS Grid — jamais à décider de
 * l'espace disponible pour le solveur (ça, c'est `AvailableSpace` en px réel).
 *
 * `SectionFrame` n'accepte qu'un `gridColumn` (pas de `gridRow`) — l'ordre
 * vertical vient de l'ordre DOM + de l'auto-flow du navigateur. `orderForGrid`
 * trie donc les sections dans l'ordre où le solveur les a posées (y puis x),
 * pour que l'auto-flow du navigateur reproduise le même « étagement » que le
 * solveur a calculé, plutôt que l'ordre arbitraire du catalogue.
 */

import { profileForWidth } from './responsivePack';
import type { LayoutSnapshot, LayoutSnapshotEntry } from './snapshot';

export interface RenderSpace {
  availableWidth: number;
  gap?: number;
}

export function rectToGridColumn(rect: LayoutSnapshotEntry, space: RenderSpace): string {
  if (space.availableWidth <= 0) return '1 / -1';
  const profile = profileForWidth(space.availableWidth);
  const gap = space.gap ?? profile.gap;
  const colCount = profile.cols;
  const colWidth = (space.availableWidth - (colCount - 1) * gap) / colCount;
  const unit = colWidth + gap;
  const colStart = Math.min(colCount, Math.max(1, Math.round(rect.x / unit) + 1));
  const colSpan = Math.min(colCount - colStart + 1, Math.max(1, Math.round(rect.width / unit)));
  return `${colStart} / ${colStart + colSpan}`;
}

/** Ordonne des ids selon le placement du solveur (y puis x) — DOM order = shelf order. */
export function orderForGrid(ids: readonly string[], snapshot: LayoutSnapshot): string[] {
  return [...ids].sort((a, b) => {
    const ea = snapshot.get(a);
    const eb = snapshot.get(b);
    if (!ea || !eb) return 0;
    return ea.y - eb.y || ea.x - eb.x;
  });
}
