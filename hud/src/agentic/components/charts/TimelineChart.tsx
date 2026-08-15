/**
 * TimelineChart — pas de mapping recharts naturel (frise horizontale
 * d'événements), donc composant bespoke. Partage `EventItem` avec `EventList`
 * (Structured Data) : une frise est conceptuellement une EventList à
 * l'horizontale.
 */
import { GlassCard } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';
import type { EventItem, Tone } from '../shared/dataShapes';

const TONE_RGB: Record<Tone, string> = {
  accent: '10, 132, 255',
  success: '52, 199, 89',
  warning: '255, 159, 10',
  danger: '255, 59, 48',
  neutral: '150, 150, 158',
};

export interface TimelineChartProps {
  label?: string;
  items: EventItem[];
}

export function TimelineChart({ label, items }: TimelineChartProps) {
  const theme = useSpatialTheme();
  return (
    <GlassCard
      material="thin"
      elevation="elevated"
      radius="lg"
      padding="md"
      style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}
    >
      {label ? (
        <p style={{ margin: '0 0 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: theme.textMuted }}>
          {label}
        </p>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', display: 'flex', alignItems: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: `rgba(${theme.paper}, 0.14)` }} />
        <div style={{ display: 'flex', gap: 24, position: 'relative', paddingInline: 8 }}>
          {items.map((it) => {
            const rgb = TONE_RGB[it.tone ?? 'neutral'];
            return (
              <div key={it.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 72 }}>
                <span style={{ fontSize: 10, color: theme.textMuted }}>{it.timestamp}</span>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: `rgb(${rgb})`, border: `2px solid rgba(${theme.paper}, 0.2)` }} />
                <span style={{ fontSize: 11, color: theme.text, textAlign: 'center' }}>{it.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}

export default TimelineChart;
