import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { resolveStackFrames } from '../data/stackGeometry';
import { lodAtDepth, stackDepth, type PresentationState } from '../state/presentationController';

const OVERVIEW_DISTANCE = 8.8;
const HOME_POSITION = new THREE.Vector3(0, 0, OVERVIEW_DISTANCE);
const HOME_TARGET = new THREE.Vector3(0, 0, 0);

/**
 * Macro → micro, profondeur N — continuité spatiale garantie.
 *
 * Pas de "L1"/"L2" ici : on itère navigationStack (la plus profonde des
 * deux piles pendant une transition), on cadre chaque palier via
 * resolveStackFrames (générique — process ou n'importe quel nœud CodeMap),
 * et on chaîne les lerp dans l'ordre. Un palier déjà réglé pèse à lod=1
 * (donc "gagne" le lerp en entier) ; le palier en cours de transition
 * pèse lodAtDepth(...) ∈ [0,1] ; au-delà, lod=0 arrête la boucle — la
 * caméra n'avance jamais plus loin que ce qui est réellement entré.
 */
export function ArchitectureCameraRig({ presentation }: { presentation: PresentationState }) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const desiredTarget = useRef(new THREE.Vector3(0, 0, 0));
  const desiredDist = useRef(OVERVIEW_DISTANCE);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const longerStack =
      presentation.pendingStack && presentation.pendingStack.length > presentation.stack.length
        ? presentation.pendingStack
        : presentation.stack;
    const frames = resolveStackFrames(longerStack);
    const depth = stackDepth(presentation);

    let target = HOME_TARGET.clone();
    let distance = OVERVIEW_DISTANCE;

    for (let i = 0; i < frames.length && i < depth; i++) {
      const lod = lodAtDepth(presentation, i + 1);
      if (lod <= 0) break;
      const frame = frames[i]!;
      target.lerp(frame.bounds.center, lod);
      distance = THREE.MathUtils.lerp(distance, frame.cameraDistance, lod);
    }

    desiredTarget.current.copy(target);
    desiredDist.current = distance;

    const blend = 1 - Math.exp(-delta * 2.8);
    controls.target.lerp(desiredTarget.current, blend);

    const offset = camera.position.clone().sub(controls.target);
    const currentDist = offset.length();
    if (currentDist > 1e-4) {
      const nextDist = THREE.MathUtils.lerp(currentDist, desiredDist.current, blend);
      offset.multiplyScalar(nextDist / currentDist);
      camera.position.copy(controls.target).add(offset);
    }

    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      // Plancher bas — garde-fou anti-clip, pas une limite de cadrage.
      // Les paliers profonds veulent une distance très inférieure à
      // l'ancien plancher fixe (3.8), qui écrasait leur zoom.
      minDistance={0.45}
      maxDistance={12}
      rotateSpeed={0.38}
      zoomSpeed={0.5}
      dampingFactor={0.08}
      enableDamping
    />
  );
}

export function resetCameraHome(camera: THREE.Camera, controls: OrbitControlsImpl | null) {
  camera.position.copy(HOME_POSITION);
  if (controls) {
    controls.target.copy(HOME_TARGET);
    controls.update();
  }
}
