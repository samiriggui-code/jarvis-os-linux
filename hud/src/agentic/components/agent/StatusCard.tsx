/** Base UNIQUE pour ErrorCard/WarningCard/SuccessCard (et DiagnosticCard) — un renderer, des presets de tone. */
import type { ReactNode } from 'react';
import { GlassCard } from '../../../visual/glass';
import { Icon, type IconName } from '../../../visual/Icon';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export type StatusCardTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_RGB: Record<StatusCardTone, string> = {
  success: '52, 199, 89',
  warning: '255, 159, 10',
  danger: '255, 59, 48',
  info: '10, 132, 255',
  neutral: '150, 150, 158',
};
const TONE_ICON: Record<StatusCardTone, IconName> = {
  success: 'success',
  warning: 'warning',
  danger: 'error',
  info: 'info',
  neutral: 'info',
};

export interface StatusCardProps {
  title: string;
  body?: string;
  tone?: StatusCardTone;
  icon?: IconName;
  actions?: ReactNode;
}

export function StatusCard({ title, body, tone = 'neutral', icon, actions }: StatusCardProps) {
  const theme = useSpatialTheme();
  const rgb = TONE_RGB[tone];
  return (
    <GlassCard
      material="thin"
      elevation="elevated"
      radius="lg"
      padding="md"
      style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon ?? TONE_ICON[tone]} size={16} color={`rgb(${rgb})`} />
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{title}</span>
      </div>
      {body ? <p style={{ margin: 0, fontSize: 12, color: theme.textMuted }}>{body}</p> : null}
      {actions ? <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>{actions}</div> : null}
    </GlassCard>
  );
}

export default StatusCard;
