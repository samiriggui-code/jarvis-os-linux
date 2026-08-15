import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getDeviceProfile, scaleForTier } from '../../../../ui/core/device';
import { CLOUD_R, glowTexture } from '../theme';

/** Même ordre de grandeur qu’OrbVoyage — pas un debug à 3k points. */
export function defaultParticleCount(reducedMotion: boolean): number {
  if (reducedMotion) return 18_000;
  return scaleForTier({ low: 45_000, medium: 90_000, high: 120_000 });
}

function pointSizeForCount(n: number, tier: string): number {
  const base = 0.072 * Math.sqrt(12_000 / Math.max(n, 1));
  const floor = tier === 'low' ? 0.022 : 0.016;
  return Math.max(floor, Math.min(0.048, base));
}

/**
 * Nuage volumétrique — densité visuelle uniquement, pas pickable.
 * Un seul buffer GPU ; distribution organique (colonne + volume + filaments).
 */
export function ParticleField({ count }: { count?: number }) {
  const profile = getDeviceProfile();
  const resolved = count !== undefined ? count : defaultParticleCount(profile.reducedMotion);

  const { geometry, material } = useMemo(() => {
    const n = Math.max(0, resolved);
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const color = new THREE.Color();

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const roll = Math.random();
      let x: number;
      let y: number;
      let z: number;

      if (roll < 0.34) {
        // Colonne lumineuse — cœur vertical (pas une boule uniforme)
        y = (Math.random() * 2 - 1) * CLOUD_R * 0.96;
        const r = Math.pow(Math.random(), 1.85) * CLOUD_R * 0.26;
        const a = Math.random() * Math.PI * 2;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      } else if (roll < 0.88) {
        // Volume intérieur — biais centre (pow < 1 = plus dense au milieu)
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const shell = CLOUD_R * Math.pow(Math.random(), 0.42);
        x = shell * Math.sin(phi) * Math.cos(theta);
        y = shell * Math.cos(phi) * 0.96;
        z = shell * Math.sin(phi) * Math.sin(theta);
      } else {
        // Filaments / wisps — brisent la peau sphérique lisse
        const theta = Math.random() * Math.PI * 2;
        const band = 0.72 + Math.random() * 0.38;
        const wisp = CLOUD_R * band * (0.92 + Math.random() * 0.14);
        x = wisp * Math.cos(theta) * (0.4 + Math.random() * 0.6);
        y = (Math.random() * 2 - 1) * CLOUD_R * 0.55;
        z = wisp * Math.sin(theta) * (0.4 + Math.random() * 0.6);
      }

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;

      const radial = Math.hypot(x, y, z) / CLOUD_R;
      const vertical = 1 - Math.abs(y) / CLOUD_R;
      const core = 1 - radial;
      const lum =
        roll < 0.34
          ? 0.78 + vertical * 0.2 + core * 0.12
          : 0.32 + core * 0.42 + vertical * 0.22 + (Math.random() * 0.08);
      color.setHSL(0.55, 0.22 + core * 0.32, Math.min(0.98, lum));
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: pointSizeForCount(n, profile.tier),
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: n > 60_000 ? 0.58 : 0.68,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
    });

    return { geometry, material };
  }, [resolved, profile.tier]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(({ clock }) => {
    const base = resolved > 60_000 ? 0.52 : 0.62;
    material.opacity = base + Math.sin(clock.getElapsedTime() * 0.7) * 0.05;
  });

  if (resolved <= 0) return null;

  return <points geometry={geometry} material={material} raycast={() => null} />;
}
