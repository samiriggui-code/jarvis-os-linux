/**
 * CPUCard/MemoryCard/DiskCard/NetworkCard — presets sémantiques de
 * `metrics/MetricCard`, pas 4 renderers indépendants (règle de consolidation
 * du plan). Inspirés de la tuile interne (non exportée) de
 * `app/components/SystemMonitor.tsx`, pas copiés.
 */
import { MetricCard, type MetricCardProps } from '../metrics/MetricCard';

type Preset = Omit<MetricCardProps, 'label' | 'icon' | 'tone'> & { label?: string };

export function CPUCard(props: Preset) {
  return <MetricCard label="CPU" icon="cpu" tone="cyan" {...props} />;
}

export function MemoryCard(props: Preset) {
  return <MetricCard label="Mémoire" icon="memory" tone="violet" {...props} />;
}

export function DiskCard(props: Preset) {
  return <MetricCard label="Disque" icon="disk" tone="amber" {...props} />;
}

export function NetworkCard(props: Preset) {
  return <MetricCard label="Réseau" icon="network" tone="green" {...props} />;
}
