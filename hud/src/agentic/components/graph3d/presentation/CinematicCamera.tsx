import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { Vec3 } from '../types';
import type { PresentationActionType } from './types';

const HOME: Vec3 = [0, 0.6, 8.8];

/** Durée cible (ms) par action — §9 du brief. Convertie en taux de lissage exponentiel. */
const DURATION_MS: Partial<Record<PresentationActionType, number>> = {
  overview: 1500,
  home: 1500,
  focus: 950,
  enter: 1200,
  inspect: 900,
  back: 950,
  follow_relation: 1100,
};

function rateFor(action: PresentationActionType): number {
  const ms = DURATION_MS[action] ?? 1000;
  // e^{-rate*T} ≈ 0.05 pour T = durée cible ⇒ rate ≈ 3 / T.
  return 3 / (ms / 1000);
}

export interface CinematicCameraProps {
  /** Position caméra visée (monde). null = position "overview" par défaut. */
  targetPosition: Vec3 | null;
  /** Point regardé (monde). */
  lookAt: Vec3;
  action: PresentationActionType;
  onSettled?: () => void;
  homePosition?: Vec3;
}

/**
 * Caméra de présentation — lissage exponentiel continu (donc naturellement
 * interruptible : changer targetPosition en vol re-vise depuis la position
 * réelle actuelle, jamais de téléportation, jamais d'attente forcée).
 */
export function CinematicCamera({
  targetPosition,
  lookAt,
  action,
  onSettled,
  homePosition = HOME,
}: CinematicCameraProps) {
  const controls = useRef<{
    target: THREE.Vector3;
    object: THREE.Object3D;
    update: () => void;
  } | null>(null);
  const wantPos = useRef(new THREE.Vector3(...homePosition));
  const wantLook = useRef(new THREE.Vector3(...lookAt));
  const settledRef = useRef(true);

  useEffect(() => {
    wantPos.current.set(...(targetPosition ?? homePosition));
    wantLook.current.set(...lookAt);
    settledRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPosition?.[0], targetPosition?.[1], targetPosition?.[2], lookAt[0], lookAt[1], lookAt[2]]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const rate = rateFor(action);
    const k = 1 - Math.exp(-dt * rate);
    c.object.position.lerp(wantPos.current, k);
    c.target.lerp(wantLook.current, k);
    c.update();

    if (!settledRef.current) {
      const posClose = c.object.position.distanceTo(wantPos.current) < 0.01;
      const lookClose = c.target.distanceTo(wantLook.current) < 0.01;
      if (posClose && lookClose) {
        settledRef.current = true;
        onSettled?.();
      }
    }
  });

  return (
    <OrbitControls
      ref={controls as never}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={2.2}
      maxDistance={12}
    />
  );
}