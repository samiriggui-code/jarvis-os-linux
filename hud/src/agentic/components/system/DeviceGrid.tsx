import { DeviceCard, type DeviceCardProps } from './DeviceCard';

export interface DeviceGridProps {
  items: DeviceCardProps[];
  columns?: number;
}

export function DeviceGrid({ items, columns = 2 }: DeviceGridProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 10, height: '100%' }}>
      {items.map((it, i) => (
        <DeviceCard key={`${it.name}-${i}`} {...it} />
      ))}
    </div>
  );
}

export default DeviceGrid;
