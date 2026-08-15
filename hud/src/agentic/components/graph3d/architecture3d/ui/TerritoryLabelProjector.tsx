import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { CoreL1Node } from '../data/codeMapCoreL1';
import { computeTerritoryFrame } from './TerritoryLayer';

export type TerritoryAnchor = {
  nodeId: string;
  label: string;
  anchorX: number;
  anchorY: number;
  labelX: number;
  labelY: number;
  visible: boolean;
  side: 'left' | 'right';
};

/** Générique — mêmes calculs que CoreInteriorLabelProjector, nœuds/centre en props. */
export function TerritoryLabelProjector({
  nodes,
  center,
  lod,
  containerRef,
  onAnchorsUpdate,
}: {
  nodes: CoreL1Node[];
  center: THREE.Vector3 | null;
  lod: number;
  containerRef: RefObject<HTMLElement | null>;
  onAnchorsUpdate: (anchors: TerritoryAnchor[]) => void;
}) {
  const { camera } = useThree();
  const vec = useMemo(() => new THREE.Vector3(), []);
  const lastKey = useRef('');
  const layout = useMemo(
    () => (center ? computeTerritoryFrame(nodes, center) : null),
    [nodes, center],
  );

  useFrame(() => {
    if (lod < 0.35 || !layout) {
      if (lastKey.current !== 'hidden') {
        lastKey.current = 'hidden';
        onAnchorsUpdate([]);
      }
      return;
    }

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = rect.width * 0.5;
    const labelReveal = Math.max(0, (lod - 0.45) / 0.55);

    const anchors: TerritoryAnchor[] = nodes.map((node) => {
      const pos = layout.positions.get(node.id);
      if (!pos) {
        return {
          nodeId: node.id,
          label: node.name,
          anchorX: 0,
          anchorY: 0,
          labelX: 0,
          labelY: 0,
          visible: false,
          side: 'left' as const,
        };
      }

      vec.copy(pos);
      vec.project(camera);
      const visible = vec.z >= -1 && vec.z <= 1;
      const anchorX = (vec.x * 0.5 + 0.5) * rect.width;
      const anchorY = (-vec.y * 0.5 + 0.5) * rect.height;
      const dx = anchorX - cx;
      const dy = anchorY - rect.height * 0.5;
      const len = Math.hypot(dx, dy) || 1;
      const outward = 16 * labelReveal;
      const labelX = anchorX + (dx / len) * outward;
      const labelY = anchorY + (dy / len) * outward;

      return {
        nodeId: node.id,
        label: node.name,
        anchorX,
        anchorY,
        labelX,
        labelY,
        visible: visible && labelReveal > 0.08,
        side: labelX < cx ? ('left' as const) : ('right' as const),
      };
    });

    const key = anchors.map((a) => `${a.nodeId}:${a.labelX.toFixed(0)}`).join('|') + lod.toFixed(2);
    if (key !== lastKey.current) {
      lastKey.current = key;
      onAnchorsUpdate(anchors);
    }
  });

  return null;
}
