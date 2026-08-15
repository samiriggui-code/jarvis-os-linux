import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3 } from '../types';
import type { GraphFocusAnchor } from '../types';

export function FocusProjector({
  position,
  onAnchor,
}: {
  position: Vec3 | null;
  onAnchor?: (anchor: GraphFocusAnchor | null) => void;
}) {
  const { camera, size } = useThree();
  const v = useRef(new THREE.Vector3());
  const last = useRef({ x: -999, y: -999 });

  useFrame(() => {
    if (!onAnchor) return;
    if (!position) {
      if (last.current.x !== -999) {
        last.current = { x: -999, y: -999 };
        onAnchor(null);
      }
      return;
    }
    v.current.set(position[0], position[1], position[2]);
    v.current.project(camera);
    const x = (v.current.x * 0.5 + 0.5) * size.width;
    const y = (-v.current.y * 0.5 + 0.5) * size.height;
    if (Math.abs(x - last.current.x) < 1.5 && Math.abs(y - last.current.y) < 1.5) return;
    last.current = { x, y };
    onAnchor({
      x,
      y,
      nx: v.current.x,
      ny: v.current.y,
      worldX: position[0],
      canvasW: size.width,
      canvasH: size.height,
    });
  });

  return null;
}
