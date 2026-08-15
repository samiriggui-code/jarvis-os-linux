import { MetricCard, type MetricCardProps } from './MetricCard';

export interface MetricGridProps {
  items: MetricCardProps[];
  columns?: number;
}

/** Grille de MetricCard — contenu, pas un LayoutNode : vit à l'intérieur d'un nœud Workspace. */
export function MetricGrid({ items, columns = 3 }: MetricGridProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 10,
        height: '100%',
      }}
    >
      {items.map((item, i) => (
        <MetricCard key={`${item.label}-${i}`} {...item} />
      ))}
    </div>
  );
}

export default MetricGrid;
