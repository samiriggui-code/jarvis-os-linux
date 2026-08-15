/**
 * LayoutRuntime — glue de mémoïsation, PAS d'animation.
 *
 * CURRENT reste implicite (ce que Framer Motion a déjà rendu) ; TARGET est
 * l'artefact explicite produit ici (`LayoutSnapshot`, via `solve()`). Framer
 * anime le résultat, il ne décide jamais de la géométrie — voir
 * `sim/AgenticDemoStage.tsx` pour le `layout`/`layoutId` qui fait la
 * transition CURRENT → TARGET.
 *
 * L'appelant doit passer un `nodes` déjà mémoïsé (ex. `useMemo` sur
 * `sections` côté appelant) pour que la mémoïsation ici soit utile ; `solve()`
 * reste de toute façon trivial à recalculer (≤ 12 nœuds).
 */

import { useMemo } from 'react';
import type { LayoutNode } from './node';
import { solve, type AvailableSpace } from './solver';
import type { LayoutSnapshot } from './snapshot';

export function useLayoutSnapshot(nodes: readonly LayoutNode[], space: AvailableSpace): LayoutSnapshot {
  return useMemo(
    () => solve(nodes, space),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, space.availableWidth, space.availableHeight, space.gap],
  );
}

/** Ids visibles (tier ≠ 'hidden') — pour filtrer avant le `.map()` de rendu. */
export function visibleIds(snapshot: LayoutSnapshot): Set<string> {
  const out = new Set<string>();
  for (const [id, entry] of snapshot) {
    if (entry.visible) out.add(id);
  }
  return out;
}
