import React, { useCallback, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { glassLevel, tokens, type GlassLevel } from '../../ui/tokens';

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
  const spec = glassLevel[level];
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

  const base: CSSProperties = {
    position: 'relative',
    isolation: 'isolate',
    overflow: 'hidden',
    background: spec.background,
    border: spec.border,
    backdropFilter: spec.backdropFilter,
    WebkitBackdropFilter: spec.backdropFilter,
    boxShadow: spec.boxShadow,
    borderRadius: tokens.radius[radius],
    padding: padding === 0 ? 0 : tokens.space[padding],
    boxSizing: 'border-box',
    height: fill ? '100%' : undefined,
    transition: 'border-color 0.35s ease, box-shadow 0.35s ease, transform 0.35s ease',
    ...style,
  };

  return (
    <div ref={ref} style={base} data-glass-level={level} onMouseMove={handleMouseMove} {...rest}>
      {spec.sheen ? (
        <div
          aria-hidden
          className="glass-sheen"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 28%, transparent 52%, rgba(0,0,0,0.06) 100%)',
            opacity: 0.9,
          }}
        />
      ) : null}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
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
            background:
              'radial-gradient(circle 180px at var(--glass-glare-x, 50%) var(--glass-glare-y, 50%), rgba(255,255,255,0.28), transparent 68%)',
            mixBlendMode: 'overlay',
          }}
        />
      ) : null}
    </div>
  );
}

export default GlassPanel;
