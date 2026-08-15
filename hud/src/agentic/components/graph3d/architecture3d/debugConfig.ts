import type { NodeTier, TierCounts } from './graphTypes';

export type { TierCounts };

/** Preuves visuelles obtenues — mode prod avec tailles exagérées. */
export const DEBUG_NODE_SIZE = false;
export const DEBUG_SINGLE_PULSE = false;

export function countTiers(tiers: NodeTier[]): TierCounts {
  const counts: TierCounts = {
    file: 0,
    folder: 0,
    module: 0,
    subsystem: 0,
    major_process: 0,
  };
  for (const tier of tiers) counts[tier]++;
  return counts;
}
