/**
 * Workspace — composition Layout Engine + rendu, extrait du bloc inline de
 * `sim/AgenticDemoStage.tsx` (grid CSS + `LayoutGroup`/`AnimatePresence`/
 * `SectionFrame`). Seul endroit qui relie `layout/runtime`+`gridRenderer` au
 * rendu React — les composants `agentic/components/*` ne l'importent jamais
 * en retour (le contenu est injecté par `renderContent`, jamais l'inverse).
 */
import { useMemo, type ReactNode } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { SectionFrame, type SectionFrameProps } from '../../layout/SectionFrame';
import { LAYOUT_SPACING } from '../../layout/tokens';
import { hudSpatialTransition } from '../../layout/motion';
import { profileForWidth } from '../../layout/responsivePack';
import { useLayoutSnapshot } from '../../layout/runtime';
import { rectToGridColumn, orderForGrid } from '../../layout/gridRenderer';
import type { LayoutNode } from '../../layout/node';
import type { AvailableSpace } from '../../layout/solver';
import type { LayoutSnapshotEntry } from '../../layout/snapshot';

type FrameChrome = Partial<Pick<SectionFrameProps, 'title' | 'subtitle' | 'tone' | 'entering'>>;

export interface WorkspaceProps {
  /** Déjà mémoïsé par l'appelant (ex. `useMemo` sur `sections`). */
  nodes: LayoutNode[];
  space: AvailableSpace;
  renderContent: (node: LayoutNode, entry: LayoutSnapshotEntry) => ReactNode;
  onClose?: (id: string) => void;
  onCollapse?: (id: string) => void;
  onExpand?: (id: string) => void;
  layoutGroupId?: string;
  /** Défaut : lit `node.meta.title/subtitle/tone/entering` — convention déjà
   * écrite par `secToNode`/`capabilitiesToNode`. */
  frameProps?: (node: LayoutNode, entry: LayoutSnapshotEntry) => FrameChrome;
}

function defaultFrameProps(node: LayoutNode): FrameChrome {
  return {
    title: (node.meta?.title as string | undefined) ?? node.id,
    subtitle: node.meta?.subtitle as string | undefined,
    tone: node.meta?.tone as string | undefined,
    entering: node.meta?.entering as boolean | undefined,
  };
}

export function Workspace({
  nodes,
  space,
  renderContent,
  onClose,
  onCollapse,
  onExpand,
  layoutGroupId = 'workspace',
  frameProps,
}: WorkspaceProps) {
  const snapshot = useLayoutSnapshot(nodes, space);
  const profile = useMemo(() => profileForWidth(space.availableWidth, 100), [space.availableWidth]);
  const gap = space.gap ?? profile.gap;
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  // Ordre DOM = ordre de placement du solveur (y puis x) — l'auto-flow CSS
  // Grid reproduit alors le même étagement que `solve()` a calculé.
  const renderIds = useMemo(() => {
    const ids = nodes.filter((n) => snapshot.get(n.id)?.visible !== false).map((n) => n.id);
    return orderForGrid(ids, snapshot);
  }, [nodes, snapshot]);

  return (
    <LayoutGroup id={layoutGroupId}>
      <motion.div
        layout
        transition={hudSpatialTransition}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${profile.cols}, minmax(0, 1fr))`,
          gap,
          padding: LAYOUT_SPACING.sm,
          alignContent: 'start',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <AnimatePresence mode="sync">
          {renderIds.map((id) => {
            const node = nodeById.get(id);
            const entry = snapshot.get(id);
            if (!node || !entry) return null;
            const chrome = { ...defaultFrameProps(node), ...frameProps?.(node, entry) };
            return (
              <SectionFrame
                key={id}
                id={id}
                title={chrome.title ?? id}
                subtitle={chrome.subtitle}
                state={entry.state}
                entering={chrome.entering}
                tone={chrome.tone}
                gridColumn={rectToGridColumn(entry, { availableWidth: space.availableWidth, gap })}
                onClose={onClose ? () => onClose(id) : undefined}
                onCollapse={onCollapse ? () => onCollapse(id) : undefined}
                onExpand={onExpand ? () => onExpand(id) : undefined}
              >
                {renderContent(node, entry)}
              </SectionFrame>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </LayoutGroup>
  );
}

export default Workspace;
