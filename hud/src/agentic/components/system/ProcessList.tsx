/** Inspiré de la liste de process interne (non exportée) de app/components/SystemMonitor.tsx, pas copiée. */
import { GlassPanel } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface ProcessRow {
  name: string;
  cpu: string;
  memory: string;
}

export interface ProcessListProps {
  title?: string;
  rows: ProcessRow[];
}

export function ProcessList({ title, rows }: ProcessListProps) {
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', fontSize: 10, color: theme.textMuted, padding: '2px 0', borderBottom: `1px solid rgba(${theme.paper}, 0.1)` }}>
          <span style={{ flex: 1 }}>Process</span>
          <span style={{ width: 56, textAlign: 'right' }}>CPU</span>
          <span style={{ width: 56, textAlign: 'right' }}>RAM</span>
        </div>
        {rows.map((r, i) => (
          <div key={`${r.name}-${i}`} style={{ display: 'flex', fontSize: 12, color: theme.text, padding: '4px 0' }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            <span style={{ width: 56, textAlign: 'right', color: theme.textMuted }}>{r.cpu}</span>
            <span style={{ width: 56, textAlign: 'right', color: theme.textMuted }}>{r.memory}</span>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

export default ProcessList;
