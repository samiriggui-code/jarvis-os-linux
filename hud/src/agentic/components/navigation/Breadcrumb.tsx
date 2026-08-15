/** Typo-only, comme SectionHeader — pas de dalle glass. */
import { Icon } from '../../../visual/Icon';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface BreadcrumbProps {
  items: string[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  const theme = useSpatialTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 'fit-content' }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, color: i === items.length - 1 ? theme.text : theme.textMuted }}>{it}</span>
          {i < items.length - 1 ? <Icon name="chevron-right" size={11} color={theme.textMuted} /> : null}
        </span>
      ))}
    </div>
  );
}

export default Breadcrumb;
