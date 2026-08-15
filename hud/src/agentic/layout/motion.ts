/**
 * Motion / reflow — une seule « matière » HUD qui se recomposée.
 * Springs partagés : layout + opacity. Pas de pops isolés.
 */

export const HUD_LAYOUT_SPRING = {
  type: 'spring' as const,
  stiffness: 280,
  damping: 32,
  mass: 0.9,
};

export const HUD_LAYOUT_SPRING_SOFT = {
  type: 'spring' as const,
  stiffness: 220,
  damping: 34,
  mass: 1,
};

export const HUD_FADE = {
  duration: 0.38,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

/** Transition unifiée layout + fade — à coller sur sections & tiles. */
export const hudSpatialTransition = {
  layout: HUD_LAYOUT_SPRING,
  opacity: HUD_FADE,
  height: HUD_LAYOUT_SPRING_SOFT,
  width: HUD_LAYOUT_SPRING,
};

// `SpatialPriority`/`allocateMetricSpans` ont déménagé dans `./priority.ts`
// (logique de priorité du Layout Engine — n'a rien à faire dans les presets
// de transition Framer Motion de ce fichier).
