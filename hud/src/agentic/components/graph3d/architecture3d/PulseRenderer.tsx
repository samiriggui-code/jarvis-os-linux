import * as THREE from 'three';
import type { SpatialMode } from '../../../../spatial/theme/SpatialTheme';
import { orbColorFromDTop } from './orbPalette';
import { PULSE_CONFIG, type GraphEdge, type Pulse } from './graphTypes';

const PULSE_RGB = new THREE.Color(PULSE_CONFIG.pulseColor);

function edgePoint(edge: GraphEdge, t: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(
    edge.ax + (edge.bx - edge.ax) * t,
    edge.ay + (edge.by - edge.ay) * t,
    edge.az + (edge.bz - edge.az) * t,
  );
}

/** Une impulsion = un petit segment collinéaire à l'arête (pas de bille, pas de spline). */
function writeFilamentBand(
  positions: Float32Array,
  colors: Float32Array,
  vertIndex: number,
  edge: GraphEdge,
  center: number,
  strength: number,
  scratch: THREE.Vector3,
): number {
  const half = PULSE_CONFIG.pulseLength * 0.5;
  const t0 = Math.max(0, center - half);
  const t1 = Math.min(1, center + half);
  if (t1 - t0 < 1e-4) return vertIndex;

  const i0 = vertIndex * 3;
  edgePoint(edge, t0, scratch);
  positions[i0] = scratch.x;
  positions[i0 + 1] = scratch.y;
  positions[i0 + 2] = scratch.z;
  edgePoint(edge, t1, scratch);
  positions[i0 + 3] = scratch.x;
  positions[i0 + 3 + 1] = scratch.y;
  positions[i0 + 3 + 2] = scratch.z;

  const alpha = PULSE_CONFIG.pulseOpacity * strength;
  colors[i0] = PULSE_RGB.r * alpha;
  colors[i0 + 1] = PULSE_RGB.g * alpha;
  colors[i0 + 2] = PULSE_RGB.b * alpha;
  colors[i0 + 3] = PULSE_RGB.r * alpha;
  colors[i0 + 3 + 1] = PULSE_RGB.g * alpha;
  colors[i0 + 3 + 2] = PULSE_RGB.b * alpha;

  return vertIndex + 2;
}

export function paintScreenGradient(
  positions: Float32Array,
  colors: Float32Array,
  jitters: Float32Array | null,
  vertCount: number,
  mode: SpatialMode,
  modelView: THREE.Matrix4,
  scratch: THREE.Vector3,
  graphIndices?: number[],
) {
  for (let i = 0; i < vertCount; i++) {
    const i3 = i * 3;
    scratch.set(positions[i3]!, positions[i3 + 1]!, positions[i3 + 2]!);
    scratch.normalize();
    scratch.applyMatrix4(modelView);
    const graphIdx = graphIndices ? graphIndices[i]! : i;
    const jitter = jitters ? (jitters[graphIdx] ?? 0) : 0;
    const dTop = Math.max(0, Math.min(1, 0.5 - scratch.y * 0.42 + jitter));
    const c = orbColorFromDTop(dTop, mode);
    colors[i3] = c.r;
    colors[i3 + 1] = c.g;
    colors[i3 + 2] = c.b;
  }
}

/** Couche dédiée — segments actifs uniquement. Le renderer ne choisit pas les chemins. */
export function renderPulseLayer(
  pulses: Pulse[],
  edges: GraphEdge[],
  positions: Float32Array,
  colors: Float32Array,
  scratch: THREE.Vector3,
): number {
  let vert = 0;
  const maxVerts = PULSE_CONFIG.maxPulseSegments * 2;

  for (const pulse of pulses) {
    if (vert >= maxVerts) break;

    if (pulse.phase === 'travel') {
      const edge = edges[pulse.edgeId];
      if (edge) {
        vert = writeFilamentBand(positions, colors, vert, edge, pulse.progress, pulse.energy, scratch);
      }
      continue;
    }

    if (pulse.phase === 'fade') {
      for (const edgeId of pulse.touchedEdges) {
        if (vert >= maxVerts) break;
        const edge = edges[edgeId];
        if (!edge) continue;
        const center = edgeId === pulse.edgeId ? Math.max(pulse.progress, 0.55) : 0.62;
        vert = writeFilamentBand(
          positions,
          colors,
          vert,
          edge,
          center,
          pulse.energy * 0.25,
          scratch,
        );
      }
    }
  }

  return vert;
}

/** Flash nœud — bras de croix plus longs, pas de couleur. */
export function renderNodeFlash(
  pulses: Pulse[],
  nodeSizes: Float32Array,
  baseSizes: Float32Array,
) {
  for (let i = 0; i < baseSizes.length; i++) {
    nodeSizes[i] = baseSizes[i]!;
  }

  for (const pulse of pulses) {
    if (pulse.phase !== 'discharge') continue;
    const t = Math.min(1, pulse.flashElapsed / Math.max(pulse.flashDuration, 1));
    const flash = (1 - t) * (PULSE_CONFIG.nodeFlashSize - 1);
    const node = pulse.currentNodeId;
    nodeSizes[node] = (baseSizes[node] ?? 1) * (1 + flash);
  }
}

/** Micro-point FILE — pixel carré, pas de boule. */
export function createFilePointMaterial(mode: SpatialMode): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: mode === 'light' ? 0.65 : 0.58 },
      uBaseSize: { value: 0.045 },
    },
    vertexShader: `
      attribute vec3 color;
      varying vec3 vColor;
      uniform float uBaseSize;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float depthScale = 280.0 / max(-mv.z, 0.08);
        gl_PointSize = max(uBaseSize * depthScale, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec3 vColor;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        if (max(abs(uv.x), abs(uv.y)) > 0.42) discard;
        gl_FragColor = vec4(vColor, uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
    vertexColors: true,
  });
}

export function createSynapseLineMaterial(mode: SpatialMode): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: mode === 'light' ? 0.92 : PULSE_CONFIG.pulseOpacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
    linewidth: 1,
  });
}

export function createPulseLineMaterial(mode: SpatialMode): THREE.LineBasicMaterial {
  return createSynapseLineMaterial(mode);
}

export function createNodeCrossLineMaterial(mode: SpatialMode): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: mode === 'light' ? 0.92 : 0.88,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
    linewidth: 1,
  });
}
