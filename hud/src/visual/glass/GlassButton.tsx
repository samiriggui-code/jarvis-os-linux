/**
 * Relocalisé depuis `spatial/GlassButton/GlassButton.tsx`. Pas une des 5
 * surfaces publiques du Glass System — conservé comme 6e export uniquement
 * pour que `agentic/library/vision.tsx`'s `VisionButton` (alias) continue de
 * fonctionner après la migration.
 */
import React, { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { glassMaterialTokens } from './tokens';
import { glassBackdrop, glassBorder, glassFill, glassShadows, materialSpec } from './internal/compute';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';

type NativeBtn = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'
>;

export type GlassButtonProps = NativeBtn & {
  tone?: 'neutral' | 'accent' | 'danger';
  icon?: ReactNode;
  children?: ReactNode;
};

export function GlassButton({
  tone = 'neutral',
  icon,
  children,
  disabled,
  style,
  ...rest
}: GlassButtonProps) {
  const theme = useSpatialTheme();
  const spec = materialSpec('thin', theme.mode);
  const paper = theme.paper;
  const accent = tone === 'accent' || tone === 'danger';
  const rgb =
    tone === 'danger' ? '255, 59, 48' : tone === 'accent' ? theme.accent : paper;

  return (
    <motion.button
      type="button"
      disabled={disabled}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '10px 18px',
        borderRadius: glassMaterialTokens.radius.pill,
        border: accent ? `1px solid rgba(${rgb}, 0.45)` : glassBorder(spec, paper),
        background: accent
          ? `linear-gradient(165deg, rgba(${rgb}, 0.28) 0%, rgba(${rgb}, 0.12) 100%)`
          : glassFill(spec, paper),
        backdropFilter: glassBackdrop(spec),
        WebkitBackdropFilter: glassBackdrop(spec),
        boxShadow: glassShadows(spec, 'elevated', {
          glow: tone === 'accent',
          paperRgb: paper,
          accentRgb: theme.accent,
          mode: theme.mode,
        }),
        color: theme.text,
        fontSize: 13,
        fontWeight: 560,
        letterSpacing: '-0.01em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        overflow: 'hidden',
        transition: 'box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease',
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, rgba(${paper}, 0.22) 0%, transparent 55%)`,
          pointerEvents: 'none',
          borderRadius: 'inherit',
        }}
      />
      {icon}
      <span style={{ position: 'relative' }}>{children}</span>
    </motion.button>
  );
}

export default GlassButton;
