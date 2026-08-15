import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SpatialMode } from '../../../../spatial/theme/SpatialTheme';
import { coreL1Nodes } from '../data/codeMapCoreL1';
import {
  cameraDistanceForBounds,
  coreTerritoryBounds,
  layoutCoreTerritory,
} from '../data/coreTerritoryLayout';
import { processWorldPosition } from '../data/processWorldPositions';
import { orbColorFromDTop } from '../orbPalette';
import { presentationLodT, type PresentationState } from '../state/presentationController';

const VERTS_PER_CROSS = 4;

function writeCross(
  cx: number,
  cy: number,
  cz: number,
  arm: number,
  offset: number,
  out: Float32Array,
): void {
  const b = offset;
  out[b] = cx - arm;
  out[b + 1] = cy;
  out[b + 2] = cz;
  out[b + 3] = cx + arm;
  out[b + 4] = cy;
  out[b + 5] = cz;
  out[b + 6] = cx;
  out[b + 7] = cy - arm;
  out[b + 8] = cz;
  out[b + 9] = cx;
  out[b + 10] = cy + arm;
  out[b + 11] = cz;
}

export type CoreTerritoryFrame = {
  positions: Map<string, THREE.Vector3>;
  bounds: { center: THREE.Vector3; radius: number };
  cameraDistance: number;
};

/** Expose layout pour caméra + labels overlay. */
export function computeCoreTerritoryFrame(): CoreTerritoryFrame | null {
  const center = processWorldPosition('core');
  if (!center) return null;
  const nodes = coreL1Nodes();
  const positions = layoutCoreTerritory(nodes, center);
  const bounds = coreTerritoryBounds(center, positions.values());
  return {
    positions,
    bounds,
    cameraDistance: cameraDistanceForBounds(bounds.radius),
  };
}

/** L1 CORE — nœuds CodeMap réels, continuité avec la sphère JARVIS. */
export function CoreTerritoryLayer({
  presentation,
  mode = 'night',
  onFrame,
}: {
  presentation: PresentationState;
  mode?: SpatialMode;
  onFrame?: (frame: CoreTerritoryFrame | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const nodes = useMemo(() => coreL1Nodes(), []);
  const layout = useMemo(() => computeCoreTerritoryFrame(), []);

  const { lineGeo, lineMat, crossGeo, crossMat } = useMemo(() => {
    const n = nodes.length;
    const linePositions = new Float32Array(n * 2 * 3);
    const lineColors = new Float32Array(n * 2 * 3);
    const crossPositions = new Float32Array(n * VERTS_PER_CROSS * 3);
    const crossColors = new Float32Array(n * VERTS_PER_CROSS * 3);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));

    const crossGeo = new THREE.BufferGeometry();
    crossGeo.setAttribute('position', new THREE.BufferAttribute(crossPositions, 3));
    crossGeo.setAttribute('color', new THREE.BufferAttribute(crossColors, 3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: mode === 'light' ? 0.75 : 0.58,
      depthWrite: false,
      toneMapped: false,
    });

    const crossMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: mode === 'light' ? 0.9 : 0.82,
      depthWrite: false,
      toneMapped: false,
    });

    return { lineGeo, lineMat, crossGeo, crossMat };
  }, [nodes, mode]);

  useFrame(({ camera }) => {
    if (!group.current || !layout) return;

    const lod = presentationLodT(presentation);
    onFrame?.(layout);
    group.current.visible = lod > 0.02;
    group.current.scale.setScalar(0.92 + lod * 0.08);

    const center = processWorldPosition('core');
    if (!center) return;

    const linePos = lineGeo.getAttribute('position') as THREE.BufferAttribute;
    const lineCol = lineGeo.getAttribute('color') as THREE.BufferAttribute;
    const crossPos = crossGeo.getAttribute('position') as THREE.BufferAttribute;
    const crossCol = crossGeo.getAttribute('color') as THREE.BufferAttribute;

    const lp = linePos.array as Float32Array;
    const lc = lineCol.array as Float32Array;
    const cp = crossPos.array as Float32Array;
    const cc = crossCol.array as Float32Array;

    const scratch = new THREE.Vector3();
    const mv = new THREE.Matrix4().multiplyMatrices(
      camera.matrixWorldInverse,
      group.current.matrixWorld,
    );

    const dirReveal = Math.max(0, (lod - 0.12) / 0.88);
    const fileReveal = Math.max(0, (lod - 0.45) / 0.55);

    nodes.forEach((node, i) => {
      const pos = layout.positions.get(node.id);
      if (!pos) return;

      const isDir = node.kind === 'directory';
      const reveal = isDir ? dirReveal : fileReveal;
      const arm = (isDir ? 0.038 : 0.018) * (0.65 + node.visualWeight * 0.08);

      const li = i * 2 * 3;
      lp[li] = center[0];
      lp[li + 1] = center[1];
      lp[li + 2] = center[2];
      lp[li + 3] = pos.x;
      lp[li + 4] = pos.y;
      lp[li + 5] = pos.z;

      scratch.set(pos.x, pos.y, pos.z).applyMatrix4(mv);
      const dTop = Math.max(0, Math.min(1, 0.5 - scratch.y * 0.42));
      const c = orbColorFromDTop(dTop, mode);
      const alpha = reveal * (mode === 'light' ? 0.92 : 0.78);

      lc[li] = c.r * alpha * 0.55;
      lc[li + 1] = c.g * alpha * 0.55;
      lc[li + 2] = c.b * alpha * 0.55;
      lc[li + 3] = c.r * alpha;
      lc[li + 4] = c.g * alpha;
      lc[li + 5] = c.b * alpha;

      const cb = i * VERTS_PER_CROSS * 3;
      writeCross(pos.x, pos.y, pos.z, arm, cb, cp);
      for (let v = 0; v < VERTS_PER_CROSS; v++) {
        const vi = cb + v * 3;
        cc[vi] = c.r * alpha;
        cc[vi + 1] = c.g * alpha;
        cc[vi + 2] = c.b * alpha;
      }
    });

    linePos.needsUpdate = true;
    lineCol.needsUpdate = true;
    crossPos.needsUpdate = true;
    crossCol.needsUpdate = true;
    lineMat.opacity = (mode === 'light' ? 0.75 : 0.58) * dirReveal;
    crossMat.opacity = (mode === 'light' ? 0.9 : 0.82) * Math.max(dirReveal, fileReveal * 0.6);
  });

  if (!layout || nodes.length === 0) return null;

  return (
    <group ref={group}>
      <lineSegments geometry={lineGeo} material={lineMat} raycast={() => null} />
      <lineSegments geometry={crossGeo} material={crossMat} raycast={() => null} />
    </group>
  );
}
