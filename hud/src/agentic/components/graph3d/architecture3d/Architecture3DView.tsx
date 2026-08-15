import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Canvas } from '@react-three/fiber';
import { useSpatialTheme } from '../../../../spatial/theme/SpatialTheme';
import { SpatialBackdrop } from '../../../../spatial/SpatialBackdrop/SpatialBackdrop';
import type { Graph3DModel } from '../types';
import { nodeById } from './data/architectureAnchors';
import { coreL1FileCount } from './data/codeMapCoreL1';
import { resolveStackFrames } from './data/stackGeometry';
import { NeuralGraph } from './NeuralGraph';
import {
  focusStateFromPresentation,
  globalProcessLabelOpacity,
} from './state/architectureFocus';
import { stackDepth, territoryLodT } from './state/presentationController';
import { usePresentationController } from './state/usePresentationController';
import { ArchitectureAgenticPanel } from './ui/ArchitectureAgenticPanel';
import { ArchitectureCameraRig } from './ui/ArchitectureCameraRig';
import { ArchitecturePresentationDebug } from './ui/ArchitecturePresentationDebug';
import { ContextCallout } from './ui/ContextCallout';
import { CoreInteriorLabelProjector, type CoreInteriorAnchor } from './ui/CoreInteriorLabelProjector';
import { CoreInteriorLabels } from './ui/CoreInteriorLabels';
import { CoreTerritoryLayer } from './ui/CoreTerritoryLayer';
import { ProcessLabels } from './ui/ProcessLabels';
import {
  ProcessLabelProjector,
  type ProcessScreenAnchor,
} from './ui/ProcessLabelProjector';
import { TerritoryLabelProjector, type TerritoryAnchor } from './ui/TerritoryLabelProjector';
import { TerritoryLabels } from './ui/TerritoryLabels';
import { TerritoryLayer } from './ui/TerritoryLayer';
import './architecture3d.css';

export interface Architecture3DViewProps {
  model: Graph3DModel;
  focus?: string | null;
  onFocusChange?: (id: string | null) => void;
  className?: string;
  style?: CSSProperties;
  /** Contrôles DEV — OVERVIEW / ENTER CORE / BACK / HOME */
  presentationDebug?: boolean;
}

export function Architecture3DView({
  model,
  focus = null,
  onFocusChange,
  className,
  style,
  presentationDebug = false,
}: Architecture3DViewProps) {
  const { mode } = useSpatialTheme();
  const stageRef = useRef<HTMLElement>(null);
  const { controller, state: presentation } = usePresentationController();
  const focusState = useMemo(() => focusStateFromPresentation(presentation), [presentation]);
  const [screenAnchors, setScreenAnchors] = useState<ProcessScreenAnchor[]>([]);
  const [coreAnchors, setCoreAnchors] = useState<CoreInteriorAnchor[]>([]);
  const [territoryAnchors, setTerritoryAnchors] = useState<TerritoryAnchor[]>([]);

  const processIds = useMemo(() => model.nodes.map((n) => n.id), [model.nodes]);
  const globalLabelOpacity = globalProcessLabelOpacity(presentation);
  const territoryLod = territoryLodT(presentation);

  // Palier 2 (directory/territoire) générique — dérivé de la pile active,
  // pas d'un "territoryId" dédié. Fonctionnera pour n'importe quel process
  // une fois que d'autres L1 datasets existeront (aujourd'hui seul CORE).
  const longerStack =
    presentation.pendingStack && presentation.pendingStack.length > presentation.stack.length
      ? presentation.pendingStack
      : presentation.stack;
  const stackFrames = useMemo(() => resolveStackFrames(longerStack), [longerStack]);
  const territoryFrame = stackFrames[1] ?? null;
  const territoryChildren = territoryFrame?.children ?? [];
  const territoryCenter = territoryFrame?.position ?? null;

  const focusNode = nodeById(
    model,
    focusState.mode === 'overview' ? null : focusState.processId,
  );

  const syncFocusProp = useCallback(
    (id: string | null) => {
      onFocusChange?.(id);
    },
    [onFocusChange],
  );

  const handleEnterCore = useCallback(() => {
    controller.enter('core');
    syncFocusProp('core');
  }, [controller, syncFocusProp]);

  const handleBack = useCallback(() => {
    controller.back();
    syncFocusProp(null);
  }, [controller, syncFocusProp]);

  const handleHome = useCallback(() => {
    controller.home();
    syncFocusProp(null);
  }, [controller, syncFocusProp]);

  const handleOverview = useCallback(() => {
    controller.overview();
    syncFocusProp(null);
  }, [controller, syncFocusProp]);

  /** L1 CORE → L2. Générique (enterNode), câblé ici uniquement sur architecture/ pour ce jalon. */
  const handleEnterArchitecture = useCallback(() => {
    controller.enterNode('repo:core/jarvis_core/architecture');
  }, [controller]);

  const handleSelectProcess = useCallback(
    (processId: string) => {
      if (processId !== 'core') return;
      handleEnterCore();
    },
    [handleEnterCore],
  );

  const handleInspectProcess = useCallback(
    (processId: string) => {
      if (processId !== 'core') return;
      syncFocusProp(processId);
      // inspect panel — hors scope L1, conservé pour double-clic dev
    },
    [syncFocusProp],
  );

  const handlePointerMiss = useCallback(() => {
    // Profondeur > 0 (réglée ou visée) : un pas en arrière. Sinon overview.
    if (stackDepth(presentation) > 0) {
      handleBack();
    } else {
      handleOverview();
    }
  }, [presentation, handleBack, handleOverview]);

  return (
    <main
      className={className ? `architecture-shell ${className}` : 'architecture-shell'}
      style={style}
      data-graph3d
      data-spatial-mode={mode}
      data-arch-depth={stackDepth(presentation)}
    >
      <SpatialBackdrop mode={mode} />
      <ArchitectureAgenticPanel focusState={focusState} focusNode={focusNode} />
      {presentationDebug ? (
        <ArchitecturePresentationDebug
          presentation={presentation}
          onOverview={handleOverview}
          onEnterCore={handleEnterCore}
          onEnterArchitecture={handleEnterArchitecture}
          onBack={handleBack}
          onHome={handleHome}
        />
      ) : null}
      <section
        ref={stageRef}
        className="architecture-stage"
        aria-label="JARVIS architecture neural view"
      >
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [0, 0, 8.8], fov: 42 }}
          gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
          onPointerMissed={handlePointerMiss}
        >
          <ambientLight intensity={mode === 'light' ? 0.55 : 0.35} />
          <NeuralGraph model={model} mode={mode} presentation={presentation} />
          <CoreTerritoryLayer presentation={presentation} mode={mode} />
          <TerritoryLayer nodes={territoryChildren} center={territoryCenter} lod={territoryLod} mode={mode} />
          <ProcessLabelProjector
            processIds={processIds}
            containerRef={stageRef}
            onAnchorsUpdate={setScreenAnchors}
          />
          <CoreInteriorLabelProjector
            presentation={presentation}
            containerRef={stageRef}
            onAnchorsUpdate={setCoreAnchors}
          />
          <TerritoryLabelProjector
            nodes={territoryChildren}
            center={territoryCenter}
            lod={territoryLod}
            containerRef={stageRef}
            onAnchorsUpdate={setTerritoryAnchors}
          />
          <ArchitectureCameraRig presentation={presentation} />
        </Canvas>
        <ProcessLabels
          model={model}
          anchors={screenAnchors}
          focusState={focusState}
          labelOpacity={globalLabelOpacity}
          onSelectProcess={handleSelectProcess}
          onInspectProcess={handleInspectProcess}
        />
        <CoreInteriorLabels
          anchors={coreAnchors}
          presentation={presentation}
          globalLabelOpacity={globalLabelOpacity}
        />
        <TerritoryLabels anchors={territoryAnchors} lod={territoryLod} globalLabelOpacity={globalLabelOpacity} />
        <ContextCallout
          model={model}
          focusState={focusState}
          anchors={screenAnchors}
          fileCount={coreL1FileCount()}
        />
      </section>
    </main>
  );
}
