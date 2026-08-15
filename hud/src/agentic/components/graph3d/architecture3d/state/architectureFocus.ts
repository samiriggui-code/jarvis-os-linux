import type { SpatialMode } from '../../../../../spatial/theme/SpatialTheme';
import { lodAtDepth, type PresentationState } from './presentationController';

/** États dérivés du PresentationController — compat composants existants. */
export type ArchitectureLevel = 'L0' | 'L1';

export type ArchitectureFocusState =
  | { mode: 'overview' }
  | { mode: 'process'; processId: string; level: 'L1'; zoom: number }
  | { mode: 'inspect'; processId: string };

export function focusStateFromPresentation(p: PresentationState): ArchitectureFocusState {
  const depth1Lod = lodAtDepth(p, 1);
  const processId = p.stack[0] ?? p.pendingStack?.[0] ?? null;

  if (!processId || (depth1Lod < 0.001 && p.direction === 'idle')) {
    return { mode: 'overview' };
  }
  if (processId === 'core') {
    return { mode: 'process', processId: 'core', level: 'L1', zoom: depth1Lod };
  }
  return { mode: 'overview' };
}

export function architectureLevel(state: ArchitectureFocusState): ArchitectureLevel {
  if (state.mode === 'overview') return 'L0';
  return 'L1';
}

export function focusProcessId(state: ArchitectureFocusState): string | null {
  if (state.mode === 'overview') return null;
  return state.processId;
}

export function processZoom(state: ArchitectureFocusState): number {
  if (state.mode === 'process') return state.zoom;
  if (state.mode === 'inspect') return 1;
  return 0;
}

export function isActiveProcess(state: ArchitectureFocusState, processId: string): boolean {
  return state.mode !== 'overview' && state.processId === processId;
}

export function shouldDimProcess(state: ArchitectureFocusState, processId: string): boolean {
  return state.mode !== 'overview' && state.processId !== processId;
}

export function shouldShowCallout(state: ArchitectureFocusState): boolean {
  return state.mode === 'process' && state.zoom > 0.2 && state.zoom < 0.95;
}

export function shouldShowAgenticPanel(state: ArchitectureFocusState): boolean {
  return state.mode === 'inspect';
}

/** Labels 9 process — opacité inverse du lod du palier 1. */
export function globalProcessLabelOpacity(p: PresentationState): number {
  return 1 - lodAtDepth(p, 1);
}

export function shouldShowProcessLabels(state: ArchitectureFocusState): boolean {
  return state.mode === 'overview' || (state.mode === 'process' && state.zoom < 0.92);
}

/** LOD 0→1 pour NeuralGraph — palier 1 (process). */
export function presentationLod(state: ArchitectureFocusState, p: PresentationState): number {
  return lodAtDepth(p, 1);
}
