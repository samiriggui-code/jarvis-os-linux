import React, { useCallback, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { glassLevelFor, tokens, type GlassLevel } from '../../ui/tokens';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';

/**
 * Brique de base du Glass System.
 * Light|night via SpatialTheme — fill densifié + `color` héritée (texte lisible).
 */

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  level?: GlassLevel;
  radius?: keyof typeof tokens.radius;
  padding?: keyof typeof tokens.space | 0;
  fill?: boolean;
  children?: ReactNode;
}

export function GlassPanel({
  level = 'regular',
  radius = 'lg',
  padding = 'md',
  fill = false,
  style,
  children,
  onMouseMove,
  ...rest
}: GlassPanelProps) {
  const theme = useSpatialTheme();
  const spec = glassLevelFor(theme.mode)[level];
  const ref = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (spec.glare && ref.current) {
        const rect = ref.current.getBoundingClientRect();
        ref.current.style.setProperty('--glass-glare-x', `${e.clientX - rect.left}px`);
        ref.current.style.setProperty('--glass-glare-y', `${e.clientY - rect.top}px`);
      }
      onMouseMove?.(e);
    },
    [spec.glare, onMouseMove],
  );

  const glareOpacity = theme.mode === 'light' ? 0.1 : 0.16;

  const base: CSSProperties = {
    position: 'relative',
    background: spec.background,
    border: spec.border,
    backdropFilter: spec.backdropFilter,
    WebkitBackdropFilter: spec.backdropFilter,
    boxShadow: spec.boxShadow,
    borderRadius: tokens.radius[radius],
    padding: padding === 0 ? 0 : tokens.space[padding],
    boxSizing: 'border-box',
    height: fill ? '100%' : undefined,
    color: theme.text,
    transition: 'border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, color 0.25s ease',
    ...style,
  };

  return (
    <div
      ref={ref}
      style={base}
      data-glass-level={level}
      data-spatial-mode={theme.mode}
      onMouseMove={handleMouseMove}
      {...rest}
    >
      {children}
      {spec.glare ? (
        <div
          aria-hidden
          className="glass-glare"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            opacity: 0,
            background: `radial-gradient(circle 140px at var(--glass-glare-x, 50%) var(--glass-glare-y, 50%), rgba(255,255,255,${glareOpacity}), transparent 70%)`,
            mixBlendMode: theme.mode === 'light' ? 'soft-light' : 'overlay',
          }}
        />
      ) : null}
    </div>
  );
}

export default GlassPanel;
