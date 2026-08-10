/**
 * Tokens spatiaux — langage visionOS / Vision Pro (JARVIS).
 * Littéraux UNIQUEMENT ici. Les composants consomment ces rôles.
 */

export type GlassMaterial = 'ultraThin' | 'thin' | 'regular' | 'thick';
export type SpatialElevation = 'background' | 'surface' | 'elevated' | 'floating' | 'focused';

export const spatialTokens = {
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

  parallax: {
    maxRotateDeg: 3.2,
    maxTranslatePx: 6,
    lightTravel: 42,
  },

  light: {
    intensity: 0.18,
    radiusPx: 160,
  },

  spring: {
    appear: { type: 'spring' as const, stiffness: 280, damping: 28, mass: 0.85 },
    focus: { type: 'spring' as const, stiffness: 340, damping: 26, mass: 0.7 },
    press: { type: 'spring' as const, stiffness: 520, damping: 32, mass: 0.55 },
    float: { type: 'spring' as const, stiffness: 120, damping: 22, mass: 1.1 },
  },

  color: {
    paper: '255, 255, 255',
    void: '#05060a',
    accent: '10, 132, 255',
    text: 'rgba(255,255,255,0.94)',
    textMuted: 'rgba(255,255,255,0.48)',
  },
} as const;

export type MaterialSpec = (typeof spatialTokens.material)[GlassMaterial];
