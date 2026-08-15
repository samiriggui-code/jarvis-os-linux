import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { CYAN_HOT } from '../theme';
import type { GraphNode, Vec3 } from '../types';

export function SemanticNodes({
  nodes,
  positions,
  visible,
  focusId,
  glowMap,
  onFocus,
}: {
  nodes: GraphNode[];
  positions: Record<string, Vec3>;
  visible: Set<string>;
  focusId: string | null;
  glowMap: THREE.Texture;
  onFocus: (id: string) => void;
}) {
  return (
    <group>
      {nodes.map((node) => {
        const p = positions[node.id];
        if (!p) return null;
        return (
          <SemanticNode
            key={node.id}
            node={node}
            position={p}
            focused={focusId === node.id}
            dimmed={!visible.has(node.id)}
            glowMap={glowMap}
            onFocus={onFocus}
          />
        );
      })}
    </group>
  );
}

function SemanticNode({
  node,
  position,
  focused,
  dimmed,
  glowMap,
  onFocus,
}: {
  node: GraphNode;
  position: Vec3;
  focused: boolean;
  dimmed: boolean;
  glowMap: THREE.Texture;
  onFocus: (id: string) => void;
}) {
  const spark = useRef<THREE.Sprite>(null);
  const isCore = node.id === 'core';
  const flare = isCore ? 0.2 : focused ? 0.16 : 0.1 + (node.importance ?? 0.6) * 0.04;

  useFrame(({ clock }) => {
    const s = spark.current;
    if (!s) return;
    const pulse = focused ? 1.12 + Math.sin(clock.getElapsedTime() * 2.4) * 0.08 : 1;
    s.scale.setScalar(flare * pulse);
  });

  return (
    <group position={position}>
      <sprite ref={spark} scale={[flare, flare, 1]} raycast={() => null}>
        <spriteMaterial
          map={glowMap}
          color={CYAN_HOT}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={dimmed ? 0.08 : isCore ? 0.95 : 0.7}
          toneMapped={false}
        />
      </sprite>
      {focused ? (
        <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <torusGeometry args={[0.18, 0.006, 8, 32]} />
          <meshBasicMaterial color={CYAN_HOT} transparent opacity={0.7} toneMapped={false} />
        </mesh>
      ) : null}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onFocus(node.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
