import { AnimatePresence, motion } from 'motion/react';
import { StatusCard, type StatusCardTone } from '../../../agent/StatusCard';
import { KeyValueList } from '../../../data/KeyValueList';
import type { GraphNode, GraphNodeStatus } from '../../types';
import type { ArchitectureFocusState } from '../state/architectureFocus';
import { shouldShowAgenticPanel } from '../state/architectureFocus';

function toneOf(status?: GraphNodeStatus): StatusCardTone {
  if (status === 'available') return 'success';
  if (status === 'conflict') return 'danger';
  if (status === 'stale') return 'warning';
  if (status === 'configured') return 'info';
  return 'neutral';
}

function FocusSurface({ node }: { node: GraphNode }) {
  const tone = toneOf(node.status);
  const body = [node.caption, node.summary].filter(Boolean).join(' — ');
  const alert =
    node.status === 'conflict'
      ? 'Conflit documenté — pas une panne runtime.'
      : node.status === 'stale'
        ? 'Donnée périmée — à revérifier.'
        : null;

  return (
    <div className="architecture-focus-stack">
      <StatusCard title={node.label} body={body || undefined} tone={tone} />
      {alert ? (
        <StatusCard title="Attention" body={alert} tone={tone === 'danger' ? 'danger' : 'warning'} />
      ) : null}
      {node.facts?.length ? <KeyValueList rows={node.facts} /> : null}
    </div>
  );
}

/** Niveau C — panneau Agentic UI, uniquement au focus approfondi (inspect). */
export function ArchitectureAgenticPanel({
  focusState,
  focusNode,
}: {
  focusState: ArchitectureFocusState;
  focusNode?: GraphNode | null;
}) {
  const visible = shouldShowAgenticPanel(focusState) && focusNode;
  const side = focusNode?.uiSide ?? 'right';

  return (
    <AnimatePresence mode="wait">
      {visible ? (
        <motion.aside
          key={focusNode.id}
          className={`architecture-agentic-panel architecture-agentic-panel--${side}`}
          initial={{ opacity: 0, x: side === 'left' ? -14 : 14 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: side === 'left' ? -8 : 8 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          <FocusSurface node={focusNode} />
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
