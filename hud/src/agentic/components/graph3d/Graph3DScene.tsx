import { useEffect, useMemo } from 'react';
import { CameraController } from './camera/CameraController';
import { FocusProjector } from './camera/FocusProjector';
import { visibleNodeIds } from './focus';
import { layoutPositions } from './layouts';
import { BG, glowTexture } from './theme';
import type { Graph3DModel, GraphFocusAnchor, GraphLayoutId, GraphLevel } from './types';
// Couches = ./layers/* ; camera/focus/layouts = même dossier que ce fichier.
import { DecorativeLinks } from './layers/DecorativeLinks';
import { LabelsLayer } from './layers/LabelsLayer';
import { ProjectionBase } from './layers/ProjectionBase';
import { SemanticEdges } from './layers/SemanticEdges';
import { SemanticNodes } from './layers/SemanticNodes';

export interface Graph3DSceneProps {
  model: Graph3DModel;
  layout: GraphLayoutId;
  level: GraphLevel;
  focusId: string | null;
  onFocus: (id: string | null) => void;
  particleCount?: number;
  showEdges?: boolean;
  showDecorativeLinks?: boolean;
  showLabels?: boolean;
  projectionBase?: boolean;
  onFocusAnchor?: (anchor: GraphFocusAnchor | null) => void;
}

export function Graph3DScene({
  model,
  layout,
  level,
  focusId,
  onFocus,
  particleCount,
  showEdges = true,
  showDecorativeLinks = false,
  showLabels = true,
  projectionBase = true,
  onFocusAnchor,
}: Graph3DSceneProps) {
  const positions = useMemo(() => layoutPositions(model, layout), [model, layout]);
  const visible = useMemo(() => visibleNodeIds(model, level, focusId), [model, level, focusId]);
  const glowMap = useMemo(() => glowTexture(), []);

  useEffect(() => () => glowMap.dispose(), [glowMap]);

  const focusPos = focusId ? positions[focusId] ?? null : null;

  return (
    <group>
      <color attach="background" args={[BG]} />
      <ambientLight intensity={0.35} />
      <fog attach="fog" args={[BG, 9, 20]} />
      {projectionBase ? <ProjectionBase /> : null}

      <group>
        {showDecorativeLinks ? (
          <DecorativeLinks positions={positions} enabled glowMap={glowMap} />
        ) : null}
        {showEdges ? (
          <SemanticEdges
            edges={model.edges}
            positions={positions}
            visible={visible}
            focusId={focusId}
            glowMap={glowMap}
          />
        ) : null}
        <SemanticNodes
          nodes={model.nodes}
          positions={positions}
          visible={visible}
          focusId={focusId}
          glowMap={glowMap}
          onFocus={onFocus}
        />
        {showLabels ? (
          <LabelsLayer
            nodes={model.nodes}
            positions={positions}
            visible={visible}
            focusId={focusId}
            onFocus={onFocus}
          />
        ) : null}
      </group>

      <FocusProjector position={focusPos} onAnchor={onFocusAnchor} />
      <CameraController />
    </group>
  );
}
