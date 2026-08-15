import { motion } from 'motion/react';
import { GlassPanel } from '../../../visual/glass';
import { Icon, type IconName } from '../../../visual/Icon';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export type ExecutionStage = 'pending' | 'running' | 'done' | 'failed';

const STAGE_ICON: Record<ExecutionStage, IconName> = {
  pending: 'clock',
  running: 'activity',
  done: 'success',
  failed: 'error',
};
const STAGE_RGB: Record<ExecutionStage, string> = {
  pending: '150, 150, 158',
  running: '10, 132, 255',
  done: '52, 199, 89',
  failed: '255, 59, 48',
};

export interface ExecutionStatusProps {
  label: string;
  stage: ExecutionStage;
}

export function ExecutionStatus({ label, stage }: ExecutionStatusProps) {
  const theme = useSpatialTheme();
  const rgb = STAGE_RGB[stage];
  return (
    <GlassPanel
      material="ultraThin"
      elevation="surface"
      radius="md"
      padding="sm"
      style={{ height: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8 }}
    >
      {stage === 'running' ? (
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} style={{ display: 'flex' }}>
          <Icon name={STAGE_ICON[stage]} size={14} color={`rgb(${rgb})`} />
        </motion.div>
      ) : (
        <Icon name={STAGE_ICON[stage]} size={14} color={`rgb(${rgb})`} />
      )}
      <span style={{ fontSize: 12, color: theme.text }}>{label}</span>
    </GlassPanel>
  );
}

export default ExecutionStatus;
