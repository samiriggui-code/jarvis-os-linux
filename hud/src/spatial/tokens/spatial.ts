/**
 * Tokens spatiaux — mouvement/parallaxe uniquement.
 * Scindé de l'ancien `materials.ts` : le matériau Glass (material/elevation/
 * radius/space/color) a déménagé dans `visual/glass/tokens.ts`. Ce fichier ne
 * garde que ce qui n'a rien à voir avec le verre — `SpatialWindow` (parallax)
 * et les presets de ressort Framer Motion (`spring`).
 */

export const spatialMotionTokens = {
  parallax: {
    maxRotateDeg: 3.2,
    maxTranslatePx: 6,
    lightTravel: 42,
  },

  spring: {
    appear: { type: 'spring' as const, stiffness: 280, damping: 28, mass: 0.85 },
    focus: { type: 'spring' as const, stiffness: 340, damping: 26, mass: 0.7 },
    press: { type: 'spring' as const, stiffness: 520, damping: 32, mass: 0.55 },
    float: { type: 'spring' as const, stiffness: 120, damping: 22, mass: 1.1 },
  },
} as const;
