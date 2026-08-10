/**
 * Jetons HUD — langage Vision (aligné dashboard).
 * Littéraux UNIQUEMENT ici. Plus d’Orbitron / Share Tech / cyan piquant.
 */

const raw = {
  blue500: '10, 132, 255',
  blue300: '80, 160, 255',
  amber500: '255, 159, 28',
  red500: '255, 59, 48',
  green500: '52, 199, 89',

  neutral900: '8, 9, 11',
  neutral800: '14, 15, 18',
  neutral700: '22, 23, 27',

  paper100: '255, 255, 255',
} as const;

const SF_DISPLAY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const SF_TEXT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const SF_MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", "Segoe UI Mono", Menlo, monospace';

/**
 * Couleurs via CSS vars (`SpatialThemeProvider` → `--jv-*`).
 * Fallback = night. Light = texte sombre + surfaces plus denses — pas le blur.
 */
export const tokens = {
  color: {
    void: 'var(--jv-void, #08080a)',
    surface: 'var(--jv-surface, rgba(255, 255, 255, 0.05))',
    surfaceRaised: 'var(--jv-surface-raised, rgba(255, 255, 255, 0.09))',
    border: 'var(--jv-border, rgba(255, 255, 255, 0.18))',
    borderActive: `rgba(${raw.blue500}, 0.55)`,

    text: 'var(--jv-text, rgba(255, 255, 255, 0.92))',
    textMuted: 'var(--jv-text-muted, rgba(255, 255, 255, 0.45))',

    /** Accent visionOS — rgb via --jv-accent (clair = #0071E3, nuit = #0A84FF). */
    accent: 'var(--jv-accent, rgb(10, 132, 255))',
    accentSoft: 'rgba(var(--jv-accent-rgb), 0.14)',
    accentAlt: 'var(--jv-accent, rgb(10, 132, 255))',

    pending: `rgb(${raw.blue300})`,
    success: `rgb(${raw.green500})`,
    warning: `rgb(${raw.amber500})`,
    danger: `rgb(${raw.red500})`,
  },

  rgb: {
    accent: [10, 132, 255] as [number, number, number],
    accentAlt: [10, 132, 255] as [number, number, number],
    warning: [255, 159, 28] as [number, number, number],
    cold: [140, 140, 150] as [number, number, number],
  },

  radius: {
    sm: 10,
    md: 16,
    lg: 22,
    pill: 999,
  },

  space: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 20,
    xl: 28,
  },

  font: {
    display: SF_DISPLAY,
    mono: SF_MONO,
    body: SF_TEXT,
  },

  glass: 'blur(28px)',
} as const;

export type GlassLevel = 'subtle' | 'regular' | 'strong' | 'floating';

export interface GlassSpec {
  background: string;
  border: string;
  backdropFilter: string;
  boxShadow: string;
  glare: boolean;
  sheen?: boolean;
}

const glassFill = (top: number, mid: number, bottom: number) =>
  `linear-gradient(165deg, rgba(${raw.paper100}, ${top}) 0%, rgba(${raw.paper100}, ${mid}) 48%, rgba(${raw.paper100}, ${bottom}) 100%)`;

const blur = (px: number, sat = 210) =>
  `blur(${px}px) saturate(${sat}%) brightness(1.06)`;

const glassLevelNight: Record<GlassLevel, GlassSpec> = {
  subtle: {
    background: glassFill(0.09, 0.04, 0.015),
    border: `1px solid rgba(${raw.paper100}, 0.14)`,
    backdropFilter: blur(28, 195),
    boxShadow: [
      '0 4px 20px -6px rgba(0,0,0,0.45)',
      `inset 0 1px 0 rgba(${raw.paper100}, 0.18)`,
      `inset 0 0 0 1px rgba(${raw.paper100}, 0.04)`,
    ].join(', '),
    glare: false,
    sheen: true,
  },
  regular: {
    background: glassFill(0.12, 0.05, 0.02),
    border: `1px solid rgba(${raw.paper100}, 0.2)`,
    backdropFilter: blur(40, 210),
    boxShadow: [
      '0 12px 40px -12px rgba(0,0,0,0.55)',
      `inset 0 1px 0 rgba(${raw.paper100}, 0.26)`,
      `inset 0 -1px 0 rgba(0,0,0,0.2)`,
      `inset 0 0 0 1px rgba(${raw.paper100}, 0.05)`,
    ].join(', '),
    glare: false,
    sheen: true,
  },
  strong: {
    background: glassFill(0.16, 0.07, 0.03),
    border: `1px solid rgba(${raw.paper100}, 0.26)`,
    backdropFilter: blur(52, 220),
    boxShadow: [
      '0 20px 56px -16px rgba(0,0,0,0.62)',
      `inset 0 1px 0 rgba(${raw.paper100}, 0.32)`,
      `inset 0 -1px 0 rgba(0,0,0,0.22)`,
      `inset 0 0 0 1px rgba(${raw.paper100}, 0.06)`,
    ].join(', '),
    glare: false,
    sheen: true,
  },
  floating: {
    background: glassFill(0.14, 0.06, 0.025),
    border: `1px solid rgba(${raw.paper100}, 0.28)`,
    backdropFilter: blur(56, 225),
    boxShadow: [
      '0 28px 64px -20px rgba(0,0,0,0.7)',
      `0 0 40px -12px rgba(${raw.blue500}, 0.18)`,
      `inset 0 1px 0 rgba(${raw.paper100}, 0.34)`,
      `inset 0 -1px 0 rgba(0,0,0,0.25)`,
    ].join(', '),
    glare: true,
    sheen: true,
  },
};

/** Light = frost plus opaque + ombres douces — lisibilité du texte sombre. */
const glassLevelLight: Record<GlassLevel, GlassSpec> = {
  subtle: {
    background: glassFill(0.55, 0.42, 0.32),
    border: '1px solid rgba(15, 20, 30, 0.12)',
    backdropFilter: blur(36, 200),
    boxShadow: [
      '0 4px 18px -6px rgba(20, 40, 80, 0.18)',
      `inset 0 1px 0 rgba(${raw.paper100}, 0.7)`,
      'inset 0 0 0 1px rgba(15, 20, 30, 0.04)',
    ].join(', '),
    glare: false,
    sheen: true,
  },
  regular: {
    background: glassFill(0.62, 0.5, 0.38),
    border: '1px solid rgba(15, 20, 30, 0.14)',
    backdropFilter: blur(44, 210),
    boxShadow: [
      '0 12px 36px -12px rgba(20, 40, 80, 0.22)',
      `inset 0 1px 0 rgba(${raw.paper100}, 0.78)`,
      'inset 0 -1px 0 rgba(15, 20, 30, 0.06)',
    ].join(', '),
    glare: false,
    sheen: true,
  },
  strong: {
    background: glassFill(0.72, 0.58, 0.45),
    border: '1px solid rgba(15, 20, 30, 0.16)',
    backdropFilter: blur(52, 215),
    boxShadow: [
      '0 18px 48px -14px rgba(20, 40, 80, 0.26)',
      `inset 0 1px 0 rgba(${raw.paper100}, 0.85)`,
      'inset 0 -1px 0 rgba(15, 20, 30, 0.08)',
    ].join(', '),
    glare: false,
    sheen: true,
  },
  floating: {
    background: glassFill(0.68, 0.54, 0.42),
    border: '1px solid rgba(15, 20, 30, 0.16)',
    backdropFilter: blur(56, 220),
    boxShadow: [
      '0 24px 56px -18px rgba(20, 40, 80, 0.28)',
      `0 0 36px -12px rgba(${raw.blue500}, 0.12)`,
      `inset 0 1px 0 rgba(${raw.paper100}, 0.88)`,
    ].join(', '),
    glare: true,
    sheen: true,
  },
};

/** Alias night (rétrocompat). Préférer `glassLevelFor(mode)`. */
export const glassLevel = glassLevelNight;

export function glassLevelFor(mode: 'night' | 'light' = 'night'): Record<GlassLevel, GlassSpec> {
  return mode === 'light' ? glassLevelLight : glassLevelNight;
}

/** Alias legacy — les appels `glassFill(0.09,…)` dans d’anciens fichiers. */
export function glassFillCss(top: number, mid: number, bottom: number): string {
  return glassFill(top, mid, bottom);
}

/** Couleur d’un état de bloc. */
export const stateColor = (state: string): string => {
  switch (state) {
    case 'pending':
      return tokens.color.pending;
    case 'active':
      return tokens.color.accent;
    case 'success':
      return tokens.color.success;
    case 'error':
      return tokens.color.danger;
    default:
      return tokens.color.textMuted;
  }
};
