/** Décoratif — pas de logique de filtre réelle. Réutilise `visual/Badge` comme chip togglable. */
import { Badge } from '../../../visual/Badge';

export interface FilterChip {
  id: string;
  label: string;
}

export interface FilterBarProps {
  chips: FilterChip[];
  activeIds?: string[];
  onToggle?: (id: string) => void;
}

export function FilterBar({ chips, activeIds = [], onToggle }: FilterBarProps) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', height: '100%' }}>
      {chips.map((c) => {
        const active = activeIds.includes(c.id);
        return (
          <div key={c.id} onClick={() => onToggle?.(c.id)} style={{ cursor: 'pointer' }}>
            <Badge status={active ? 'info' : 'neutral'} dot={false}>
              {c.label}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

export default FilterBar;
