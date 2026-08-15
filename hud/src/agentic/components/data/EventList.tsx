import { GlassPanel } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';
import type { EventItem, Tone } from '../shared/dataShapes';

const TONE_RGB: Record<Tone, string> = {
  accent: '10, 132, 255',
  success: '52, 199, 89',
  warning: '255, 159, 10',
  danger: '255, 59, 48',
  neutral: '150, 150, 158',
};

export interface EventListProps {
  title?: string;
  items: EventItem[];
}

export function EventList({ title, items }: EventListProps) {
  const theme = useSpatialTheme();
  return (
    <GlassPanel
      material="thin"
      elevation="surface"
      radius="lg"
      padding="md"
      style={{ height: '100%', boxSizing: 'border-box', overflow: 'auto' }}
    >
      {title ? (
        <p style={{ margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: theme.textMuted }}>
          {title}
        </p>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it) => {
          const rgb = TONE_RGB[it.tone ?? 'neutral'];
          return (
            <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: `rgb(${rgb})`, marginTop: 4, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, color: theme.text }}>{it.label}</span>
                  <span style={{ fontSize: 10, color: theme.textMuted, flexShrink: 0 }}>{it.timestamp}</span>
                </div>
                {it.detail ? <p style={{ margin: '2px 0 0', fontSize: 11, color: theme.textMuted }}>{it.detail}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}

export default EventList;
