/**
 * Dossiers CodeMap L2 — Neural 3D (palier intérieur process).
 *
 * Source : core/jarvis_core/architecture/code_map.py
 * Fichier JSON : ./codeMapProcessDirs.json (généré, ne pas éditer à la main)
 *
 * Après changement d'arborescence repo (nouveau dossier, déplacement…) :
 *   cd hud
 *   npm run graph3d:code-map
 *
 * Puis recharger la scène Graph3D.
 */
import type { SpatialMode } from '../../../../spatial/theme/SpatialTheme';
import { lerp } from '../state/presentationEasing';

export type CodeMapDir = {
  id: string;
  name: string;
  path: string;
  depth: number;
};

import raw from '../data/codeMapProcessDirs.json';

const DATA = raw as {
  schemaVersion: string;
  processes: Record<string, CodeMapDir[]>;
};

export function codeMapDirsForProcess(processId: string): CodeMapDir[] {
  return DATA.processes[processId] ?? [];
}

export function codeMapSchemaVersion(): string {
  return DATA.schemaVersion;
}

function tierVisibilityL0(
  tier: 'file' | 'folder' | 'module' | 'subsystem' | 'major_process',
  mode: SpatialMode,
): number {
  const dark = mode === 'night';
  if (dark) {
    if (tier === 'major_process') return 1;
    if (tier === 'subsystem') return 0.82;
    if (tier === 'module') return 0.62;
    if (tier === 'folder') return 0.48;
    return 0.34;
  }
  if (tier === 'major_process') return 1;
  if (tier === 'subsystem') return 0.42;
  if (tier === 'module') return 0.28;
  if (tier === 'folder') return 0.16;
  return 0.1;
}

function tierVisibilityL1Core(
  tier: 'file' | 'folder' | 'module' | 'subsystem' | 'major_process',
  mode: SpatialMode,
  isCoreMajor: boolean,
  ownedByCore: boolean,
): number {
  const dark = mode === 'night';
  if (tier === 'major_process') {
    if (isCoreMajor) return 1;
    return dark ? 0.22 : 0.18;
  }
  if (!ownedByCore) return dark ? 0.1 : 0.06;
  if (tier === 'subsystem') return dark ? 0.72 : 0.58;
  if (tier === 'module') return dark ? 0.52 : 0.4;
  if (tier === 'folder') return dark ? 0.28 : 0.2;
  return dark ? 0.14 : 0.08;
}

/** Opacité LOD L0↔L1 — stats réelles, compression visuelle sqrt côté territoire. */
export function tierVisibilityAtLevel(
  tier: 'file' | 'folder' | 'module' | 'subsystem' | 'major_process',
  lod: number,
  mode: SpatialMode,
  coreMajorIndex: number,
  nodeMajorIndex: number,
): number {
  const isCoreMajor = nodeMajorIndex === coreMajorIndex;
  const ownedByCore = nodeMajorIndex === coreMajorIndex;
  const l0 = tierVisibilityL0(tier, mode);
  const l1 = tierVisibilityL1Core(tier, mode, isCoreMajor, ownedByCore);
  return lerp(l0, l1, lod);
}
