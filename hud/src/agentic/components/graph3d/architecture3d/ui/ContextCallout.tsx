import { AnimatePresence, motion } from 'motion/react';
import type { Graph3DModel } from '../../types';
import { systemMetaFor } from '../data/architectureSystemMeta';
import type { ArchitectureFocusState } from '../state/architectureFocus';
import type { ProcessScreenAnchor } from './ProcessLabelProjector';

/** Niveau B — callout compact pendant transition L0→L1 CORE. */
export function ContextCallout({
  model,
  focusState,
  anchors,
  fileCount,
}: {
  model: Graph3DModel;
  focusState: ArchitectureFocusState;
  anchors: ProcessScreenAnchor[];
  fileCount?: number;
}) {
  if (focusState.mode !== 'process' || focusState.processId !== 'core') return null;
  if (focusState.zoom < 0.15 || focusState.zoom > 0.88) return null;

  const node = model.nodes.find((n) => n.id === 'core');
  const anchor = anchors.find((a) => a.processId === 'core');
  if (!node || !anchor?.visible) return null;

  const meta = systemMetaFor('core');
  const phrase = meta?.line1 ?? node.caption ?? 'Noyau d\'orchestration';
  const offsetX = anchor.side === 'left' ? -12 : 12;
  const offsetY = 16;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="core-callout"
        className={`context-callout context-callout--${anchor.side}`}
        style={{
          left: anchor.labelX + offsetX,
          top: anchor.labelY + offsetY,
          opacity: 1 - Math.abs(focusState.zoom - 0.45) * 1.2,
        }}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="context-callout__title">{node.label}</div>
        <div className="context-callout__phrase">{phrase}</div>
        {fileCount != null ? (
          <ul className="context-callout__facts">
            <li>{fileCount} fichiers · CodeMap</li>
          </ul>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}
