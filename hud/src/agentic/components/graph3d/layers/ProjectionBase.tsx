import { CYAN } from '../theme';

/** Socle holographique optionnel — pas requis au fonctionnement. */
export function ProjectionBase() {
  const rings: Array<{ r: number; opacity: number }> = [
    { r: 2.15, opacity: 0.22 },
    { r: 2.55, opacity: 0.12 },
    { r: 3.05, opacity: 0.06 },
  ];
  return (
    <group position={[0, -2.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {rings.map((ring) => (
        <mesh key={ring.r} raycast={() => null}>
          <torusGeometry args={[ring.r, 0.007, 8, 96]} />
          <meshBasicMaterial color={CYAN} transparent opacity={ring.opacity} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
