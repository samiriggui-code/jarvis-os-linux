import { OrbitControls } from '@react-three/drei';

/**
 * Caméra de la primitive — orbit autour de l’orbe.
 * Le focus ne recentre PAS le nœud : sinon tout l’UI se retrouve du même côté.
 */
export function CameraController() {
  return (
    <OrbitControls
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={5.8}
      maxDistance={10.5}
      rotateSpeed={0.42}
      zoomSpeed={0.55}
      autoRotate={false}
    />
  );
}
