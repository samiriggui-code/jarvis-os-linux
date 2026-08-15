import { useMemo } from 'react';
import * as THREE from 'three';
import { CLOUD_R, CYAN } from '../theme';
import { fibonacciSphere, kNearestPairs } from '../layouts';
import type { Vec3 } from '../types';
import { LineSegments } from './LineSegments';

/**
 * Maille décorative — pas le graphe métier.
 * Désactivable sans perdre la structure réelle.
 */
export function DecorativeLinks({
  positions,
  enabled,
  glowMap,
}: {
  positions: Record<string, Vec3>;
  enabled: boolean;
  glowMap: THREE.Texture;
}) {
  const lattice = useMemo(() => (enabled ? fibonacciSphere(24, CLOUD_R * 0.9) : []), [enabled]);

  const latticeIndex = useMemo(() => {
    const rec: Record<string, Vec3> = {};
    lattice.forEach((p, i) => {
      rec[`_l${i}`] = p;
    });
    return rec;
  }, [lattice]);

  const latticeSegs = useMemo(
    () => kNearestPairs(latticeIndex, 3).map(([a, b]) => [latticeIndex[a]!, latticeIndex[b]!] as [Vec3, Vec3]),
    [latticeIndex],
  );

  const hubToLattice = useMemo(() => {
    const segs: Array<[Vec3, Vec3]> = [];
    if (!lattice.length) return segs;
    for (const p of Object.values(positions)) {
      let best = 0;
      let bestD = Infinity;
      lattice.forEach((q, i) => {
        const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (d < bestD) {
          best = i;
          bestD = d;
        }
      });
      segs.push([p, lattice[best]!]);
    }
    return segs;
  }, [lattice, positions]);

  if (!enabled) return null;

  return (
    <group>
      <LineSegments segments={latticeSegs} color={CYAN} opacity={0.06} />
      <LineSegments segments={hubToLattice} color={CYAN} opacity={0.08} />
      {lattice.map((p, i) => (
        <sprite key={`l${i}`} position={p} scale={[0.038, 0.038, 1]} raycast={() => null}>
          <spriteMaterial
            map={glowMap}
            color={CYAN}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
              opacity={0.22}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  );
}
