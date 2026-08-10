import React, {
  useCallback,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { motion } from 'motion/react';
import {
  spatialTokens,
  type GlassMaterial,
  type SpatialElevation,
} from '../tokens/materials';
import {
  glassBackdrop,
  glassBorder,
  glassFill,
  glassShadows,
  materialSpec,
} from '../materials/compute';
import { spatialSprings } from '../motion/springs';
import { useSpatialTheme } from '../theme/SpatialTheme';

export type GlassSurfaceProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  material?: GlassMaterial;
  elevation?: SpatialElevation;
  intensity?: number;
  interactive?: boolean;
  dynamicLight?: boolean;
  focused?: boolean;
  glow?: boolean;
  radius?: keyof typeof spatialTokens.radius;
  padding?: keyof typeof spatialTokens.space | 0 | number;
  children?: ReactNode;
};

/**
 * Primitive verre — fill translucide + backdrop-filter.
 * Thème light|night via SpatialThemeProvider.
 */
export function GlassSurface({
  material = 'regular',
  elevation = 'surface',
  intensity = 1,
  interactive = false,
  dynamicLight = false,
  focused = false,
  glow = false,
  radius = 'lg',
  padding = 'md',
  style,
  children,
  onMouseMove,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  className,
  ...rest
}: GlassSurfaceProps) {
  const theme = useSpatialTheme();
  const ref = useRef<HTMLDivElement | null>(null);
  const spec = materialSpec(material, theme.mode);
  const paper = theme.paper;
  const pad =
    padding === 0
      ? 0
      : typeof padding === 'number'
        ? padding
        : spatialTokens.space[padding];

  const trackLight = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((dynamicLight || interactive) && ref.current) {
        const r = ref.current.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 100;
        const y = ((e.clientY - r.top) / r.height) * 100;
        ref.current.style.setProperty('--light-x', `${x}%`);
        ref.current.style.setProperty('--light-y', `${y}%`);
      }
      onMouseMove?.(e);
    },
    [dynamicLight, interactive, onMouseMove],
  );

  const base: CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: spatialTokens.radius[radius],
    padding: pad,
    background: glassFill(spec, paper),
    border: glassBorder(spec, paper),
    backdropFilter: glassBackdrop(spec),
    WebkitBackdropFilter: glassBackdrop(spec),
    boxShadow: glassShadows(spec, elevation, {
      glow: glow || focused,
      focused,
      paperRgb: paper,
      accentRgb: theme.accent,
      mode: theme.mode,
    }),
    color: theme.text,
    transition: 'box-shadow 0.35s ease, border-color 0.35s ease, background 0.35s ease, color 0.25s ease',
    ...style,
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      style={base}
      data-spatial-material={material}
      data-spatial-elevation={elevation}
      data-spatial-mode={theme.mode}
      onMouseMove={trackLight}
      onPointerDown={(e) => {
        if (interactive) e.currentTarget.style.setProperty('--press', '1');
        onPointerDown?.(e as unknown as React.PointerEvent<HTMLDivElement>);
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.setProperty('--press', '0');
        onPointerUp?.(e as unknown as React.PointerEvent<HTMLDivElement>);
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.setProperty('--press', '0');
        onPointerLeave?.(e as unknown as React.PointerEvent<HTMLDivElement>);
      }}
      whileHover={interactive ? { opacity: 1, transition: spatialSprings.focus } : undefined}
      {...(rest as Record<string, unknown>)}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          pointerEvents: 'none',
          background: `radial-gradient(circle ${spatialTokens.light.radiusPx}px at var(--light-x, 50%) var(--light-y, 28%), rgba(${paper}, ${spatialTokens.light.intensity * intensity}), transparent 70%)`,
          mixBlendMode: theme.mode === 'light' ? 'soft-light' : 'overlay',
          opacity: dynamicLight || interactive ? 1 : 0.55,
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: '42%',
          borderRadius: 'inherit',
          pointerEvents: 'none',
          background: `linear-gradient(180deg, rgba(${paper}, ${spec.highlightOpacity * 0.55}) 0%, transparent 100%)`,
          opacity: 0.7,
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </motion.div>
  );
}

export default GlassSurface;
