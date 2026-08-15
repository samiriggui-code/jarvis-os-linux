import * as THREE from 'three';
import type { SpatialMode } from '../../../../spatial/theme/SpatialTheme';

/** Dégradé vertical JarvisOrb.jsx — stopMix (cyan haut → orange bas). */
const ORB_STOPS: readonly THREE.Color[] = [
  new THREE.Color(0.35, 0.92, 1.0),
  new THREE.Color(0.22, 0.38, 0.95),
  new THREE.Color(0.48, 0.18, 0.92),
  new THREE.Color(0.72, 0.12, 0.62),
  new THREE.Color(0.95, 0.14, 0.42),
  new THREE.Color(1.0, 0.28, 0.22),
  new THREE.Color(1.0, 0.58, 0.12),
];

export function sampleOrbGradient(dTop: number): THREE.Color {
  const t = Math.max(0, Math.min(1, dTop));
  const s = t * 6;
  const i = Math.min(5, Math.floor(s));
  const f = s - i;
  return ORB_STOPS[i]!.clone().lerp(ORB_STOPS[i + 1]!, f);
}

/** dTop 0 = bas, 1 = haut — comme l’orbe identité. */
export function orbColorAt(y: number, radius: number, mode: SpatialMode, jitter = 0): THREE.Color {
  const dTop = Math.max(0, Math.min(1, y / radius * 0.5 + 0.5 + jitter));
  return orbColorFromDTop(dTop, mode);
}

/** JarvisOrb.jsx — stopMix en espace écran (mv.y), pas world Y. */
export function orbColorFromDTop(dTop: number, mode: SpatialMode): THREE.Color {
  const grad = sampleOrbGradient(dTop);
  if (mode === 'light') {
    grad.lerp(new THREE.Color(0.04, 0.28, 0.52), 0.42);
    grad.multiplyScalar(0.92);
  } else {
    // Nuit : léger boost luminance pour croix / synapses sur fond sombre.
    grad.multiplyScalar(1.06);
  }
  return grad;
}

/** Texture blanche neutre — la couleur vient des vertex, pas du map cyan. */
export function orbGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.88)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export const ORB_LINE = new THREE.Color(0.55, 0.82, 1.0);
export const ORB_ACCENT = '#0A84FF';
