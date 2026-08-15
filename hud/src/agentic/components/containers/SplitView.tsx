/**
 * SplitView — deux volets côte à côte avec un ratio. Content-only (comme
 * Stack/Row/Grid) mais aussi utilisable comme contenu top-level d'un nœud
 * (ex. Vision scene : `SplitView(CameraPreview | Stack(...))`).
 */
import type { CSSProperties, ReactNode } from 'react';

export interface SplitViewProps {
  left: ReactNode;
  right: ReactNode;
  /** Fraction occupée par le volet gauche, 0–1. */
  ratio?: number;
  gap?: number;
  style?: CSSProperties;
}

export function SplitView({ left, right, ratio = 0.5, gap = 8, style }: SplitViewProps) {
  const leftPct = Math.min(0.9, Math.max(0.1, ratio)) * 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'row', gap, minWidth: 0, minHeight: 0, height: '100%', ...style }}>
      <div style={{ flex: `0 0 ${leftPct}%`, minWidth: 0, minHeight: 0 }}>{left}</div>
      <div style={{ flex: `0 0 ${100 - leftPct}%`, minWidth: 0, minHeight: 0 }}>{right}</div>
    </div>
  );
}

export default SplitView;
