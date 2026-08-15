/** Décoratif — pas de recherche réelle branchée. */
import { GlassPanel } from '../../../visual/glass';
import { Icon } from '../../../visual/Icon';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface SearchBarProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export function SearchBar({ placeholder = 'Rechercher…', value, onChange }: SearchBarProps) {
  const theme = useSpatialTheme();
  return (
    <GlassPanel
      material="ultraThin"
      elevation="surface"
      radius="pill"
      padding="sm"
      style={{ height: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8 }}
    >
      <Icon name="search" size={14} color={theme.textMuted} />
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: theme.text, fontSize: 13 }}
      />
    </GlassPanel>
  );
}

export default SearchBar;
