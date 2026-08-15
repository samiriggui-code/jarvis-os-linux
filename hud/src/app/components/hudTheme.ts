/** Thème chrome HUD — Vision (SF + accent thème). Couleurs = CSS vars light|night. */
import { tokens } from '../../ui/tokens';

export const ACCENT = tokens.color.accent;
export const MUTED = tokens.color.textMuted;
export const TEXT = tokens.color.text;
export const BORDER = tokens.color.border;
export const SUCCESS = tokens.color.success;
export const WARNING = tokens.color.warning;
export const DANGER = tokens.color.danger;
/** Display — SF Pro, tracking léger (plus de letter-spacing cyber). */
export const orbFont = {
  fontFamily: tokens.font.display,
  letterSpacing: '-0.02em',
  fontWeight: 600,
} as const;

export const monoFont = {
  fontFamily: tokens.font.mono,
  letterSpacing: '0.01em',
} as const;

export const bodyFont = {
  fontFamily: tokens.font.body,
  letterSpacing: '-0.01em',
} as const;

export const AI_STATE_COLOR = {
  idle: ACCENT,
  listening: SUCCESS,
  processing: DANGER,
  responding: ACCENT,
} as const;
