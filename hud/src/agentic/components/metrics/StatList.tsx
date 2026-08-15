import { GlassPanel } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';
import { StatusIndicator } from './StatusIndicator';

export interface StatListItem {
  label: string;
  status: string;
}

export interface StatListProps {
  title?: string;
  items: StatListItem[];
}

export function StatList({ title, items }: StatListProps) {
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
        {items.map((it, i) => (
          <div key={`${it.label}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: theme.text }}>{it.label}</span>
            <StatusIndicator status={it.status} />
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

export default StatList;
