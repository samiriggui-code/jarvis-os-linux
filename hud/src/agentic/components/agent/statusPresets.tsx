/** ErrorCard/WarningCard/SuccessCard — presets sémantiques de StatusCard, pas 3 renderers. */
import { StatusCard, type StatusCardProps } from './StatusCard';

type Preset = Omit<StatusCardProps, 'tone'>;

export function ErrorCard(props: Preset) {
  return <StatusCard tone="danger" {...props} />;
}

export function WarningCard(props: Preset) {
  return <StatusCard tone="warning" {...props} />;
}

export function SuccessCard(props: Preset) {
  return <StatusCard tone="success" {...props} />;
}
