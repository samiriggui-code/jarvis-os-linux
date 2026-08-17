import type { Graph3DModel } from '../types';
import type { NodeTier, TierCounts } from './graphTypes';

/**
 * Audit filesystem prod — 2026-08-14
 *
 * Racines : core/jarvis_core, hud/src, dashboard/src, deploy
 * Exclus  : vendor, node_modules, __pycache__, _smoke_*, tests, locks, dot dirs
 * Regénérer :
 *   python scripts/audit-neural-tier-budget.py
 */
export const PROD_FILESYSTEM_AUDIT = {
  /** Graph3DModel — 9 nœuds sémantiques (CORE, BRIDGE, …) */
  majorProcess: 9,
  /** Dossiers 1er niveau core/jarvis_core (agents, auth, memory, …) */
  subsystem: 16,
  /** Sous-packages prod (jarvis_core, hud/src, dashboard — 2e niveau) */
  module: 30,
  /** Répertoires source restants */
  folder: 121,
  /** Fichiers source (.py .ts .tsx .yaml .json .css) */
  file: 576,
  /** Synapses sémantiques architectureLabSnapshot.connections */
  synapse: 19,
} as const;

export function computeNeuralTierBudget(model: Graph3DModel): TierCounts {
  return {
    major_process: model.nodes.length,
    subsystem: PROD_FILESYSTEM_AUDIT.subsystem,
    module: PROD_FILESYSTEM_AUDIT.module,
    folder: PROD_FILESYSTEM_AUDIT.folder,
    file: PROD_FILESYSTEM_AUDIT.file,
  };
}

export function totalNeuralNodes(budget: TierCounts): number {
  return (
    budget.major_process +
    budget.subsystem +
    budget.module +
    budget.folder +
    budget.file
  );
}

export function tierAtIndex(budget: TierCounts, index: number): NodeTier {
  let cursor = 0;
  const order: NodeTier[] = [
    'major_process',
    'subsystem',
    'module',
    'folder',
    'file',
  ];
  for (const tier of order) {
    cursor += budget[tier];
    if (index < cursor) return tier;
  }
  return 'file';
}
