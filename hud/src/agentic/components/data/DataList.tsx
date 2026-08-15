import { GlassPanel } from '../../../visual/glass';
import { Icon, type IconName } from '../../../visual/Icon';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';
import { StatusIndicator } from '../metrics/StatusIndicator';

export interface DataListItem {
  icon?: IconName;
  label: string;
  value?: string;
  status?: string;
}

export interface DataListProps {
  title?: string;
  items: DataListItem[];
}

export function DataList({ title, items }: DataListProps) {
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
          <div key={`${it.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {it.icon ? <Icon name={it.icon} size={14} color={theme.textMuted} /> : null}
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: theme.text }}>{it.label}</span>
            {it.value ? <span style={{ fontSize: 12, color: theme.textMuted, flexShrink: 0 }}>{it.value}</span> : null}
            {it.status ? <StatusIndicator status={it.status} /> : null}
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

export default DataList;
