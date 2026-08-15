/** Base UNIQUE pour TabBar/SegmentedControl (règle de consolidation). */
import { GlassPanel } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface TabItem {
  id: string;
  label: string;
}

export interface TabBarProps {
  tabs: TabItem[];
  activeId: string;
  onSelect?: (id: string) => void;
  variant?: 'underline' | 'segmented';
}

export function TabBar({ tabs, activeId, onSelect, variant = 'underline' }: TabBarProps) {
  const theme = useSpatialTheme();
  return (
    <GlassPanel
      material="ultraThin"
      elevation="surface"
      radius={variant === 'segmented' ? 'pill' : 'md'}
      padding="sm"
      style={{ height: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: variant === 'segmented' ? 4 : 16 }}
    >
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect?.(t.id)}
            style={{
              border: 'none',
              background: variant === 'segmented' ? (active ? `rgba(${theme.accent}, 0.18)` : 'transparent') : 'transparent',
              color: active ? theme.text : theme.textMuted,
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              padding: variant === 'segmented' ? '5px 12px' : '4px 0',
              borderRadius: variant === 'segmented' ? 999 : 0,
              borderBottom: variant === 'underline' ? `2px solid ${active ? `rgba(${theme.accent}, 1)` : 'transparent'}` : 'none',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </GlassPanel>
  );
}

export default TabBar;
