import React, { useCallback, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { GlassSurface, type GlassSurfaceProps } from '../GlassSurface/GlassSurface';
import { spatialTokens, type SpatialElevation } from '../tokens/materials';
import { appearVariants } from '../motion/springs';
import { useSpatialTheme } from '../theme/SpatialTheme';

export type SpatialWindowProps = Omit<GlassSurfaceProps, 'elevation'> & {
  elevation?: SpatialElevation;
  parallax?: boolean;
  title?: ReactNode;
  subtitle?: ReactNode;
  appear?: boolean;
};

export function SpatialWindow({
  elevation = 'elevated',
  parallax = true,
  title,
  subtitle,
  appear = true,
  children,
  style,
  ...surfaceProps
}: SpatialWindowProps) {
  const theme = useSpatialTheme();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [shift, setShift] = useState({ x: 0, y: 0 });

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!parallax || !wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      const { maxTranslatePx } = spatialTokens.parallax;
      setShift({
        x: nx * maxTranslatePx,
        y: ny * maxTranslatePx,
      });
    },
    [parallax],
  );

  const onLeave = useCallback(() => {
    setShift({ x: 0, y: 0 });
  }, []);

  return (
    <div
      ref={wrapRef}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        position: 'relative',
        padding: spatialTokens.parallax.maxTranslatePx + 4,
        margin: -(spatialTokens.parallax.maxTranslatePx + 4),
      }}
    >
      <motion.div
        variants={appear ? appearVariants : undefined}
        initial={appear ? 'hidden' : false}
        animate={appear ? 'visible' : undefined}
        exit={appear ? 'exit' : undefined}
        style={{
          position: 'relative',
          left: shift.x,
          top: shift.y,
          transition: 'left 0.45s cubic-bezier(0.22, 1, 0.36, 1), top 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <GlassSurface elevation={elevation} dynamicLight style={style} {...surfaceProps}>
          {(title || subtitle) && (
            <div style={{ marginBottom: 12 }}>
              {title ? (
                <div
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
                    fontSize: 17,
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                    color: theme.text,
                  }}
                >
                  {title}
                </div>
              ) : null}
              {subtitle ? (
                <div style={{ marginTop: 4, fontSize: 13, color: theme.textMuted }}>{subtitle}</div>
              ) : null}
            </div>
          )}
          {children}
        </GlassSurface>
      </motion.div>
    </div>
  );
}

export default SpatialWindow;
