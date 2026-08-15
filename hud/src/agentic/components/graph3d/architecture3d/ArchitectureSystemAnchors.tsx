import type { Graph3DModel } from '../types';
import { ARCHITECTURE_SYSTEM_META } from './data/architectureSystemMeta';

/** Filaments + micro-labels — le graphe reste le héros. Glass uniquement au focus (ArchitecturePanels). */
export function ArchitectureSystemAnchors({
  model,
  focusId,
  onSelect,
}: {
  model: Graph3DModel;
  focusId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const known = new Set(model.nodes.map((n) => n.id));
  const items = ARCHITECTURE_SYSTEM_META.filter((m) => known.has(m.id));

  return (
    <div className="architecture-labels" aria-hidden={!onSelect}>
      {items.map((meta) => {
        const focused = focusId === meta.id;
        return (
          <button
            key={meta.id}
            type="button"
            className={`architecture-anchor architecture-anchor--${meta.side}${focused ? ' architecture-anchor--focused' : ''}`}
            style={{ top: `${meta.top}%` }}
            onClick={() => onSelect?.(meta.id)}
          >
            <span className="architecture-anchor__line" aria-hidden />
            <span className="architecture-anchor__dot" aria-hidden />
            <span className="architecture-anchor__copy">
              <span className="architecture-anchor__index">{meta.index}</span>
              <span className="architecture-anchor__title">{meta.title}</span>
              {focused ? (
                <span className="architecture-anchor__caption">{meta.line1}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
