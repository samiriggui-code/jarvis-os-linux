import { useState } from 'react';
import { GlassPanel } from '../../../visual/glass';
import { Icon } from '../../../visual/Icon';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
}

export interface TreeViewProps {
  title?: string;
  nodes: TreeNode[];
}

function TreeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const theme = useSpatialTheme();
  const hasChildren = Boolean(node.children?.length);
  return (
    <div>
      <div
        onClick={hasChildren ? () => setOpen((o) => !o) : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: depth * 16, cursor: hasChildren ? 'pointer' : 'default', padding: '4px 0' }}
      >
        {hasChildren ? (
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} color={theme.textMuted} />
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 12, color: theme.text }}>{node.label}</span>
      </div>
      {hasChildren && open ? node.children!.map((c) => <TreeRow key={c.id} node={c} depth={depth + 1} />) : null}
    </div>
  );
}

export function TreeView({ title, nodes }: TreeViewProps) {
  const theme = useSpatialTheme();
  return (
    <GlassPanel
      material="thin"
      elevation="surface"
      radius="lg"
      padding="md"
      style={{ height: '100%', boxSizing: 'border-box', overflow: 'auto' }}
    >
      {title ? (
        <p style={{ margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: theme.textMuted }}>
          {title}
        </p>
      ) : null}
      {nodes.map((n) => (
        <TreeRow key={n.id} node={n} depth={0} />
      ))}
    </GlassPanel>
  );
}

export default TreeView;
