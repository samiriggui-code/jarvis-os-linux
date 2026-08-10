import React, { type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { glassLevelFor, tokens } from '../../ui/tokens';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';

export type GlassButtonTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

export interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: GlassButtonTone;
  active?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

/**
 * Bouton vitré. Hover/active = bordure + fill accent (pas de police bleue « pour lire »).
 * Texte = thème (clair = sombre, nuit = clair).
 */
export function GlassButton({
  tone = 'accent',
  active = false,
  icon,
  children,
  style,
  className,
  disabled,
  ...rest
}: GlassButtonProps) {
  const theme = useSpatialTheme();
  const spec = glassLevelFor(theme.mode).regular;
  const toneColor =
    tone === 'success'
      ? tokens.color.success
      : tone === 'warning'
        ? tokens.color.warning
        : tone === 'danger'
          ? tokens.color.danger
          : tone === 'neutral'
            ? theme.text
            : `rgb(${theme.accent})`;

  const idleBg =
    theme.mode === 'light' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.03)';
  const idleBorder =
    theme.mode === 'light' ? 'rgba(15,20,30,0.12)' : 'rgba(255,255,255,0.12)';

  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.space.xs,
    fontFamily: tokens.font.body,
    fontSize: 13,
    fontWeight: 560,
    letterSpacing: '-0.01em',
    color: active && tone !== 'neutral' ? toneColor : theme.text,
    background: active ? spec.background : idleBg,
    border: `1px solid ${active ? `rgba(${theme.accent}, 0.45)` : idleBorder}`,
    borderRadius: tokens.radius.pill,
    padding: `${tokens.space.xs}px ${tokens.space.md}px`,
    backdropFilter: spec.backdropFilter,
    WebkitBackdropFilter: spec.backdropFilter,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    ['--glass-btn-color' as string]: toneColor,
    transition: 'border-color 0.2s ease, background 0.2s ease, color 0.2s ease, transform 0.15s ease',
    ...style,
  };

  return (
    <button
      type="button"
      className={className ? `glass-btn ${className}` : 'glass-btn'}
      style={base}
      disabled={disabled}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export default GlassButton;
