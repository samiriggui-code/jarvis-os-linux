/**
 * Tokens Glass — matériau JARVIS, un seul endroit pour régler tout le HUD.
 *
 * Relocalisé depuis `spatial/tokens/materials.ts` (le contenu spatial-motion
 * non lié au verre — `parallax`/`spring` — est resté dans
 * `spatial/tokens/spatial.ts`). Valeurs déjà réglées visuellement, non
 * réinventées ici.
 *
 * Deux vues sur les mêmes nombres :
 *  - `glassMaterialTokens` : le vocabulaire complet, déjà consommé par
 *    `GlassSurface` (`material` 4 valeurs, `elevation` 5 valeurs).
 *  - `glassTokens` : un regroupement pratique (blur/opacity/saturation/
 *    border/shadow/glow) demandé pour une vue d'ensemble simple — PAS un
 *    remplacement du vocabulaire complet, `material="thin"` et
 *    `elevation="focused"` restent atteignables.
 *
 * Littéraux UNIQUEMENT ici. Les composants consomment ces rôles.
 */

export type GlassMaterial = 'ultraThin' | 'thin' | 'regular' | 'thick';
export type SpatialElevation = 'background' | 'surface' | 'elevated' | 'floating' | 'focused';

export const glassMaterialTokens = {
  material: {
    ultraThin: {
      blurPx: 40,
      saturate: 200,
      brightness: 1.08,
      contrast: 1.04,
      fillTop: 0.045,
      fillMid: 0.02,
      fillBottom: 0.008,
      borderOpacity: 0.16,
      highlightOpacity: 0.28,
      shadowStrength: 0.42,
    },
    thin: {
      blurPx: 52,
      saturate: 210,
      brightness: 1.09,
      contrast: 1.05,
      fillTop: 0.065,
      fillMid: 0.03,
      fillBottom: 0.012,
      borderOpacity: 0.2,
      highlightOpacity: 0.32,
      shadowStrength: 0.5,
    },
    regular: {
      blurPx: 64,
      saturate: 220,
      brightness: 1.1,
      contrast: 1.06,
      fillTop: 0.09,
      fillMid: 0.04,
      fillBottom: 0.016,
      borderOpacity: 0.24,
      highlightOpacity: 0.36,
      shadowStrength: 0.58,
    },
    thick: {
      blurPx: 80,
      saturate: 230,
      brightness: 1.1,
      contrast: 1.07,
      fillTop: 0.12,
      fillMid: 0.055,
      fillBottom: 0.022,
      borderOpacity: 0.28,
      highlightOpacity: 0.4,
      shadowStrength: 0.66,
    },
  },

  elevation: {
    background: { z: 0, translateZ: 0, scale: 1, shadowMul: 0.35 },
    surface: { z: 1, translateZ: 8, scale: 1, shadowMul: 0.55 },
    elevated: { z: 2, translateZ: 18, scale: 1.01, shadowMul: 0.75 },
    floating: { z: 3, translateZ: 32, scale: 1.015, shadowMul: 0.9 },
    focused: { z: 4, translateZ: 48, scale: 1.025, shadowMul: 1.05 },
  },

  radius: {
    sm: 14,
    md: 20,
    lg: 28,
    xl: 36,
    pill: 999,
  },

  space: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 20,
    xl: 28,
  },

  light: {
    intensity: 0.18,
    radiusPx: 160,
  },

  color: {
    paper: '255, 255, 255',
    void: '#05060a',
    accent: '10, 132, 255',
    text: 'rgba(255,255,255,0.94)',
    textMuted: 'rgba(255,255,255,0.48)',
  },
} as const;

/**
 * Interface explicite (pas `typeof ... [GlassMaterial]`) : `glassMaterialTokens`
 * est `as const`, donc chaque champ a un type littéral étroit (ex.
 * `blurPx: 40 | 52 | 64 | 80`). `materialSpec()` doit pouvoir renvoyer un
 * variant calculé (boost light-mode) dont les champs sont des `number`
 * ordinaires — une interface structurelle large est le bon contrat, la table
 * `as const` reste une simple source de valeurs.
 */
export interface MaterialSpec {
  blurPx: number;
  saturate: number;
  brightness: number;
  contrast: number;
  fillTop: number;
  fillMid: number;
  fillBottom: number;
  borderOpacity: number;
  highlightOpacity: number;
  shadowStrength: number;
}

/**
 * Regroupement pratique — remap mécanique des nombres ci-dessus, aucune
 * valeur inventée. `blur`/`opacity`/`saturation` : ultraThin/regular/thick.
 * `shadow` : background/surface/elevated/floating (focused reste via le prop
 * `elevation` direct). `glow` : reprend les opacités déjà utilisées par
 * `glassShadows()` pour la couche glow/focus.
 */
export const glassTokens = {
  blur: {
    subtle: glassMaterialTokens.material.ultraThin.blurPx,
    standard: glassMaterialTokens.material.regular.blurPx,
    strong: glassMaterialTokens.material.thick.blurPx,
  },
  opacity: {
    subtle: glassMaterialTokens.material.ultraThin.fillMid,
    standard: glassMaterialTokens.material.regular.fillMid,
    strong: glassMaterialTokens.material.thick.fillMid,
  },
  saturation: {
    subtle: glassMaterialTokens.material.ultraThin.saturate,
    standard: glassMaterialTokens.material.regular.saturate,
  },
  border: {
    opacity: glassMaterialTokens.material.regular.borderOpacity,
    highlight: glassMaterialTokens.material.regular.highlightOpacity,
  },
  shadow: {
    ambient: glassMaterialTokens.elevation.background.shadowMul,
    elevation1: glassMaterialTokens.elevation.surface.shadowMul,
    elevation2: glassMaterialTokens.elevation.elevated.shadowMul,
    elevation3: glassMaterialTokens.elevation.floating.shadowMul,
  },
  glow: {
    subtle: 0.18,
    standard: 0.35,
  },
} as const;
