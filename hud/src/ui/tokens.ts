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

const blur = (px: number, sat = 160) =>
  `blur(${px}px) saturate(${sat}%)`;

/**
 * Ombres §8.19.4 — douce, grande diffusion, faible opacité, léger décalage.
 * Pas de glow gaming `0 0 20px black`.
 */
const softShadow = (mode: 'night' | 'light', elev: 'low' | 'mid' | 'high') => {
  if (mode === 'night') {
    if (elev === 'low') return '0 10px 36px -16px rgba(0,0,0,0.32), 0 2px 8px -4px rgba(0,0,0,0.18)';
    if (elev === 'mid') return '0 18px 52px -22px rgba(0,0,0,0.38), 0 4px 14px -6px rgba(0,0,0,0.2)';
    return '0 24px 64px -26px rgba(0,0,0,0.42), 0 6px 18px -8px rgba(0,0,0,0.22)';
  }
  if (elev === 'low') return '0 12px 40px -18px rgba(40,48,70,0.12), 0 2px 8px -4px rgba(40,48,70,0.06)';
  if (elev === 'mid') return '0 20px 56px -24px rgba(40,48,70,0.14), 0 4px 14px -6px rgba(40,48,70,0.07)';
  return '0 28px 72px -28px rgba(40,48,70,0.16), 0 6px 18px -8px rgba(40,48,70,0.08)';
};

/** Thin / Regular / Thick (§8.19.2) → subtle / regular / strong. floating = elevated regular. */
const glassLevelNight: Record<GlassLevel, GlassSpec> = {
  subtle: {
    background: glassFill(0.055, 0.028, 0.01),
    border: `0.5px solid rgba(${raw.paper100}, 0.1)`,
    backdropFilter: blur(22, 135),
    boxShadow: softShadow('night', 'low'),
    glare: false,
    sheen: false,
  },
  regular: {
    background: glassFill(0.085, 0.038, 0.014),
    border: `0.5px solid rgba(${raw.paper100}, 0.14)`,
    backdropFilter: blur(30, 148),
    boxShadow: softShadow('night', 'mid'),
    glare: false,
    sheen: true,
  },
  strong: {
    background: glassFill(0.11, 0.05, 0.02),
    border: `0.5px solid rgba(${raw.paper100}, 0.18)`,
    backdropFilter: blur(38, 152),
    boxShadow: softShadow('night', 'high'),
    glare: false,
    sheen: true,
  },
  floating: {
    background: glassFill(0.095, 0.042, 0.016),
    border: `0.5px solid rgba(${raw.paper100}, 0.16)`,
    backdropFilter: blur(34, 150),
    boxShadow: softShadow('night', 'mid'),
    glare: false,
    sheen: true,
  },
};

/** Light = frost translucide — laisse lire le contexte derrière (§8.19.1). */
const glassLevelLight: Record<GlassLevel, GlassSpec> = {
  subtle: {
    background: glassFill(0.22, 0.14, 0.09),
    border: '0.5px solid rgba(255, 255, 255, 0.38)',
    backdropFilter: blur(26, 140),
    boxShadow: softShadow('light', 'low'),
    glare: false,
    sheen: false,
  },
  regular: {
    background: glassFill(0.28, 0.17, 0.11),
    border: '0.5px solid rgba(255, 255, 255, 0.42)',
    backdropFilter: blur(32, 148),
    boxShadow: softShadow('light', 'mid'),
    glare: false,
    sheen: true,
  },
  strong: {
    background: glassFill(0.36, 0.24, 0.15),
    border: '0.5px solid rgba(255, 255, 255, 0.48)',
    backdropFilter: blur(38, 152),
    boxShadow: softShadow('light', 'high'),
    glare: false,
    sheen: true,
  },
  floating: {
    background: glassFill(0.3, 0.19, 0.12),
    border: '0.5px solid rgba(255, 255, 255, 0.44)',
    backdropFilter: blur(34, 148),
    boxShadow: softShadow('light', 'mid'),
    glare: false,
    sheen: true,
  },
};

/** Vibrancy §8.19.7 — hiérarchie lisible sur Glass, pas blanc plat. */
export const vibrancy = {
  primary: 'var(--jv-text, rgba(255, 255, 255, 0.92))',
  secondary: 'var(--jv-text-muted, rgba(255, 255, 255, 0.55))',
  tertiary: 'rgba(255, 255, 255, 0.38)',
  inactive: 'rgba(255, 255, 255, 0.28)',
} as const;

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
