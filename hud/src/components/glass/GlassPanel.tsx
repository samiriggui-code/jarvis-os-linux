import React, { useCallback, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { glassLevelFor, tokens, type GlassLevel } from '../../ui/tokens';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';

/**
 * Brique Glass §8.19 — 4 couches conceptuelles visionOS :
 * BACKPLATE (matériau) → DEPTH (duplicate sombre) → UI (children) → COATING + edge highlight.
 * Ne pas empiler d’autres Glass par-dessus sans besoin (§8.19.14).
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
  const night = theme.mode === 'night';

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

  const glareOpacity = night ? 0.14 : 0.1;
  const r = tokens.radius[radius];

  const base: CSSProperties = {
    position: 'relative',
    background: spec.background,
    border: spec.border,
    backdropFilter: spec.backdropFilter,
    WebkitBackdropFilter: spec.backdropFilter,
    boxShadow: spec.boxShadow,
    borderRadius: r,
    padding: padding === 0 ? 0 : tokens.space[padding],
    boxSizing: 'border-box',
    height: fill ? '100%' : undefined,
    minHeight: fill ? 0 : undefined,
    color: theme.text,
    overflow: 'hidden',
    isolation: 'isolate',
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
      {/* 2. DEPTH — UI duplicate sombre (profondeur perçue) */}
      {spec.sheen ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            background: night
              ? 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, transparent 42%, rgba(0,0,0,0.12) 100%)'
              : 'linear-gradient(180deg, rgba(20,24,40,0.04) 0%, transparent 45%, rgba(20,24,40,0.06) 100%)',
            zIndex: 0,
          }}
        />
      ) : null}

      {/* 3. UI LAYER — `contents` si pas fill : les className flex du parent
          (TopBar, VoiceBar…) s’appliquent encore aux children. Sans ça, un
          wrapper opaque casse le layout et on ne voit plus Jarvis / métriques. */}
      <div
        style={
          fill
            ? {
                position: 'relative',
                zIndex: 1,
                height: '100%',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                width: '100%',
              }
            : {
                display: 'contents',
              }
        }
      >
        {children}
      </div>

      {/* 4. COATING + edge highlight (haut/gauche) */}
      {spec.sheen ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            zIndex: 2,
            background: night
              ? `
                linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 28%),
                linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 35%)
              `
              : `
                linear-gradient(135deg, rgba(255,255,255,0.55) 0%, transparent 32%),
                linear-gradient(180deg, rgba(255,255,255,0.28) 0%, transparent 38%)
              `,
            opacity: night ? 0.85 : 0.7,
            mixBlendMode: night ? 'soft-light' : 'overlay',
          }}
        />
      ) : null}

      {/* Edge highlight — lumière de surface, pas cadre continu */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          pointerEvents: 'none',
          zIndex: 3,
          boxShadow: night
            ? `inset 0.5px 0.5px 0 rgba(255,255,255,0.22), inset -0.5px -0.5px 0 rgba(0,0,0,0.25)`
            : `inset 0.5px 0.5px 0 rgba(255,255,255,0.75), inset -0.5px -0.5px 0 rgba(40,50,70,0.06)`,
        }}
      />

      {spec.glare ? (
        <div
          aria-hidden
          className="glass-glare"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            zIndex: 4,
            opacity: 0,
            background: `radial-gradient(circle 140px at var(--glass-glare-x, 50%) var(--glass-glare-y, 50%), rgba(255,255,255,${glareOpacity}), transparent 70%)`,
            mixBlendMode: night ? 'overlay' : 'soft-light',
          }}
        />
      ) : null}
    </div>
  );
}

export default GlassPanel;
