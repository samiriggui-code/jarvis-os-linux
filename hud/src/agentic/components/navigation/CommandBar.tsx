/** Décoratif — pas d'exécution de commande réelle. Réutilise `visual/Kbd` pour les indices. */
import { GlassPanel } from '../../../visual/glass';
import { Icon, type IconName } from '../../../visual/Icon';
import { Kbd } from '../../../visual/Kbd';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface CommandBarItem {
  icon?: IconName;
  label: string;
  hint?: string;
}

export interface CommandBarProps {
  items: CommandBarItem[];
}

export function CommandBar({ items }: CommandBarProps) {
  const theme = useSpatialTheme();
  return (
    <GlassPanel
      material="ultraThin"
      elevation="surface"
      radius="lg"
      padding="sm"
      style={{ height: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 16, overflow: 'auto' }}
    >
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {it.icon ? <Icon name={it.icon} size={13} color={theme.textMuted} /> : null}
          <span style={{ fontSize: 12, color: theme.text }}>{it.label}</span>
          {it.hint ? <Kbd size="xs">{it.hint}</Kbd> : null}
        </div>
      ))}
    </GlassPanel>
  );
}

export default CommandBar;
