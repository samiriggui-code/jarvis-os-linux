import { GlassCard } from '../../../visual/glass';
import { Icon, type IconName } from '../../../visual/Icon';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';
import { StatusIndicator } from '../metrics/StatusIndicator';

export interface DeviceCardProps {
  icon?: IconName;
  name: string;
  status: string;
  detail?: string;
}

export function DeviceCard({ icon, name, status, detail }: DeviceCardProps) {
  const theme = useSpatialTheme();
  return (
    <GlassCard
      material="thin"
      elevation="elevated"
      radius="lg"
      padding="md"
      style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {icon ? <Icon name={icon} size={16} color={theme.textMuted} /> : null}
          <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>
        </div>
        <StatusIndicator status={status} />
      </div>
      {detail ? <p style={{ margin: 0, fontSize: 11, color: theme.textMuted }}>{detail}</p> : null}
    </GlassCard>
  );
}

export default DeviceCard;
