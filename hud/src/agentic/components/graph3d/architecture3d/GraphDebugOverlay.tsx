import type { TierCounts } from './debugConfig';

type DebugOverlayProps = {
  tierCounts: TierCounts;
  progress: number;
  pulseVerts: number;
};

export function GraphDebugOverlay({ tierCounts, progress, pulseVerts }: DebugOverlayProps) {
  const majorOk = tierCounts.major_process === 9;

  return (
    <div className="graph-debug-overlay" aria-live="polite">
      <div className="graph-debug-overlay__title">DEBUG VISUEL</div>
      <div className="graph-debug-overlay__section">
        <div>TIER COUNTS</div>
        <div>file: {tierCounts.file}</div>
        <div>folder: {tierCounts.folder}</div>
        <div>module: {tierCounts.module}</div>
        <div>subsystem: {tierCounts.subsystem}</div>
        <div className={majorOk ? '' : 'graph-debug-overlay__warn'}>
          major_process: {tierCounts.major_process}
          {!majorOk ? ' ← attendu 9' : ''}
        </div>
      </div>
      <div className="graph-debug-overlay__section">
        <div>SINGLE PULSE</div>
        <div>progress: {progress.toFixed(2)}</div>
        <div>pulseVerts: {pulseVerts}</div>
      </div>
    </div>
  );
}
