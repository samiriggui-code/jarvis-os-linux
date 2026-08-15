import * as THREE from 'three';
import type { CoreL1Node } from './codeMapCoreL1';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Territoires organiques autour du centre CORE — pas un organigramme rigide. */
export function layoutCoreTerritory(
  nodes: CoreL1Node[],
  center: readonly [number, number, number],
): Map<string, THREE.Vector3> {
  const out = new Map<string, THREE.Vector3>();
  const cx = center[0];
  const cy = center[1];
  const cz = center[2];

  const dirs = nodes.filter((n) => n.kind === 'directory');
  const files = nodes.filter((n) => n.kind === 'file');

  dirs.forEach((node, i) => {
    const w = node.visualWeight || Math.sqrt(node.descendantFiles + 1);
    const ring = 0.34 + w * 0.052;
    const angle = i * GOLDEN * 2.05 + 0.35;
    const band = dirs.length > 1 ? i / (dirs.length - 1) - 0.5 : 0;
    out.set(
      node.id,
      new THREE.Vector3(
        cx + Math.cos(angle) * ring,
        cy + band * 0.62 + Math.sin(angle * 0.7) * 0.08,
        cz + Math.sin(angle) * ring,
      ),
    );
  });

  files.forEach((node, i) => {
    const ring = 0.11 + (i % 6) * 0.022;
    const angle = i * GOLDEN * 3.7 + 1.1;
    out.set(
      node.id,
      new THREE.Vector3(
        cx + Math.cos(angle) * ring * 0.75,
        cy + Math.sin(i * 0.85) * 0.11,
        cz + Math.sin(angle) * ring * 0.75,
      ),
    );
  });

  return out;
}

export function coreTerritoryBounds(
  center: readonly [number, number, number],
  positions: Iterable<THREE.Vector3>,
): { center: THREE.Vector3; radius: number } {
  const box = new THREE.Box3();
  box.expandByPoint(new THREE.Vector3(center[0], center[1], center[2]));
  for (const p of positions) box.expandByPoint(p);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  return {
    center: sphere.center.clone(),
    radius: Math.max(sphere.radius, 0.42),
  };
}

/** Distance caméra pour cadrer le territoire CORE (fov deg). */
export function cameraDistanceForBounds(radius: number, fovDeg = 42, margin = 1.22): number {
  const fovRad = (fovDeg * Math.PI) / 180;
  return (radius / Math.tan(fovRad / 2)) * margin;
}
