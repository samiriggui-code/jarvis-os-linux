/**
 * Jetons de @jarvis/ui — dashboard admin.
 *
 * Thème SOMBRE glassmorphism premium — verre très transparent, blur fort,
 * reflets bord haut + saturation élevée (effet Liquid Glass / visionOS).
 */

const raw = {
  blue500: '10, 132, 255',
  amber500: '255, 159, 28',
  red500: '255, 59, 48',
  green500: '52, 199, 89',
  paper100: '255, 255, 255',
} as const;

/** Dégradé vitreux — plus transparent au centre, lumière en haut. */
const glassFill = (top: number, mid: number, bottom: number) =>
  `linear-gradient(165deg, rgba(${raw.paper100}, ${top}) 0%, rgba(${raw.paper100}, ${mid}) 48%, rgba(${raw.paper100}, ${bottom}) 100%)`;

/** Blur + saturation premium (brightness léger = reflet « vitrine »). */
const blur = (px: number, sat = 210) =>
  `blur(${px}px) saturate(${sat}%) brightness(1.06)`;

export const tokens = {
  color: {
    void: '#08080a',
    surface: `rgba(${raw.paper100}, 0.05)`,
    surfaceRaised: `rgba(${raw.paper100}, 0.09)`,
    border: `rgba(${raw.paper100}, 0.18)`,
    borderActive: `rgba(${raw.blue500}, 0.55)`,

    text: `rgba(${raw.paper100}, 0.94)`,
    textMuted: `rgba(${raw.paper100}, 0.48)`,

    accent: `rgb(${raw.blue500})`,
    accentSoft: `rgba(${raw.blue500}, 0.16)`,
    accentAlt: `rgb(${raw.blue500})`,

    pending: `rgb(${raw.blue500})`,
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
    sm: 14,
    md: 18,
    lg: 26,
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
    display: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, sans-serif',
    mono: '"SF Mono", "JetBrains Mono", monospace',
    body: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif',
  },

  glass: 'blur(40px)',
} as const;

export type GlassLevel = 'subtle' | 'regular' | 'strong' | 'floating';

export interface GlassSpec {
  background: string;
  border: string;
  backdropFilter: string;
  boxShadow: string;
  /** Reflet interactif souris (niveau floating). */
  glare: boolean;
  /** Reflet statique bord haut (tous niveaux). */
  sheen: boolean;
}

export const glassLevel: Record<GlassLevel, GlassSpec> = {
  subtle: {
    background: glassFill(0.09, 0.04, 0.015),
    border: `1px solid rgba(${raw.paper100}, 0.16)`,
    backdropFilter: blur(28, 195),
    boxShadow: [
      '0 4px 20px -6px rgba(0,0,0,0.5)',
      `inset 0 1px 0 rgba(${raw.paper100}, 0.20)`,
      `inset 0 0 0 1px rgba(${raw.paper100}, 0.05)`,
    ].join(', '),
    glare: false,
    sheen: true,
  },
  regular: {
    background: glassFill(0.12, 0.05, 0.02),
    border: `1px solid rgba(${raw.paper100}, 0.22)`,
    backdropFilter: blur(44, 215),
    boxShadow: [
      '0 16px 48px -16px rgba(0,0,0,0.62)',
      '0 4px 16px -8px rgba(0,0,0,0.35)',
      `inset 0 1px 0 rgba(${raw.paper100}, 0.28)`,
      `inset 0 -1px 0 rgba(0,0,0,0.22)`,
      `inset 0 0 0 1px rgba(${raw.paper100}, 0.07)`,
    ].join(', '),
    glare: false,
    sheen: true,
  },
  strong: {
    background: glassFill(0.14, 0.07, 0.03),
    border: `1px solid rgba(${raw.paper100}, 0.26)`,
    backdropFilter: blur(52, 220),
    boxShadow: [
      '0 24px 64px -18px rgba(0,0,0,0.72)',
      '0 8px 24px -10px rgba(0,0,0,0.45)',
      `inset 0 2px 0 rgba(${raw.paper100}, 0.32)`,
      `inset 0 -2px 0 rgba(0,0,0,0.28)`,
      `inset 0 0 0 1px rgba(${raw.paper100}, 0.10)`,
    ].join(', '),
    glare: false,
    sheen: true,
  },
  floating: {
    background: glassFill(0.13, 0.05, 0.018),
    border: `1px solid rgba(${raw.paper100}, 0.28)`,
    backdropFilter: blur(64, 225),
    boxShadow: [
      '0 32px 80px -20px rgba(0,0,0,0.78)',
      '0 12px 36px -12px rgba(0,0,0,0.55)',
      `inset 0 2px 0 rgba(${raw.paper100}, 0.35)`,
      `inset 0 -2px 4px rgba(0,0,0,0.30)`,
      `inset 0 0 0 1px rgba(${raw.paper100}, 0.12)`,
    ].join(', '),
    glare: true,
    sheen: true,
  },
};

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
