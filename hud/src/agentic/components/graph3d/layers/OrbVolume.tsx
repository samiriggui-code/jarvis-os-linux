import * as THREE from 'three';
import { CLOUD_R, CYAN } from '../theme';

/**
 * Enveloppe quasi invisible — la matière vient des particules, pas d’une sphère.
 * Opacité trop haute = effet « boule sphérisée ».
 */
export function OrbVolume() {
  return (
    <mesh raycast={() => null}>
      <sphereGeometry args={[CLOUD_R * 1.01, 24, 18]} />
      <meshBasicMaterial
        color={CYAN}
        transparent
        opacity={0.012}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}
