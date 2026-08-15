import { GlassPanel } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export type ProgressTone = 'cyan' | 'violet' | 'amber' | 'green' | 'danger';
const TONE_RGB: Record<ProgressTone, string> = {
  cyan: '10, 132, 255',
  violet: '94, 92, 230',
  amber: '255, 159, 10',
  green: '52, 199, 89',
  danger: '255, 59, 48',
};

export interface ProgressProps {
  label?: string;
  value: number;
  tone?: ProgressTone;
}

/** Barre linéaire — inspirée de la barre interne (non exportée) de app/components/SystemMonitor.tsx, pas copiée. */
export function Progress({ label, value, tone = 'cyan' }: ProgressProps) {
  const theme = useSpatialTheme();
  const rgb = TONE_RGB[tone];
  const pct = Math.max(0, Math.min(100, value));

  return (
    <GlassPanel
      material="ultraThin"
      elevation="surface"
      radius="md"
      padding="sm"
      style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}
    >
      {label ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: theme.textMuted }}>
          <span>{label}</span>
          <span style={{ color: theme.text }}>{Math.round(pct)}%</span>
        </div>
      ) : null}
      <div style={{ height: 6, borderRadius: 999, background: `rgba(${theme.paper}, 0.12)`, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 999,
            background: `rgb(${rgb})`,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </GlassPanel>
  );
}

export default Progress;
