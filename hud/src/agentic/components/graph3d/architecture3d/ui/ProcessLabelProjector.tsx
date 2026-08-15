import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { processWorldPosition } from '../data/processWorldPositions';

export type ProcessScreenAnchor = {
  processId: string;
  anchorX: number;
  anchorY: number;
  labelX: number;
  labelY: number;
  visible: boolean;
  side: 'left' | 'right';
};

function resolveLabelCollisions(anchors: ProcessScreenAnchor[], labelW = 76, labelH = 16): void {
  const margin = 8;
  for (let iter = 0; iter < 5; iter++) {
    for (let i = 0; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        const a = anchors[i]!;
        const b = anchors[j]!;
        if (!a.visible || !b.visible) continue;
        const dx = b.labelX - a.labelX;
        const dy = b.labelY - a.labelY;
        const dist = Math.hypot(dx, dy);
        const minDist = Math.max(labelW, labelH) + margin;
        if (dist >= minDist || dist === 0) continue;
        const push = (minDist - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.labelX -= nx * push;
        a.labelY -= ny * push;
        b.labelX += nx * push;
        b.labelY += ny * push;
      }
    }
  }
}

/** Projette les process 3D → overlay écran (HTML net, pas TextGeometry). */
export function ProcessLabelProjector({
  processIds,
  containerRef,
  onAnchorsUpdate,
}: {
  processIds: string[];
  containerRef: RefObject<HTMLElement | null>;
  onAnchorsUpdate: (anchors: ProcessScreenAnchor[]) => void;
}) {
  const { camera } = useThree();
  const vec = useMemo(() => new THREE.Vector3(), []);
  const lastKey = useRef('');

  useFrame(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cx = rect.width * 0.5;
    const cy = rect.height * 0.5;
    const outward = 32;

    const anchors: ProcessScreenAnchor[] = processIds.map((processId) => {
      const pos = processWorldPosition(processId);
      if (!pos) {
        return {
          processId,
          anchorX: 0,
          anchorY: 0,
          labelX: 0,
          labelY: 0,
          visible: false,
          side: 'left',
        };
      }

      vec.set(pos[0], pos[1], pos[2]);
      vec.project(camera);
      const visible = vec.z >= -1 && vec.z <= 1;
      const anchorX = (vec.x * 0.5 + 0.5) * rect.width;
      const anchorY = (-vec.y * 0.5 + 0.5) * rect.height;

      const dx = anchorX - cx;
      const dy = anchorY - cy;
      const len = Math.hypot(dx, dy) || 1;
      const labelX = anchorX + (dx / len) * outward;
      const labelY = anchorY + (dy / len) * outward;

      return {
        processId,
        anchorX,
        anchorY,
        labelX,
        labelY,
        visible,
        side: labelX < cx ? 'left' : 'right',
      };
    });

    resolveLabelCollisions(anchors);

    const key = anchors
      .map((a) =>
        a.visible
          ? `${a.processId}:${a.labelX.toFixed(1)},${a.labelY.toFixed(1)},${a.anchorX.toFixed(1)},${a.anchorY.toFixed(1)}`
          : `${a.processId}:hidden`,
      )
      .join('|');

    if (key !== lastKey.current) {
      lastKey.current = key;
      onAnchorsUpdate(anchors);
    }
  });

  return null;
}
