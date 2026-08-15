/**
 * ServerStatus/ServiceStatus/RuntimeHealth/SystemHealth/UptimeCard/
 * HealthOverview — addendum admin/observabilité. Presets/compositions de
 * ServiceList/StatusCard/MetricCard/StatList existants, pas de nouveaux
 * renderers indépendants.
 */
import { StatusCard, type StatusCardProps } from '../agent/StatusCard';
import { MetricCard, type MetricCardProps } from '../metrics/MetricCard';
import { StatList, type StatListItem } from '../metrics/StatList';
import { StatusIndicator } from '../metrics/StatusIndicator';
import { ServiceList, type ServiceListItem } from './ServiceList';

export function ServerStatus(props: { title?: string; subtitle?: string; services: ServiceListItem[] }) {
  return <ServiceList title={props.title ?? 'Serveur'} subtitle={props.subtitle} services={props.services} />;
}

export { StatusIndicator as ServiceStatus };

type HealthPreset = Omit<StatusCardProps, 'icon'>;

export function RuntimeHealth(props: HealthPreset) {
  return <StatusCard icon="server" {...props} />;
}

export function SystemHealth(props: HealthPreset) {
  return <StatusCard icon="activity" {...props} />;
}

type UptimePreset = Omit<MetricCardProps, 'label' | 'icon'> & { label?: string };

export function UptimeCard(props: UptimePreset) {
  return <MetricCard label="Uptime" icon="clock" {...props} />;
}

export interface HealthOverviewProps {
  services: StatListItem[];
  uptime?: string;
  cpu?: number;
  memory?: number;
}

/** Composition (pas un preset unique) : StatList + une rangée compacte de MetricCard — toujours des pièces existantes. */
export function HealthOverview({ services, uptime, cpu, memory }: HealthOverviewProps) {
  const hasMetrics = uptime !== undefined || cpu !== undefined || memory !== undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      {hasMetrics ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, flexShrink: 0, height: 110 }}>
          {uptime !== undefined ? <MetricCard label="Uptime" value={uptime} icon="clock" density="compact" /> : null}
          {cpu !== undefined ? <MetricCard label="CPU" value={String(cpu)} unit="%" icon="cpu" density="compact" /> : null}
          {memory !== undefined ? <MetricCard label="Mémoire" value={String(memory)} unit="%" icon="memory" density="compact" /> : null}
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0 }}>
        <StatList title="Services" items={services} />
      </div>
    </div>
  );
}
