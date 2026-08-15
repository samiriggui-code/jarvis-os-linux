/**
 * DEBUG/PRESENTATION DEMO — valide la cinématique du PresentationController
 * seule, avant tout branchement Core/voix (§19-20 du brief).
 *
 * Scène volontairement minimale et indépendante de architecture3d/ (pas de
 * NeuralGraph, pas de pulses, pas de CodeMap) : 9 sphères + 2 nœuds
 * "factices" (core.architecture, core.architecture.explain) pour exercer
 * enter()/inspect() sans attendre le branchement CodeMap → Neural 3D.
 */
import { useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { StatusCard } from '../../agent/StatusCard';
import { KeyValueList } from '../../data/KeyValueList';
import { architectureGraphLab } from '../adapters/architecture';
import { layoutPositions } from '../layouts';
import { CYAN_HOT } from '../theme';
import type { Vec3 } from '../types';
import { CinematicCamera } from './CinematicCamera';
import { usePresentationController } from './usePresentationController';
import type { PresentationActionType } from './types';

const DEMO_CHILD = 'core.architecture';
const DEMO_LEAF = 'core.architecture.explain';

function useDemoPositions(): Record<string, Vec3> {
  const model = useMemo(() => architectureGraphLab(), []);
  return useMemo(() => {
    const base = layoutPositions(model, 'orb');
    const core = base.core ?? [0, 0, 0];
    // Positions factices — pas de CodeMap branché ici, juste de quoi
    // exercer enter()/inspect() visuellement (autorisé §20 : "enfant
    // factice/actuel de CORE").
    const child: Vec3 = [core[0] + 0.55, core[1] + 0.25, core[2] + 0.4];
    const leaf: Vec3 = [child[0] + 0.22, child[1] - 0.1, child[2] + 0.18];
    return { ...base, [DEMO_CHILD]: child, [DEMO_LEAF]: leaf };
  }, [model]);
}

function cameraPositionFor(nodePos: Vec3, depth: number): Vec3 {
  const distance = depth >= 3 ? 1.0 : depth === 2 ? 1.9 : 3.3;
  const dir = new THREE.Vector3(0.18, 0.35, 1).normalize().multiplyScalar(distance);
  return [nodePos[0] + dir.x, nodePos[1] + dir.y, nodePos[2] + dir.z];
}

function SceneNodes({ positions, focusId }: { positions: Record<string, Vec3>; focusId: string | null }) {
  const ids = Object.keys(positions);
  return (
    <group>
      {ids.map((id) => {
        const p = positions[id]!;
        const isDemo = id === DEMO_CHILD || id === DEMO_LEAF;
        const focused = id === focusId;
        const size = isDemo ? (id === DEMO_LEAF ? 0.05 : 0.08) : 0.13;
        return (
          <mesh key={id} position={p}>
            <sphereGeometry args={[size, 16, 16]} />
            <meshBasicMaterial
              color={focused ? CYAN_HOT : isDemo ? '#5fb4ff' : '#8fb8d8'}
              transparent
              opacity={focused ? 1 : isDemo ? 0.85 : 0.55}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function CameraRig({
  positions,
  targetNodeId,
  depth,
  action,
  onSettled,
}: {
  positions: Record<string, Vec3>;
  targetNodeId: string | null;
  depth: number;
  action: PresentationActionType;
  onSettled: () => void;
}) {
  const nodePos = targetNodeId ? positions[targetNodeId] : null;
  const camPos = nodePos ? cameraPositionFor(nodePos, depth) : null;
  const lookAt = nodePos ?? [0, 0, 0];
  return (
    <CinematicCamera
      targetPosition={camPos}
      lookAt={lookAt}
      action={action}
      onSettled={onSettled}
    />
  );
}

function StageBackground() {
  const { scene } = useThree();
  useMemo(() => {
    scene.background = new THREE.Color('#050914');
  }, [scene]);
  return null;
}

const rowStyle: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' };
const btnStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  fontFamily: 'monospace',
  background: 'rgba(10,132,255,0.12)',
  border: '1px solid rgba(10,132,255,0.4)',
  borderRadius: 6,
  color: '#cfeaff',
  cursor: 'pointer',
};

export function PresentationDemoStage() {
  const { state, controller } = usePresentationController();
  const positions = useDemoPositions();
  const [lastAction, setLastAction] = useState<PresentationActionType>('overview');

  const focusId = state.currentNodeId;
  const nodeLabel = (id: string | null) => {
    if (!id) return null;
    if (id === DEMO_CHILD) return 'architecture/';
    if (id === DEMO_LEAF) return 'explain.py';
    return id.toUpperCase();
  };

  const run = (action: PresentationActionType, nodeId?: string) => {
    setLastAction(action);
    switch (action) {
      case 'overview':
        controller.overview('manual');
        return;
      case 'home':
        controller.home('manual');
        return;
      case 'focus':
        if (nodeId) controller.focus(nodeId, 'manual');
        return;
      case 'enter':
        controller.enter(nodeId ?? DEMO_CHILD, 'manual');
        return;
      case 'inspect':
        controller.inspect(nodeId ?? DEMO_LEAF, 'manual');
        return;
      case 'back':
        controller.back('manual');
        return;
      default:
        return;
    }
  };

  const playSequence = () => {
    // §20 : overview -> focus core -> enter (enfant factice) -> inspect ->
    // back -> back -> home.
    setLastAction('overview');
    controller.overview('guided');
    const t = (ms: number, fn: () => void) => setTimeout(fn, ms);
    t(200, () => {
      setLastAction('focus');
      controller.focus('core', 'guided');
    });
    t(1600, () => {
      setLastAction('enter');
      controller.enter(DEMO_CHILD, 'guided');
    });
    t(3200, () => {
      setLastAction('inspect');
      controller.inspect(DEMO_LEAF, 'guided');
    });
    t(5200, () => {
      setLastAction('back');
      controller.back('guided');
    });
    t(6600, () => {
      setLastAction('back');
      controller.back('guided');
    });
    t(8000, () => {
      setLastAction('home');
      controller.home('guided');
    });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 480 }}>
      <Canvas camera={{ position: [0, 0.6, 8.8], fov: 42 }} gl={{ antialias: true }}>
        <StageBackground />
        <ambientLight intensity={0.4} />
        <SceneNodes positions={positions} focusId={focusId} />
        <CameraRig
          positions={positions}
          targetNodeId={state.mode === 'overview' ? null : state.currentNodeId}
          depth={state.depth}
          action={lastAction}
          onSettled={() => controller.markTransitionSettled()}
        />
      </Canvas>

      {/* Callout léger — mode focus/enter, pas inspect (le vrai panneau prend le relais). */}
      {(state.mode === 'focus' || state.mode === 'enter') && focusId ? (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            color: '#cfeaff',
            fontFamily: 'monospace',
            fontSize: 13,
            background: 'rgba(6,14,28,0.7)',
            border: '1px solid rgba(10,132,255,0.35)',
            borderRadius: 8,
            padding: '6px 10px',
          }}
        >
          {nodeLabel(focusId)}
        </div>
      ) : null}

      {/* Agentic UI réel — seulement en inspect. */}
      {state.mode === 'inspect' && state.agenticContext ? (
        <div style={{ position: 'absolute', top: 16, right: 16, width: 260 }}>
          <StatusCard title={nodeLabel(state.agenticContext) ?? state.agenticContext} tone="info" />
          <div style={{ height: 8 }} />
          <KeyValueList
            rows={[
              { key: 'kind', value: 'file (démo)' },
              { key: 'path', value: 'core/jarvis_core/architecture/explain.py' },
              { key: 'parent', value: 'architecture/' },
              { key: 'process', value: 'CORE' },
            ]}
          />
        </div>
      ) : null}

      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ ...rowStyle }}>
          <button style={btnStyle} onClick={() => run('overview')}>Overview</button>
          <button style={btnStyle} onClick={() => run('focus', 'core')}>Focus Core</button>
          <button style={btnStyle} onClick={() => run('enter')}>Enter</button>
          <button style={btnStyle} onClick={() => run('inspect')}>Inspect</button>
          <button style={btnStyle} onClick={() => run('back')}>Back</button>
          <button style={btnStyle} onClick={() => run('home')}>Home</button>
          <button style={{ ...btnStyle, background: 'rgba(52,199,89,0.15)', borderColor: 'rgba(52,199,89,0.5)' }} onClick={playSequence}>
            ▶ Play séquence
          </button>
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#8fa8c0' }}>
          mode={state.mode} · node={state.currentNodeId ?? '—'} · depth={state.depth} · stack=
          {state.navigationStack.length} · transition={state.transitionState} · origin={state.origin}
        </div>
      </div>
    </div>
  );
}

export default PresentationDemoStage;
