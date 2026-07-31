/**
 * EmmaHologram3D — Visage holographique 3D Three.js
 * MVP1 : particules procédurales en forme de visage humanoïde
 *   - construction progressive 0→100 % (fillLevel)
 *   - scanline shader
 *   - wireframe contour
 *   - yeux lumineux à 80 %+
 *   - déconstruction inverse (particules explosent vers l'extérieur)
 *   - respiration / pulsation
 *
 * Cahier §10.1 — Face Loading System
 * Pas de modèle GLB — tout est procédural (BufferGeometry + ShaderMaterial).
 * Pas de nouvelle dépendance — Three.js déjà installé.
 */
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { FaceBuildPhase } from '../../engine/faceHologramTypes';

interface EmmaHologram3DProps {
  size?: number;
  /** 0–100 confiance biométrique */
  progress?: number;
  buildPhase?: FaceBuildPhase;
  speaking?: boolean;
}

/* ─── Constantes ───────────────────────────────────────────────────────────── */
const PARTICLE_COUNT = 12000;
const WIREFRAME_COUNT = 800;

/* Couleurs par phase */
const PHASE_HEX: Record<FaceBuildPhase, number> = {
  waiting:        0x00e5ff,
  camera_on:      0x00e5ff,
  reconstruction: 0x00e5ff,
  success:        0x22c55e,
  deconstruct:    0xef4444,
  obstruction:    0xf59e0b,
  recovery:       0x00e5ff,
  locked:         0x64748b,
};

/* ─── Helpers courbes ─────────────────────────────────────────────────────── */
/** Place `n` points le long d'une ellipse 2D (x,y) à z fixe + bruit gaussien */
function ellipseCurve(
  out: Float32Array, offset: number, n: number,
  cx: number, cy: number, cz: number,
  rx: number, ry: number,
  a0: number, a1: number, noise: number,
) {
  for (let i = 0; i < n; i++) {
    const t = a0 + (a1 - a0) * (i / (n - 1));
    const ix = (offset + i) * 3;
    out[ix]     = cx + Math.cos(t) * rx + (Math.random() - 0.5) * noise;
    out[ix + 1] = cy + Math.sin(t) * ry + (Math.random() - 0.5) * noise;
    out[ix + 2] = cz + (Math.random() - 0.5) * noise * 0.5;
  }
}

/** Place `n` points le long d'une ligne droite */
function lineCurve(
  out: Float32Array, offset: number, n: number,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  noise: number,
) {
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const ix = (offset + i) * 3;
    out[ix]     = x0 + (x1 - x0) * t + (Math.random() - 0.5) * noise;
    out[ix + 1] = y0 + (y1 - y0) * t + (Math.random() - 0.5) * noise;
    out[ix + 2] = z0 + (z1 - z0) * t + (Math.random() - 0.5) * noise * 0.5;
  }
}

/* ─── Génération traits anatomiques précis ───────────────────────────────── */
function generateFacePoints(count: number): Float32Array {
  const pos = new Float32Array(count * 3);

  // Budget par trait (total = count)
  // Les pourcentages sont approximatifs — on génère par groupe
  let cursor = 0;

  const alloc = (n: number, fn: (offset: number, n: number) => void) => {
    const actual = Math.min(n, count - cursor);
    if (actual > 0) fn(cursor, actual);
    cursor += actual;
  };

  // ── 1. Contour visage (ovale) — 18%
  alloc(Math.floor(count * 0.18), (off, n) => {
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      // Ovale : large en haut (front), étroit en bas (menton)
      const scaleX = t > Math.PI ? 0.55 + (1 - Math.abs(t - Math.PI * 1.5) / (Math.PI * 0.5)) * 0.1 : 0.55;
      const rx = 0.28 * scaleX;
      const ry = t < Math.PI ? 0.22 : 0.32; // plus allongé vers le bas
      const ix = (off + i) * 3;
      pos[ix]     = Math.cos(t - Math.PI * 0.5) * rx + (Math.random() - 0.5) * 0.008;
      pos[ix + 1] = Math.sin(t - Math.PI * 0.5) * ry + 0.02 + (Math.random() - 0.5) * 0.008;
      pos[ix + 2] = 0.18 + (Math.random() - 0.5) * 0.01;
    }
  });

  // ── 2. Sourcil gauche (arc) — 6%
  alloc(Math.floor(count * 0.06), (off, n) => {
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * Math.PI - Math.PI * 0.12;
      const ix = (off + i) * 3;
      pos[ix]     = -0.07 - Math.cos(t) * 0.10 + (Math.random() - 0.5) * 0.007;
      pos[ix + 1] =  0.18 + Math.sin(t) * 0.025 + (Math.random() - 0.5) * 0.005;
      pos[ix + 2] =  0.25 + (Math.random() - 0.5) * 0.01;
    }
  });

  // ── 3. Sourcil droit (arc) — 6%
  alloc(Math.floor(count * 0.06), (off, n) => {
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * Math.PI - Math.PI * 0.12;
      const ix = (off + i) * 3;
      pos[ix]     =  0.07 + Math.cos(t) * 0.10 + (Math.random() - 0.5) * 0.007;
      pos[ix + 1] =  0.18 + Math.sin(t) * 0.025 + (Math.random() - 0.5) * 0.005;
      pos[ix + 2] =  0.25 + (Math.random() - 0.5) * 0.01;
    }
  });

  // ── 4. Œil gauche (ellipse) — 8%
  alloc(Math.floor(count * 0.08), (off, n) =>
    ellipseCurve(pos, off, n, -0.115, 0.10, 0.26, 0.068, 0.040, 0, Math.PI * 2, 0.006));

  // ── 5. Œil droit (ellipse) — 8%
  alloc(Math.floor(count * 0.08), (off, n) =>
    ellipseCurve(pos, off, n,  0.115, 0.10, 0.26, 0.068, 0.040, 0, Math.PI * 2, 0.006));

  // ── 6. Pont nasal + narines — 8%
  alloc(Math.floor(count * 0.05), (off, n) =>
    lineCurve(pos, off, n, 0, 0.08, 0.28, 0, -0.045, 0.31, 0.006));
  alloc(Math.floor(count * 0.03), (off, n) => {
    for (let i = 0; i < n; i++) {
      const side = i < n / 2 ? -1 : 1;
      const t = (i % Math.floor(n / 2)) / Math.floor(n / 2);
      const angle = t * Math.PI;
      const ix = (off + i) * 3;
      pos[ix]     = side * (0.018 + Math.cos(angle) * 0.022) + (Math.random() - 0.5) * 0.005;
      pos[ix + 1] = -0.055 + Math.sin(angle) * 0.018 + (Math.random() - 0.5) * 0.005;
      pos[ix + 2] = 0.295 + (Math.random() - 0.5) * 0.008;
    }
  });

  // ── 7. Lèvre supérieure (arc Cupidon) — 7%
  alloc(Math.floor(count * 0.07), (off, n) => {
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * Math.PI;
      // Arc Cupidon : double bosse
      const arch = Math.sin(t * 2) * 0.012;
      const ix = (off + i) * 3;
      pos[ix]     = (i / (n - 1) - 0.5) * 0.18 + (Math.random() - 0.5) * 0.006;
      pos[ix + 1] = -0.145 + arch + (Math.random() - 0.5) * 0.005;
      pos[ix + 2] =  0.28  + (Math.random() - 0.5) * 0.008;
    }
  });

  // ── 8. Lèvre inférieure (arc bombé) — 7%
  alloc(Math.floor(count * 0.07), (off, n) => {
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * Math.PI;
      const arch = Math.sin(t) * 0.018;
      const ix = (off + i) * 3;
      pos[ix]     = (i / (n - 1) - 0.5) * 0.16 + (Math.random() - 0.5) * 0.006;
      pos[ix + 1] = -0.175 - arch + (Math.random() - 0.5) * 0.005;
      pos[ix + 2] =  0.28  + (Math.random() - 0.5) * 0.008;
    }
  });

  // ── 9. Pommettes (arcs latéraux) — 8%
  alloc(Math.floor(count * 0.04), (off, n) =>
    ellipseCurve(pos, off, n, -0.22, 0.02, 0.16, 0.04, 0.02, -Math.PI * 0.3, Math.PI * 0.3, 0.01));
  alloc(Math.floor(count * 0.04), (off, n) =>
    ellipseCurve(pos, off, n,  0.22, 0.02, 0.16, 0.04, 0.02, Math.PI * 0.7, Math.PI * 1.3, 0.01));

  // ── 10. Brume holographique (reste) — ~29% en nuage léger autour du visage
  alloc(count - cursor, (off, n) => {
    for (let i = 0; i < n; i++) {
      // Nuage diffus autour du visage (rayon 0.35, centré)
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 0.22 + Math.random() * 0.18; // couche externe
      const ix = (off + i) * 3;
      pos[ix]     = r * Math.sin(phi) * Math.cos(theta) * 0.85;
      pos[ix + 1] = r * Math.sin(phi) * Math.sin(theta) * 1.15 + 0.02;
      pos[ix + 2] = r * Math.cos(phi) * 0.6; // aplati en Z → brume plate
    }
  });

  return pos;
}

function generateWireframe(count: number): Float32Array {
  // Lignes de structure : 8 méridiens verticaux + 6 parallèles horizontales
  const positions = new Float32Array(count * 3);
  const nMer = 8, nPar = 6;
  const perCurve = Math.floor(count / (nMer + nPar));

  let idx = 0;
  // Méridiens
  for (let m = 0; m < nMer; m++) {
    const u = (m / nMer) * Math.PI * 2;
    for (let s = 0; s < perCurve && idx < count; s++, idx++) {
      const v = (s / (perCurve - 1)) * Math.PI;
      const yRaw = 0.52 * Math.cos(v);
      const jawF = yRaw < -0.1 ? 1 - (-yRaw - 0.1) * 0.55 : 1.0;
      positions[idx * 3]     = 0.38 * jawF * Math.sin(v) * Math.cos(u);
      positions[idx * 3 + 1] = yRaw + 0.06;
      positions[idx * 3 + 2] = 0.34 * jawF * Math.sin(v) * Math.sin(u);
    }
  }
  // Parallèles
  for (let p = 0; p < nPar; p++) {
    const v = ((p + 1) / (nPar + 1)) * Math.PI;
    const yRaw = 0.52 * Math.cos(v);
    const jawF = yRaw < -0.1 ? 1 - (-yRaw - 0.1) * 0.55 : 1.0;
    for (let s = 0; s < perCurve && idx < count; s++, idx++) {
      const u = (s / (perCurve - 1)) * Math.PI * 2;
      positions[idx * 3]     = 0.38 * jawF * Math.sin(v) * Math.cos(u);
      positions[idx * 3 + 1] = yRaw + 0.06;
      positions[idx * 3 + 2] = 0.34 * jawF * Math.sin(v) * Math.sin(u);
    }
  }
  return positions;
}

/* ─── Vertex shader ────────────────────────────────────────────────────────── */
const vertexShader = `
  uniform float uTime;
  uniform float uFill;        // 0–1 fill level
  uniform float uDeconstruct; // 0–1 (0=normal, 1=exploded)
  uniform float uSpeaking;    // 0–1
  attribute vec3 aBase;
  attribute float aSeed;
  attribute float aYNorm;     // normalized Y [-1,1] from bottom to top
  varying float vAlpha;
  varying float vY;

  void main() {
    float fill = uFill;
    // Particule visible seulement si son yNorm est dans la zone remplie
    // yNorm -1 = bas, +1 = haut → remplissage du bas vers le haut
    float fillThreshold = mix(-1.0, 1.0, fill);
    float visible = step(aYNorm, fillThreshold);

    // Déconstruction : éclater vers l'extérieur
    vec3 explodeDir = normalize(aBase + vec3(sin(aSeed), cos(aSeed * 1.3), sin(aSeed * 0.7)));
    float explode = uDeconstruct * (0.5 + aSeed * 0.5);

    // Breathing / speaking pulse
    float breath = 1.0 + sin(uTime * 2.5 + aSeed * 6.0) * 0.015;
    float speak = 1.0 + uSpeaking * sin(uTime * 12.0 + aSeed * 10.0) * 0.03;

    vec3 pos = aBase * breath * speak + explodeDir * explode * 1.5;
    vAlpha = visible * (1.0 - uDeconstruct * 0.8);
    vY = pos.y;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    // Points des traits anatomiques plus grands que la brume
    // aYNorm proche de 0 → zone centrale du visage (traits) → points plus visibles
    float isFeature = 1.0 - smoothstep(0.0, 0.25, abs(aBase.z - 0.26)); // traits à z≈0.26-0.31
    float basePt = mix(0.7, 2.2, fill) * mix(0.6, 1.0, isFeature);
    float speakPt = 1.0 + uSpeaking * sin(uTime * 15.0 + aSeed * 8.0) * 0.25;
    gl_PointSize = basePt * speakPt * (1.0 - uDeconstruct * 0.4);
  }
`;

/* ─── Fragment shader ──────────────────────────────────────────────────────── */
const fragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uScanY;  // Y position of scan line (-1 to 1)
  varying float vAlpha;
  varying float vY;

  void main() {
    if (vAlpha < 0.01) discard;

    // Soft gaussian-like point (plus doux que smoothstep)
    vec2 coord = gl_PointCoord - 0.5;
    float d = dot(coord, coord) * 4.0; // 0 au centre, 1 au bord
    float circle = exp(-d * 3.0);      // gaussian → halo vapeur

    // Scan line highlight
    float scanDist = abs(vY - uScanY);
    float scanGlow = smoothstep(0.15, 0.0, scanDist) * 0.6;

    vec3 col = uColor + scanGlow * vec3(0.3, 0.5, 0.8);
    float alpha = vAlpha * circle * (0.5 + scanGlow);
    gl_FragColor = vec4(col, alpha);
  }
`;

/* ─── Composant React ──────────────────────────────────────────────────────── */
export function EmmaHologram3D({
  size = 300,
  progress = 0,
  buildPhase = 'waiting',
  speaking = false,
}: EmmaHologram3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({ progress, buildPhase, speaking });
  propsRef.current = { progress, buildPhase, speaking };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    /* ── Scene ──────────────────────────────────────────────────────────── */
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(0, 0.06, 1.85);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.appendChild(renderer.domElement);

    /* ── Face particles ─────────────────────────────────────────────────── */
    const facePositions = generateFacePoints(PARTICLE_COUNT);
    const seeds = new Float32Array(PARTICLE_COUNT);
    const yNorms = new Float32Array(PARTICLE_COUNT);

    // Compute Y range for normalization
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const y = facePositions[i * 3 + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      seeds[i] = Math.random();
      yNorms[i] = ((facePositions[i * 3 + 1] - minY) / (maxY - minY)) * 2 - 1;
    }

    const faceGeo = new THREE.BufferGeometry();
    faceGeo.setAttribute('position', new THREE.BufferAttribute(facePositions.slice(), 3));
    faceGeo.setAttribute('aBase', new THREE.BufferAttribute(facePositions, 3));
    faceGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    faceGeo.setAttribute('aYNorm', new THREE.BufferAttribute(yNorms, 1));

    const faceMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime:        { value: 0 },
        uFill:        { value: 0 },
        uDeconstruct: { value: 0 },
        uSpeaking:    { value: 0 },
        uColor:       { value: new THREE.Color(0x00e5ff) },
        uScanY:       { value: -1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const facePoints = new THREE.Points(faceGeo, faceMat);
    scene.add(facePoints);

    /* ── Wireframe ──────────────────────────────────────────────────────── */
    const wirePositions = generateWireframe(WIREFRAME_COUNT);
    const wireSeeds = new Float32Array(WIREFRAME_COUNT);
    const wireYNorms = new Float32Array(WIREFRAME_COUNT);
    let wMinY = Infinity, wMaxY = -Infinity;
    for (let i = 0; i < WIREFRAME_COUNT; i++) {
      const y = wirePositions[i * 3 + 1];
      if (y < wMinY) wMinY = y;
      if (y > wMaxY) wMaxY = y;
    }
    for (let i = 0; i < WIREFRAME_COUNT; i++) {
      wireSeeds[i] = Math.random();
      wireYNorms[i] = ((wirePositions[i * 3 + 1] - wMinY) / (wMaxY - wMinY)) * 2 - 1;
    }

    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.BufferAttribute(wirePositions.slice(), 3));
    wireGeo.setAttribute('aBase', new THREE.BufferAttribute(wirePositions, 3));
    wireGeo.setAttribute('aSeed', new THREE.BufferAttribute(wireSeeds, 1));
    wireGeo.setAttribute('aYNorm', new THREE.BufferAttribute(wireYNorms, 1));

    const wireMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime:        { value: 0 },
        uFill:        { value: 0 },
        uDeconstruct: { value: 0 },
        uSpeaking:    { value: 0 },
        uColor:       { value: new THREE.Color(0x00e5ff) },
        uScanY:       { value: -1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    wireMat.uniforms.uColor.value.multiplyScalar(0.5); // wireframe plus discret

    const wirePoints = new THREE.Points(wireGeo, wireMat);
    scene.add(wirePoints);

    /* ── Eyes (ellipses fines dans les orbites, visibles à 80%+) ─────── */
    const eyeGeo = new THREE.SphereGeometry(1, 12, 8);
    const eyeMatL = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0 });
    const eyeMatR = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMatL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMatR);
    // Scale elliptique : large x, comprimé y, plat z
    eyeL.scale.set(0.045, 0.022, 0.008);
    eyeR.scale.set(0.045, 0.022, 0.008);
    eyeL.position.set(-0.135, 0.12, 0.28);
    eyeR.position.set( 0.135, 0.12, 0.28);
    scene.add(eyeL, eyeR);

    /* ── Resize ─────────────────────────────────────────────────────────── */
    const resize = () => {
      const w = host.clientWidth || size;
      const h = host.clientHeight || size;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    /* ── Animation loop ─────────────────────────────────────────────────── */
    let raf = 0;
    const clock = new THREE.Clock();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      const { progress: prog, buildPhase: bp, speaking: spk } = propsRef.current;

      const fill = Math.max(0, Math.min(1, prog / 100));
      const decon = bp === 'deconstruct' ? 1 : bp === 'locked' ? 0.8 : 0;
      const color = PHASE_HEX[bp] ?? 0x00e5ff;
      const scanY = bp === 'reconstruction' || bp === 'camera_on'
        ? Math.sin(t * 1.8) * 0.9
        : -2; // hors champ

      // Update uniforms
      for (const mat of [faceMat, wireMat]) {
        mat.uniforms.uTime.value = t;
        mat.uniforms.uFill.value = fill;
        mat.uniforms.uDeconstruct.value = decon;
        mat.uniforms.uSpeaking.value = spk ? 1 : 0;
        mat.uniforms.uColor.value.setHex(color);
        mat.uniforms.uScanY.value = scanY;
      }

      // Eyes visibility — seulement quand visage bien formé
      const eyeOpacity = fill >= 0.78 && bp !== 'deconstruct' && bp !== 'locked' ? 0.75 : 0;
      eyeMatL.opacity = eyeOpacity;
      eyeMatR.opacity = eyeOpacity;
      eyeMatL.color.setHex(color);
      eyeMatR.color.setHex(color);

      // Slow rotation
      const group = scene;
      facePoints.rotation.y = Math.sin(t * 0.3) * 0.15;
      wirePoints.rotation.y = facePoints.rotation.y;

      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      faceGeo.dispose();
      faceMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      eyeGeo.dispose();
      eyeMatL.dispose();
      eyeMatR.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [size]);

  return (
    <div
      ref={hostRef}
      className="pointer-events-none"
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
