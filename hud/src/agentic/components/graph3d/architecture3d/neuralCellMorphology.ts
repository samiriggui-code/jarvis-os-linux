import * as THREE from 'three';

/** RNG déterministe — morphologie stable entre frames. */
export function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type PrototypeNeuronMorphology = {
  somaGeometry: THREE.BufferGeometry;
  dendriteGeometry: THREE.BufferGeometry;
  somaCenter: THREE.Vector3;
};

const SOMA_RADIUS = 0.052;
const MAIN_DENDRITE_COUNT = 6;

/** Soma organique — icosaèdre déformé, asymétrique, pas une sphère. */
export function buildOrganicSomaGeometry(seed: number): THREE.BufferGeometry {
  const rng = createSeededRng(seed);
  const geo = new THREE.IcosahedronGeometry(SOMA_RADIUS, 1);
  const pos = geo.attributes.position!;

  const stretch = new THREE.Vector3(0.92 + rng() * 0.14, 0.78 + rng() * 0.18, 0.88 + rng() * 0.16);

  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i);
    const ny = pos.getY(i);
    const nz = pos.getZ(i);
    const n = 0.84 + rng() * 0.26;
    pos.setXYZ(i, nx * stretch.x * n, ny * stretch.y * n, nz * stretch.z * n);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function pickPerpendicular(dir: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const up = Math.abs(dir.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return out.crossVectors(dir, up).normalize();
}

/** Courbe organique — pas radiale, pas droite. */
function buildOrganicCurve(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  bend: number,
  rng: () => number,
): THREE.CatmullRomCurve3 {
  const side = pickPerpendicular(direction, new THREE.Vector3());
  const side2 = new THREE.Vector3().crossVectors(direction, side).normalize();

  const jitter = () => (rng() - 0.5) * bend;

  const p0 = origin.clone().add(direction.clone().multiplyScalar(SOMA_RADIUS * 0.55));
  const p1 = p0
    .clone()
    .add(direction.clone().multiplyScalar(length * (0.22 + rng() * 0.12)))
    .add(side.clone().multiplyScalar(jitter()))
    .add(side2.clone().multiplyScalar(jitter() * 0.65));
  const p2 = p0
    .clone()
    .add(direction.clone().multiplyScalar(length * (0.55 + rng() * 0.14)))
    .add(side.clone().multiplyScalar(jitter() * 1.35))
    .add(side2.clone().multiplyScalar(jitter() * 0.9));
  const p3 = p0
    .clone()
    .add(direction.clone().multiplyScalar(length))
    .add(side.clone().multiplyScalar(jitter() * 0.45))
    .add(side2.clone().multiplyScalar(jitter() * 0.35));

  return new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
}

function buildBranchCurve(
  anchor: THREE.Vector3,
  parentTangent: THREE.Vector3,
  branchLength: number,
  bend: number,
  rng: () => number,
): THREE.CatmullRomCurve3 {
  const side = pickPerpendicular(parentTangent, new THREE.Vector3());
  const diverge = side
    .clone()
    .multiplyScalar((rng() - 0.5) * 1.6)
    .add(new THREE.Vector3().crossVectors(parentTangent, side).multiplyScalar((rng() - 0.5) * 1.1))
    .normalize();

  const p0 = anchor.clone();
  const p1 = anchor
    .clone()
    .add(diverge.clone().multiplyScalar(branchLength * 0.35))
    .add(parentTangent.clone().multiplyScalar(branchLength * 0.08));
  const p2 = anchor
    .clone()
    .add(diverge.clone().multiplyScalar(branchLength * 0.72))
    .add(parentTangent.clone().multiplyScalar(branchLength * 0.04));
  const p3 = anchor.clone().add(diverge.clone().multiplyScalar(branchLength));

  return new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
}

/** Tube avec taper progressif le long d'une courbe. */
function buildTaperedTubeGeometry(
  curve: THREE.CatmullRomCurve3,
  tubularSegments: number,
  radialSegments: number,
  radiusStart: number,
  radiusEnd: number,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const vertexCount = (tubularSegments + 1) * (radialSegments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices: number[] = [];

  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const pos = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    curve.getPointAt(u, pos);
    curve.getTangentAt(u, tangent);
    if (tangent.lengthSq() < 1e-8) tangent.set(0, 1, 0);
    tangent.normalize();

    if (Math.abs(tangent.y) > 0.999) normal.set(1, 0, 0);
    else normal.set(0, 1, 0);
    binormal.crossVectors(tangent, normal).normalize();
    normal.crossVectors(binormal, tangent).normalize();

    const radius = radiusStart + (radiusEnd - radiusStart) * u * u;

    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = Math.cos(v);

      const cx = pos.x + radius * (cos * normal.x + sin * binormal.x);
      const cy = pos.y + radius * (cos * normal.y + sin * binormal.y);
      const cz = pos.z + radius * (cos * normal.z + sin * binormal.z);

      const nx = cos * normal.x + sin * binormal.x;
      const ny = cos * normal.y + sin * binormal.y;
      const nz = cos * normal.z + sin * binormal.z;

      const vi = i * (radialSegments + 1) + j;
      positions[vi * 3] = cx;
      positions[vi * 3 + 1] = cy;
      positions[vi * 3 + 2] = cz;
      normals[vi * 3] = nx;
      normals[vi * 3 + 1] = ny;
      normals[vi * 3 + 2] = nz;
    }
  }

  const stride = radialSegments + 1;
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (parts.length === 0) return new THREE.BufferGeometry();
  if (parts.length === 1) return parts[0]!;

  let totalVerts = 0;
  let totalIdx = 0;
  for (const g of parts) {
    totalVerts += g.getAttribute('position').count;
    totalIdx += g.index?.count ?? 0;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIdx);

  let vOffset = 0;
  let iOffset = 0;
  for (const g of parts) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
    positions.set(pos.array as Float32Array, vOffset * 3);
    normals.set(nrm.array as Float32Array, vOffset * 3);

    if (g.index) {
      const src = g.index.array as ArrayLike<number>;
      for (let k = 0; k < src.length; k++) {
        indices[iOffset + k] = (src[k] as number) + vOffset;
      }
      iOffset += src.length;
    }
    vOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

/** Morphologie CORE prototype — 6 dendrites, bifurcations asymétriques, 1 axon discret. */
export function buildCorePrototypeMorphology(seed = 4242): PrototypeNeuronMorphology {
  const rng = createSeededRng(seed);
  const origin = new THREE.Vector3(0, 0, 0);
  const somaGeometry = buildOrganicSomaGeometry(seed);

  const tubes: THREE.BufferGeometry[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));

  const specs: Array<{ dir: THREE.Vector3; length: number; isAxon: boolean }> = [];

  for (let i = 0; i < MAIN_DENDRITE_COUNT; i++) {
    const y = MAIN_DENDRITE_COUNT === 1 ? 0 : 1 - (i / (MAIN_DENDRITE_COUNT - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * (i + 1.7) + (rng() - 0.5) * 1.1;
    const dir = new THREE.Vector3(
      Math.cos(theta) * ring + (rng() - 0.5) * 0.42,
      y * 0.85 + (rng() - 0.5) * 0.38,
      Math.sin(theta) * ring + (rng() - 0.5) * 0.42,
    ).normalize();

    const length = 0.14 + rng() * 0.16;
    specs.push({ dir, length, isAxon: false });
  }

  let axonIdx = 0;
  let maxLen = 0;
  specs.forEach((s, i) => {
    if (s.length > maxLen) {
      maxLen = s.length;
      axonIdx = i;
    }
  });
  specs[axonIdx]!.isAxon = true;
  specs[axonIdx]!.length *= 1.28;

  for (let i = 0; i < specs.length; i++) {
    const { dir, length, isAxon } = specs[i]!;
    const bend = 0.06 + rng() * 0.07;
    const mainCurve = buildOrganicCurve(origin, dir, length, bend, rng);

    const baseR = isAxon ? 0.014 : 0.017;
    const tipR = isAxon ? 0.0025 : 0.003;
    tubes.push(buildTaperedTubeGeometry(mainCurve, 18, 5, baseR, tipR));

    const branchCount = Math.floor(rng() * 4);
    for (let b = 0; b < branchCount; b++) {
      const t = 0.38 + rng() * 0.34;
      const anchor = mainCurve.getPointAt(t, new THREE.Vector3());
      const tangent = mainCurve.getTangentAt(t, new THREE.Vector3()).normalize();
      const branchLen = length * (0.22 + rng() * 0.28);
      const branchCurve = buildBranchCurve(anchor, tangent, branchLen, bend * 0.85, rng);
      tubes.push(
        buildTaperedTubeGeometry(
          branchCurve,
          10,
          4,
          baseR * (0.55 + rng() * 0.2),
          tipR * 0.85,
        ),
      );
    }
  }

  return {
    somaGeometry,
    dendriteGeometry: mergeGeometries(tubes),
    somaCenter: origin,
  };
}
