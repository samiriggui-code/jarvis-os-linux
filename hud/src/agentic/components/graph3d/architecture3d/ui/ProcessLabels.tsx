import type { Graph3DModel } from '../../types';
import type { ArchitectureFocusState } from '../state/architectureFocus';
import { isActiveProcess, shouldDimProcess } from '../state/architectureFocus';
import { ProcessLabel } from './ProcessLabel';
import type { ProcessScreenAnchor } from './ProcessLabelProjector';

export function ProcessLabels({
  model,
  anchors,
  focusState,
  labelOpacity = 1,
  onSelectProcess,
  onInspectProcess,
}: {
  model: Graph3DModel;
  anchors: ProcessScreenAnchor[];
  focusState: ArchitectureFocusState;
  labelOpacity?: number;
  onSelectProcess?: (processId: string) => void;
  onInspectProcess?: (processId: string) => void;
}) {
  const labelById = new Map(model.nodes.map((n) => [n.id, n.label]));
  const anchorById = new Map(anchors.map((a) => [a.processId, a]));

  return (
    <div
      className="process-labels"
      style={{ opacity: labelOpacity }}
      aria-hidden={!onSelectProcess}
    >
      <svg className="process-labels__leaders" aria-hidden style={{ opacity: labelOpacity }}>
        {anchors.map((anchor) => {
          if (!anchor.visible) return null;
          const dimmed = shouldDimProcess(focusState, anchor.processId);
          const active = isActiveProcess(focusState, anchor.processId);
          return (
            <line
              key={anchor.processId}
              x1={anchor.labelX}
              y1={anchor.labelY}
              x2={anchor.anchorX}
              y2={anchor.anchorY}
              className={[
                'process-labels__leader',
                active ? 'process-labels__leader--active' : '',
                dimmed ? 'process-labels__leader--dimmed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          );
        })}
      </svg>

      {model.nodes.map((node) => {
        const anchor = anchorById.get(node.id);
        if (!anchor) return null;
        return (
          <ProcessLabel
            key={node.id}
            anchor={anchor}
            label={labelById.get(node.id) ?? node.label}
            active={isActiveProcess(focusState, node.id)}
            dimmed={shouldDimProcess(focusState, node.id)}
            onSelect={onSelectProcess}
            onInspect={onInspectProcess}
          />
        );
      })}
    </div>
  );
}
