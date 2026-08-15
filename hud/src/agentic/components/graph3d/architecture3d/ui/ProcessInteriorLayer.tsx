import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SpatialMode } from '../../../../spatial/theme/SpatialTheme';
import { codeMapDirsForProcess } from '../data/codeMapProcessDirs';
import { processWorldPosition } from '../data/processWorldPositions';
import { orbColorFromDTop } from '../orbPalette';
import type { ArchitectureFocusState } from '../state/architectureFocus';
import { architectureLevel, focusProcessId, processZoom } from '../state/architectureFocus';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function dirOnShell(index: number, total: number, radius: number, out: THREE.Vector3): THREE.Vector3 {
  if (total <= 1) return out.set(radius, 0, 0);
  const y = 1 - (index / (total - 1)) * 2;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = GOLDEN * index;
  return out.set(Math.cos(theta) * ring * radius, y * ring * radius * 0.72, Math.sin(theta) * ring * radius);
}

/** L2 — répertoires CodeMap autour du process (contains-only V1). */
export function ProcessInteriorLayer({
  focusState,
  mode = 'night',
}: {
  focusState: ArchitectureFocusState;
  mode?: SpatialMode;
}) {
  const group = useRef<THREE.Group>(null);
  const level = architectureLevel(focusState);
  const processId = focusProcessId(focusState);
  const zoom = processZoom(focusState);
  const dirs = useMemo(
    () => (processId ? codeMapDirsForProcess(processId) : []),
    [processId],
  );

  const { lineGeo, lineMat, crossGeo, crossMat } = useMemo(() => {
    const segCount = dirs.length * 2;
    const linePositions = new Float32Array(segCount * 2 * 3);
    const lineColors = new Float32Array(segCount * 2 * 3);
    const crossPositions = new Float32Array(dirs.length * 4 * 3);
    const crossColors = new Float32Array(dirs.length * 4 * 3);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));

    const crossGeo = new THREE.BufferGeometry();
    crossGeo.setAttribute('position', new THREE.BufferAttribute(crossPositions, 3));
    crossGeo.setAttribute('color', new THREE.BufferAttribute(crossColors, 3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: mode === 'light' ? 0.78 : 0.62,
      depthWrite: false,
      toneMapped: false,
    });

    const crossMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: mode === 'light' ? 0.92 : 0.85,
      depthWrite: false,
      toneMapped: false,
    });

    return { lineGeo, lineMat, crossGeo, crossMat, linePositions, lineColors, crossPositions, crossColors };
  }, [dirs, mode]);

  useFrame(({ camera }) => {
    if (!group.current || !processId || dirs.length === 0) {
      if (group.current) group.current.visible = false;
      return;
    }

    const reveal = level === 'L2' ? 1 : Math.max(0, (zoom - 0.35) / 0.65);
    group.current.visible = reveal > 0.02;
    group.current.scale.setScalar(0.85 + reveal * 0.15);

    const centerPos = processWorldPosition(processId);
    if (!centerPos) return;
    const cx = centerPos[0];
    const cy = centerPos[1];
    const cz = centerPos[2];

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
    const shellR = 0.55 + reveal * 0.35;
    const arm = 0.045 + reveal * 0.02;

    dirs.forEach((dir, i) => {
      dirOnShell(i, dirs.length, shellR, scratch);
      const px = cx + scratch.x;
      const py = cy + scratch.y;
      const pz = cz + scratch.z;

      const li = i * 2 * 3;
      lp[li] = cx;
      lp[li + 1] = cy;
      lp[li + 2] = cz;
      lp[li + 3] = px;
      lp[li + 4] = py;
      lp[li + 5] = pz;

      scratch.set(px, py, pz).applyMatrix4(mv);
      const dTop = Math.max(0, Math.min(1, 0.5 - scratch.y * 0.42));
      const c = orbColorFromDTop(dTop, mode);
      const alpha = reveal * (mode === 'light' ? 0.95 : 0.82);
      lc[li] = c.r * alpha;
      lc[li + 1] = c.g * alpha;
      lc[li + 2] = c.b * alpha;
      lc[li + 3] = c.r * alpha * 0.85;
      lc[li + 4] = c.g * alpha * 0.85;
      lc[li + 5] = c.b * alpha * 0.85;

      const cb = i * 4 * 3;
      cp[cb] = px - arm;
      cp[cb + 1] = py;
      cp[cb + 2] = pz;
      cp[cb + 3] = px + arm;
      cp[cb + 4] = py;
      cp[cb + 5] = pz;
      cp[cb + 6] = px;
      cp[cb + 7] = py - arm;
      cp[cb + 8] = pz;
      cp[cb + 9] = px;
      cp[cb + 10] = py + arm;
      cp[cb + 11] = pz;

      for (let v = 0; v < 4; v++) {
        const vi = (cb + v * 3) as number;
        cc[vi] = c.r * alpha;
        cc[vi + 1] = c.g * alpha;
        cc[vi + 2] = c.b * alpha;
      }
    });

    linePos.needsUpdate = true;
    lineCol.needsUpdate = true;
    crossPos.needsUpdate = true;
    crossCol.needsUpdate = true;
    lineMat.opacity = (mode === 'light' ? 0.78 : 0.62) * reveal;
    crossMat.opacity = (mode === 'light' ? 0.92 : 0.85) * reveal;
  });

  if (!processId || dirs.length === 0) return null;

  return (
    <group ref={group}>
      <lineSegments geometry={lineGeo} material={lineMat} raycast={() => null} />
      <lineSegments geometry={crossGeo} material={crossMat} raycast={() => null} />
    </group>
  );
}
