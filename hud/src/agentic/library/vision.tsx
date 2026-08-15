/**
 * Shell Vision pour briques agentic — GlassSurface spatial + typo SF.
 * Fonctionne hors lab grâce au défaut night de SpatialThemeContext.
 */
import React, { type ReactNode } from 'react';
import { GlassSurface, GlassButton, type GlassMaterial } from '../../visual/glass';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';

export { GlassButton as VisionButton };

const SF =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", sans-serif';

export function useVisionText() {
  const theme = useSpatialTheme();
  return {
    theme,
    title: {
      fontFamily: SF,
      fontSize: 16,
      fontWeight: 600,
      letterSpacing: '-0.02em',
      color: theme.text,
      margin: 0,
    } as React.CSSProperties,
    body: {
      fontFamily: SF,
      fontSize: 13,
      lineHeight: 1.45,
      color: theme.textMuted,
      margin: 0,
    } as React.CSSProperties,
    caption: {
      fontFamily: SF,
      fontSize: 11,
      letterSpacing: '0.02em',
      color: theme.textMuted,
      margin: 0,
    } as React.CSSProperties,
    mono: {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
      color: theme.text,
    } as React.CSSProperties,
  };
}

export function VisionPane({
  children,
  material = 'thin',
  padding = 'md',
  style,
}: {
  children: ReactNode;
  material?: GlassMaterial;
  padding?: 'sm' | 'md' | 'lg' | 0;
  style?: React.CSSProperties;
}) {
  return (
    <GlassSurface
      material={material}
      elevation="elevated"
      radius="lg"
      padding={padding}
      style={{ height: 'auto', boxSizing: 'border-box', ...style }}
    >
      {children}
    </GlassSurface>
  );
}
