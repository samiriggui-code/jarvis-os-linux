import { useEffect, useMemo, useRef } from 'react';

import { useFrame } from '@react-three/fiber';

import * as THREE from 'three';

import type { SpatialMode } from '../../../../spatial/theme/SpatialTheme';

import type { Graph3DModel } from '../types';

import { tierVisibilityAtLevel } from './data/codeMapProcessDirs';

import { buildNeuralGraph } from './neuralGraphBuild';

import { PulseSimulation } from './PulseSimulation';

import {

  createNodeCrossLineMaterial,

  createSynapseLineMaterial,

  paintScreenGradient,

  renderNodeFlash,

  renderPulseLayer,

} from './PulseRenderer';

import { PULSE_CONFIG, type NodeTier } from './graphTypes';

import {

  nodeCrossVertCount,

  paintNodeCrossGradient,

  writeNodeCrossPositions,

  VERTS_PER_NODE_CROSS,

} from './nodeCross';

import {
  architectureLevel,
} from './state/architectureFocus';
import { INITIAL_PRESENTATION, presentationLodT, type PresentationState } from './state/presentationController';
import { lerp } from './state/presentationEasing';

export type NeuralGraphProps = {
  model?: Graph3DModel;
  mode?: SpatialMode;
  presentation?: PresentationState;
};



function applyNodeCrossVisibility(

  colors: Float32Array,

  nodeCount: number,

  visibility: Float32Array,

): void {

  for (let i = 0; i < nodeCount; i++) {

    const v = visibility[i] ?? 1;

    for (let k = 0; k < VERTS_PER_NODE_CROSS; k++) {

      const vi = (i * VERTS_PER_NODE_CROSS + k) * 3;

      colors[vi]! *= v;

      colors[vi + 1]! *= v;

      colors[vi + 2]! *= v;

    }

  }

}



function buildVisibility(
  graph: ReturnType<typeof buildNeuralGraph>,
  presentation: PresentationState,
  mode: SpatialMode,
): { nodes: Float32Array; lines: number } {
  const lod = presentationLodT(presentation);
  const coreMajor = graph.majorIds.indexOf('core');
  const dark = mode === 'night';

  const nodes = new Float32Array(graph.count);
  for (let i = 0; i < graph.count; i++) {
    const tier = graph.nodeTiers[i] as NodeTier;
    const owner = graph.nodeMajorIndex[i] ?? 0;
    nodes[i] = tierVisibilityAtLevel(tier, lod, mode, coreMajor, owner);
  }

  const lineL0 = dark ? 1 : 0.58;
  const lineL1 = 0.88;
  const lineMul = lerp(lineL0, lineL1, lod);

  return { nodes, lines: lineMul };
}

export function NeuralGraph({
  model,
  mode = 'night',
  presentation = INITIAL_PRESENTATION,
}: NeuralGraphProps) {

  const group = useRef<THREE.Group>(null);

  const pulseMesh = useRef<THREE.LineSegments>(null);

  const seeded = useRef(false);

  const modelView = useMemo(() => new THREE.Matrix4(), []);

  const scratch = useMemo(() => new THREE.Vector3(), []);

  const simulation = useMemo(() => new PulseSimulation(), []);

  const graph = useMemo(() => buildNeuralGraph(model), [model]);

  const liveSizes = useMemo(() => graph.nodeSizes.slice(), [graph]);



  const pulsePositions = useMemo(

    () => new Float32Array(PULSE_CONFIG.maxPulseSegments * 2 * 3),

    [],

  );

  const pulseColors = useMemo(

    () => new Float32Array(PULSE_CONFIG.maxPulseSegments * 2 * 3),

    [],

  );



  const crossVertCount = nodeCrossVertCount(graph.count);



  const { nodeCrossGeo, nodeCrossMat, lineGeo, lineMat, pulseGeo, pulseMat } = useMemo(() => {

    const crossPositions = new Float32Array(crossVertCount * 3);

    writeNodeCrossPositions(graph.positions, graph.nodeSizes, graph.count, crossPositions);



    const crossColors = new Float32Array(crossVertCount * 3);

    const nodeCrossGeo = new THREE.BufferGeometry();

    nodeCrossGeo.setAttribute('position', new THREE.BufferAttribute(crossPositions, 3));

    nodeCrossGeo.setAttribute('color', new THREE.BufferAttribute(crossColors, 3));



    const nodeCrossMat = createNodeCrossLineMaterial(mode);



    const lineColors = new Float32Array(graph.lineVertCount * 3);

    const lineGeo = new THREE.BufferGeometry();

    lineGeo.setAttribute('position', new THREE.BufferAttribute(graph.linePositions, 3));

    lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));



    const lineMat = new THREE.LineBasicMaterial({

      vertexColors: true,

      transparent: true,

      opacity: mode === 'light' ? 0.82 : 0.44,

      depthWrite: false,

      blending: THREE.NormalBlending,

      toneMapped: false,

    });



    const pulseGeo = new THREE.BufferGeometry();

    pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePositions, 3));

    pulseGeo.setAttribute('color', new THREE.BufferAttribute(pulseColors, 3));

    pulseGeo.setDrawRange(0, 0);



    const pulseMat = createSynapseLineMaterial(mode);



    return { nodeCrossGeo, nodeCrossMat, lineGeo, lineMat, pulseGeo, pulseMat };

  }, [graph, mode, crossVertCount, pulseColors, pulsePositions]);



  useEffect(() => {

    if (pulseMesh.current) {

      pulseMesh.current.renderOrder = 50;

    }

  }, []);



  useEffect(

    () => () => {

      nodeCrossGeo.dispose();

      nodeCrossMat.dispose();

      lineGeo.dispose();

      lineMat.dispose();

      pulseGeo.dispose();

      pulseMat.dispose();

    },

    [nodeCrossGeo, nodeCrossMat, lineGeo, lineMat, pulseGeo, pulseMat],

  );



  useFrame(({ camera }, delta) => {

    if (!group.current) return;



    group.current.rotation.y += delta * 0.035;

    group.current.updateMatrixWorld();



    if (!seeded.current) {

      seeded.current = true;

      simulation.seed(graph);

    }



    modelView.multiplyMatrices(camera.matrixWorldInverse, group.current.matrixWorld);

    simulation.tick(delta, graph);



    renderNodeFlash(simulation.pulses, liveSizes, graph.nodeSizes);



    const crossPosAttr = nodeCrossGeo.getAttribute('position') as THREE.BufferAttribute;

    writeNodeCrossPositions(

      graph.positions,

      liveSizes,

      graph.count,

      crossPosAttr.array as Float32Array,

    );



    const crossColorAttr = nodeCrossGeo.getAttribute('color') as THREE.BufferAttribute;

    paintNodeCrossGradient(

      graph.positions,

      crossColorAttr.array as Float32Array,

      graph.jitters,

      graph.count,

      mode,

      modelView,

      scratch,

    );



    const lineColorAttr = lineGeo.getAttribute('color') as THREE.BufferAttribute;

    paintScreenGradient(

      graph.linePositions,

      lineColorAttr.array as Float32Array,

      null,

      graph.lineVertCount,

      mode,

      modelView,

      scratch,

    );



    const vis = buildVisibility(graph, presentation, mode);
    const lod = presentationLodT(presentation);

    applyNodeCrossVisibility(crossColorAttr.array as Float32Array, graph.count, vis.nodes);



    const lineColors = lineColorAttr.array as Float32Array;

    for (let i = 0; i < graph.lineVertCount * 3; i++) {

      lineColors[i]! *= vis.lines;

    }



    const level = architectureLevel(
      lod < 0.02 ? { mode: 'overview' } : { mode: 'process', processId: 'core', level: 'L1', zoom: lod },
    );
    const lineBase = mode === 'light' ? 0.82 : 0.44;
    const lineLevelScale = level === 'L0' && mode === 'night' ? lerp(1, vis.lines, lod) : 0.48 + vis.lines * 0.52;
    lineMat.opacity = lineBase * lineLevelScale;



    const pulsePosAttr = pulseGeo.getAttribute('position') as THREE.BufferAttribute;

    const pulseColAttr = pulseGeo.getAttribute('color') as THREE.BufferAttribute;

    const pulseVerts = renderPulseLayer(

      simulation.pulses,

      graph.edgeSegments,

      pulsePosAttr.array as Float32Array,

      pulseColAttr.array as Float32Array,

      scratch,

    );

    pulseGeo.setDrawRange(0, pulseVerts);



    crossPosAttr.needsUpdate = true;

    crossColorAttr.needsUpdate = true;

    lineColorAttr.needsUpdate = true;

    pulsePosAttr.needsUpdate = true;

    pulseColAttr.needsUpdate = true;

  });



  return (

    <group ref={group}>

      <lineSegments geometry={lineGeo} material={lineMat} raycast={() => null} />

      <lineSegments geometry={nodeCrossGeo} material={nodeCrossMat} raycast={() => null} />

      <lineSegments ref={pulseMesh} geometry={pulseGeo} material={pulseMat} raycast={() => null} />

    </group>

  );

}



export const NeuralSphere = NeuralGraph;

export const Sphere3D = NeuralGraph;

