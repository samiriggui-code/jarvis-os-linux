import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { CYAN, CYAN_HOT } from '../theme';
import type { GraphEdge, Vec3 } from '../types';
import { LineSegments } from './LineSegments';

export function SemanticEdges({
  edges,
  positions,
  visible,
  focusId,
  glowMap,
}: {
  edges: GraphEdge[];
  positions: Record<string, Vec3>;
  visible: Set<string>;
  focusId: string | null;
  glowMap: THREE.Texture;
}) {
  const segs: Array<[Vec3, Vec3]> = [];
  const live: Array<[Vec3, Vec3]> = [];
  for (const e of edges) {
    if (!visible.has(e.source) || !visible.has(e.target)) continue;
    const a = positions[e.source];
    const b = positions[e.target];
    if (!a || !b) continue;
    const pair: [Vec3, Vec3] = [a, b];
    const hot = Boolean(focusId && (e.source === focusId || e.target === focusId));
    if (e.active || hot) live.push(pair);
    segs.push(pair);
  }

  return (
    <group>
      <LineSegments segments={segs} color={CYAN} opacity={focusId ? 0.18 : 0.32} />
      {live.length ? <EdgeTravel segments={live} map={glowMap} /> : null}
    </group>
  );
}

function EdgeTravel({
  segments,
  map,
}: {
  segments: Array<[Vec3, Vec3]>;
  map: THREE.Texture;
}) {
  const refs = useRef<THREE.Sprite[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    refs.current.forEach((sprite, i) => {
      if (!sprite) return;
      const [a, b] = segments[i]!;
      const u = (t * 0.12 + i * 0.17) % 1;
      sprite.position.set(
        a[0] + (b[0] - a[0]) * u,
        a[1] + (b[1] - a[1]) * u,
        a[2] + (b[2] - a[2]) * u,
      );
    });
  });
  return (
    <group>
      {segments.map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            if (el) refs.current[i] = el;
          }}
          scale={[0.06, 0.06, 1]}
          raycast={() => null}
        >
          <spriteMaterial
            map={map}
            color={CYAN_HOT}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            opacity={0.85}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  );
}
