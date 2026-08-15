/**
 * Graph3D — primitive Agentic UI.
 * Layout orbe = stack vendor jarvis-neural-architecture (Architecture3DView).
 */
import { useMemo, type CSSProperties } from 'react';
import { tokens } from '../../../ui/tokens';
import { Architecture3DView } from './architecture3d/Architecture3DView';
import { GraphErrorBoundary } from './GraphErrorBoundary';
import { Graph3DScene } from './Graph3DScene';
import { Canvas } from '@react-three/fiber';
import { getDeviceProfile } from '../../../ui/core/device';
import type { Graph3DModel, GraphFocusAnchor, GraphLayoutId, GraphLevel } from './types';

export interface Graph3DProps {
  model: Graph3DModel;
  layout?: GraphLayoutId;
  level?: GraphLevel;
  focus?: string | null;
  onFocusChange?: (id: string | null) => void;
  particleCount?: number;
  showEdges?: boolean;
  showDecorativeLinks?: boolean;
  showLabels?: boolean;
  projectionBase?: boolean;
  dpr?: number;
  className?: string;
  style?: CSSProperties;
  /** Contrôles DEV presentation L0↔L1 (orb layout). */
  presentationDebug?: boolean;
  /** @deprecated orb layout n’utilise plus le projecteur écran */
  onFocusAnchor?: (anchor: GraphFocusAnchor | null) => void;
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function Graph3D({
  model,
  layout = 'orb',
  level = model.level ?? 'global',
  focus = model.focus ?? null,
  onFocusChange,
  particleCount,
  showEdges = true,
  showDecorativeLinks = false,
  showLabels = true,
  projectionBase = true,
  dpr,
  className,
  style,
  presentationDebug = false,
}: Graph3DProps) {
  const webgl = useMemo(() => hasWebGL(), []);
  const resolvedDpr = dpr ?? getDeviceProfile().dpr;
  const focusId = focus ?? null;

  if (!webgl) {
    return (
      <div
        className={className}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 16,
          color: tokens.color.textMuted,
          fontFamily: tokens.font.body,
          fontSize: 13,
          ...style,
        }}
        data-graph3d
      >
        <div>WebGL indisponible — vue 2D.</div>
        {model.nodes.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onFocusChange?.(n.id)}
            style={{
              textAlign: 'left',
              background: 'transparent',
              color: focusId === n.id ? tokens.color.text : tokens.color.textMuted,
              border: `1px solid ${tokens.color.border}`,
              padding: '6px 10px',
              cursor: 'pointer',
              fontFamily: tokens.font.body,
            }}
          >
            {n.label}
            {n.caption ? ` — ${n.caption}` : ''}
          </button>
        ))}
      </div>
    );
  }

  if (layout === 'orb') {
    return (
      <GraphErrorBoundary>
        <Architecture3DView
          model={model}
          focus={focusId}
          onFocusChange={onFocusChange}
          presentationDebug={presentationDebug}
          className={className}
          style={style}
        />
      </GraphErrorBoundary>
    );
  }

  return (
    <div
      className={className}
      data-graph3d
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0, ...style }}
    >
      <GraphErrorBoundary>
        <Canvas
          flat
          dpr={resolvedDpr}
          gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
          camera={{ position: [0, 0.55, 6.4], fov: 40, near: 0.1, far: 40 }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
          onPointerMissed={() => onFocusChange?.(null)}
        >
          <Graph3DScene
            model={model}
            layout={layout}
            level={level}
            focusId={focusId}
            onFocus={(id) => onFocusChange?.(id)}
            particleCount={particleCount}
            showEdges={showEdges}
            showDecorativeLinks={showDecorativeLinks}
            showLabels={showLabels}
            projectionBase={projectionBase}
          />
        </Canvas>
      </GraphErrorBoundary>
    </div>
  );
}

export default Graph3D;
