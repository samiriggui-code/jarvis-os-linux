import * as THREE from 'three';

export const CYAN = '#8ec8ff';
export const CYAN_HOT = '#e8f6ff';
export const BG = '#03050c';

/** Rayon du volume orbe. Les nœuds restent à l'intérieur. */
export const CLOUD_R = 2.18;

export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(200,230,255,0.8)');
  g.addColorStop(0.55, 'rgba(80,170,255,0.22)');
  g.addColorStop(1, 'rgba(10,132,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
