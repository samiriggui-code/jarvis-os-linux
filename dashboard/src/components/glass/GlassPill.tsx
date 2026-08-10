import { type CSSProperties, type ReactNode } from 'react';
import { tokens } from '../../ui/tokens';

export type GlassPillTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

export interface GlassPillProps {
  tone?: GlassPillTone;
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}

const TONE_COLOR: Record<GlassPillTone, string> = {
  accent: tokens.color.accent,
  success: tokens.color.success,
  warning: tokens.color.warning,
  danger: tokens.color.danger,
  neutral: tokens.color.textMuted,
};

function withAlpha(rgb: string, alpha: number): string {
  return rgb.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
}

/** Petit badge/étiquette de statut — pour ServiceHub, StatusBadge, tags. */
export function GlassPill({ tone = 'neutral', dot = false, icon, children, style }: GlassPillProps) {
  const color = TONE_COLOR[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: tokens.radius.pill,
        background: withAlpha(color, 0.1),
        border: `1px solid ${withAlpha(color, 0.3)}`,
        fontFamily: tokens.font.mono,
        fontSize: 9,
        letterSpacing: '0.06em',
        color,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot ? (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 6px ${withAlpha(color, 0.8)}`,
            flexShrink: 0,
          }}
        />
      ) : null}
      {icon}
      {children}
    </span>
  );
}

export default GlassPill;
