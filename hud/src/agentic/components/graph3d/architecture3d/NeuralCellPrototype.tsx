import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SpatialMode } from '../../../../spatial/theme/SpatialTheme';
import { buildCorePrototypeMorphology } from './neuralCellMorphology';

export type NeuralCellPrototypeProps = {
  mode?: SpatialMode;
  seed?: number;
  autoRotate?: boolean;
};

/**
 * Prototype isolé — une cellule neuronale CORE.
 * Morphologie organique : soma irrégulier + dendrites courbes + bifurcations.
 * NE PAS intégrer à NeuralGraph avant validation visuelle.
 */
export function NeuralCellPrototype({
  mode = 'night',
  seed = 4242,
  autoRotate = true,
}: NeuralCellPrototypeProps) {
  const group = useRef<THREE.Group>(null);
  const morph = useMemo(() => buildCorePrototypeMorphology(seed), [seed]);

  const { somaColor, dendriteColor } = useMemo(() => {
    const coldWhite = new THREE.Color(0.9, 0.94, 0.97);
    const coldGray = new THREE.Color(0.78, 0.86, 0.9);
    const hintCyan = new THREE.Color(0.62, 0.86, 0.96);
    const soma = coldWhite.clone();
    const dend = coldGray.clone().lerp(hintCyan, 0.14);
    if (mode === 'light') {
      soma.multiplyScalar(1.04);
      dend.multiplyScalar(1.03);
    }
    return { somaColor: soma, dendriteColor: dend };
  }, [mode]);

  const somaMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: somaColor,
        transparent: true,
        opacity: mode === 'light' ? 0.56 : 0.5,
        depthWrite: false,
        toneMapped: false,
      }),
    [somaColor, mode],
  );

  const dendriteMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: dendriteColor,
        transparent: true,
        opacity: mode === 'light' ? 0.68 : 0.62,
        depthWrite: false,
        toneMapped: false,
      }),
    [dendriteColor, mode],
  );

  useEffect(
    () => () => {
      morph.somaGeometry.dispose();
      morph.dendriteGeometry.dispose();
      somaMat.dispose();
      dendriteMat.dispose();
    },
    [morph, somaMat, dendriteMat],
  );

  useFrame((_, delta) => {
    if (!autoRotate || !group.current) return;
    group.current.rotation.y += delta * 0.22;
    group.current.rotation.x = Math.sin(group.current.rotation.y * 0.35) * 0.12;
  });

  return (
    <group ref={group}>
      <mesh geometry={morph.somaGeometry} material={somaMat} raycast={() => null} />
      <mesh geometry={morph.dendriteGeometry} material={dendriteMat} raycast={() => null} />
    </group>
  );
}
