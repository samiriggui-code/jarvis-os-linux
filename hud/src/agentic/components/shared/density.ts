/**
 * `preferred/compact/collapsed/expanded/focus` (demandé) se réconcilie sur
 * `InfoDensity` (déjà existant, `layout/tokens.ts`, déjà partiellement
 * implémenté par `layout/MetricTile.tsx`) — généralisé, pas réinventé.
 */
import type { LayoutSnapshotEntry } from '../../layout/snapshot';
import type { InfoDensity } from '../../layout/tokens';

export function tierToDensity(entry: LayoutSnapshotEntry, opts?: { focused?: boolean }): InfoDensity {
  if (opts?.focused) return 'focus';
  if (entry.state === 'expanded') return 'detailed';
  if (entry.tier === 'compact') return 'compact';
  return 'standard';
}
