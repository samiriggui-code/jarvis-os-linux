import type { Vec3 } from '../../types';

/** Calé sur neuralGraphBuild — positions monde des 9 process majeurs. */
const RADIUS = 3.15;
const ORB_SCALE = RADIUS * 0.72;

const ORB_INTERIOR: Record<string, Vec3> = {
  core: [0, 0, 0],
  hermes: [-0.62, 0.18, 0.42],
  policy: [0.12, 1.22, 0.38],
  memory: [-0.48, 0.82, -0.62],
  hud: [-1.05, -0.9, 0.32],
  devices: [0.28, -1.15, 0.22],
  voice: [1.05, 0.9, 0.48],
  vision: [1.16, 0.08, -0.52],
  home: [0.8, -0.85, -0.66],
};

export const ARCHITECTURE_PROCESS_IDS = Object.keys(ORB_INTERIOR);

export function processWorldPosition(processId: string): Vec3 | null {
  const interior = ORB_INTERIOR[processId];
  if (!interior) return null;
  return [interior[0] * ORB_SCALE, interior[1] * ORB_SCALE, interior[2] * ORB_SCALE];
}
