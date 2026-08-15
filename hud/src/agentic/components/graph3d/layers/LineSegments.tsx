import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Vec3 } from '../types';

export function LineSegments({
  segments,
  color,
  opacity,
}: {
  segments: Array<[Vec3, Vec3]>;
  color: string;
  opacity: number;
}) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(segments.length * 6);
    segments.forEach(([a, b], i) => {
      const o = i * 6;
      positions[o] = a[0];
      positions[o + 1] = a[1];
      positions[o + 2] = a[2];
      positions[o + 3] = b[0];
      positions[o + 4] = b[1];
      positions[o + 5] = b[2];
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [segments]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  if (!segments.length) return null;

  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
    </lineSegments>
  );
}
