import { type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { glassLevel, tokens } from '../../ui/tokens';

export type GlassButtonTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

export interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: GlassButtonTone;
  active?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const TONE_COLOR: Record<GlassButtonTone, string> = {
  accent: tokens.color.accent,
  success: tokens.color.success,
  warning: tokens.color.warning,
  danger: tokens.color.danger,
  neutral: tokens.color.text,
};

function withAlpha(rgb: string, alpha: number): string {
  return rgb.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
}

export function GlassButton({ tone = 'accent', active = false, icon, children, style, className, disabled, ...rest }: GlassButtonProps) {
  const color = TONE_COLOR[tone];
  const spec = glassLevel.subtle;

  const base: CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.space.xs,
    fontFamily: tokens.font.mono,
    fontSize: 11,
    letterSpacing: '0.05em',
    color: active ? color : tokens.color.textMuted,
    background: active
      ? `linear-gradient(165deg, rgba(10,132,255,0.22) 0%, rgba(255,255,255,0.06) 100%)`
      : spec.background,
    border: `1px solid ${active ? withAlpha(color, 0.55) : 'rgba(255,255,255,0.18)'}`,
    borderRadius: tokens.radius.pill,
    padding: `${tokens.space.xs}px ${tokens.space.md}px`,
    backdropFilter: spec.backdropFilter,
    WebkitBackdropFilter: spec.backdropFilter,
    boxShadow: active
      ? `inset 0 1px 0 rgba(255,255,255,0.25), 0 0 20px -4px ${withAlpha(color, 0.45)}`
      : `inset 0 1px 0 rgba(255,255,255,0.14), 0 4px 16px -8px rgba(0,0,0,0.45)`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    ['--glass-btn-color' as string]: color,
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
