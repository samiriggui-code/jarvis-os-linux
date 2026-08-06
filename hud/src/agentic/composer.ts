/**
 * Composeur — du document de surface au placement à l'écran.
 *
 * L'agent exprime une **intention** de placement (`region`, `size`), jamais une
 * position. Le HUD reste seul propriétaire du pixel (§P3) : c'est ce qui rend
 * Hermes portable — il ignore la géométrie, les tailles réelles et le CSS, donc
 * on peut redessiner le HUD sans toucher à l'agent.
 *
 * Ce module traduit ces intentions en ordre et en largeur, pour une fenêtre
 * d'app. Il ne décide rien d'autre.
 */

import type { Region, Size, SurfaceComponent } from './protocol/surface';

/**
 * Ordre de lecture des régions dans une fenêtre.
 *
 * Une fenêtre d'app n'a pas les sept zones du HUD complet : elle est une
 * colonne. On y projette donc les régions dans l'ordre où l'œil les attend —
 * le fond d'abord, l'entête ensuite, le corps, puis le pied. `overlay` passe
 * en dernier pour se superposer au reste.
 */
const REGION_ORDER: Record<Region, number> = {
  backdrop: 0,
  top: 1,
  left: 2,
  center: 3,
  right: 4,
  bottom: 5,
  overlay: 6,
};

/** Largeur relative, exprimée en fraction de la fenêtre. */
const SIZE_BASIS: Record<Size, string> = {
  compact: '33%',
  normal: '50%',
  wide: '100%',
  fill: '100%',
};

export interface PlacedNode {
  id: string;
  node: SurfaceComponent;
  /** Style de la case, calculé — jamais fourni par l'agent. */
  style: React.CSSProperties;
}

/**
 * Ordonne et dimensionne les composants racine.
 *
 * Le tri est **stable à priorité égale** : deux composants de même région
 * gardent l'ordre où l'agent les a listés. Sans ça, un delta qui touche l'un
 * pourrait réordonner l'autre à l'écran, ce qui se verrait comme un saut.
 */
export const place = (
  roots: readonly string[],
  components: Record<string, SurfaceComponent>,
): PlacedNode[] => {
  const entries = roots
    .map((id, index) => ({ id, node: components[id], index }))
    .filter((e): e is { id: string; node: SurfaceComponent; index: number } => Boolean(e.node));

  entries.sort((a, b) => {
    const ra = REGION_ORDER[a.node.region] ?? REGION_ORDER.center;
    const rb = REGION_ORDER[b.node.region] ?? REGION_ORDER.center;
    return ra !== rb ? ra - rb : a.index - b.index;
  });

  return entries.map(({ id, node }) => {
    const basis = SIZE_BASIS[node.size] ?? SIZE_BASIS.normal;
    const isOverlay = node.region === 'overlay';
    const isBackdrop = node.region === 'backdrop';

    return {
      id,
      node,
      style: {
        // `fill` prend toute la hauteur restante ; les autres se contentent
        // de leur contenu, sinon un seul composant écraserait les suivants.
        flexBasis: basis,
        flexGrow: node.size === 'fill' ? 1 : 0,
        minWidth: 0,
        minHeight: 0,
        ...(isOverlay
          ? { position: 'absolute' as const, inset: 0, zIndex: 2, pointerEvents: 'none' as const }
          : null),
        ...(isBackdrop ? { position: 'absolute' as const, inset: 0, zIndex: 0 } : null),
      },
    };
  });
};
