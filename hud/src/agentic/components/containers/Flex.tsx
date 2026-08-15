/**
 * Stack / Row / Grid — wrappers flex/grid content-only. Utilisés à
 * l'intérieur du `renderContent` d'un nœud (ex. Vision scene), jamais comme
 * feuilles `LayoutNode` elles-mêmes — pas de ligne dans `CAPABILITIES_BY_KIND`.
 */
import type { CSSProperties, ReactNode } from 'react';

export interface StackProps {
  children: ReactNode;
  gap?: number;
  align?: CSSProperties['alignItems'];
  justify?: CSSProperties['justifyContent'];
  style?: CSSProperties;
}

export function Stack({ children, gap = 8, align = 'stretch', justify = 'flex-start', style }: StackProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, alignItems: align, justifyContent: justify, minWidth: 0, minHeight: 0, ...style }}>
      {children}
    </div>
  );
}

export function Row({ children, gap = 8, align = 'center', justify = 'flex-start', style }: StackProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', gap, alignItems: align, justifyContent: justify, minWidth: 0, minHeight: 0, ...style }}>
      {children}
    </div>
  );
}

export interface GridProps {
  children: ReactNode;
  columns?: number;
  gap?: number;
  style?: CSSProperties;
}

export function Grid({ children, columns = 2, gap = 8, style }: GridProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap,
        minWidth: 0,
        minHeight: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
