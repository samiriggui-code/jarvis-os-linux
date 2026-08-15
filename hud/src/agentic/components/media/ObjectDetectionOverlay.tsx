/** Primitive générique — pas spécifique au pipeline vision. Boîtes+labels en % au-dessus de `children`. */
import type { ReactNode } from 'react';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface DetectionBox {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
}

export interface ObjectDetectionOverlayProps {
  boxes: DetectionBox[];
  children: ReactNode;
}

export function ObjectDetectionOverlay({ boxes, children }: ObjectDetectionOverlayProps) {
  const theme = useSpatialTheme();
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {children}
      {boxes.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: `${b.width}%`,
            height: `${b.height}%`,
            border: `1.5px solid rgba(${theme.accent}, 0.9)`,
            borderRadius: 4,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: -18,
              left: 0,
              fontSize: 10,
              color: theme.text,
              background: `rgba(${theme.accent}, 0.85)`,
              padding: '1px 5px',
              borderRadius: 3,
              whiteSpace: 'nowrap',
            }}
          >
            {b.label}
            {b.confidence !== undefined ? ` ${Math.round(b.confidence * 100)}%` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export default ObjectDetectionOverlay;
