import React, { type ReactNode } from 'react';
import { GlassSurface, type GlassSurfaceProps } from './GlassSurface';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';

export type GlassCardProps = GlassSurfaceProps & {
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
};

export function GlassCard({ eyebrow, title, subtitle, children, ...rest }: GlassCardProps) {
  const theme = useSpatialTheme();
  return (
    <GlassSurface material={rest.material ?? 'regular'} elevation={rest.elevation ?? 'elevated'} {...rest}>
      {(eyebrow || title || subtitle) && (
        <div style={{ marginBottom: children ? 10 : 0 }}>
          {eyebrow ? (
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: theme.textMuted,
                marginBottom: 4,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          {title ? (
            <div style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>{title}</div>
          ) : null}
          {subtitle ? (
            <div style={{ fontSize: 12, marginTop: 4, color: theme.textMuted }}>{subtitle}</div>
          ) : null}
        </div>
      )}
      {children}
    </GlassSurface>
  );
}

export default GlassCard;
