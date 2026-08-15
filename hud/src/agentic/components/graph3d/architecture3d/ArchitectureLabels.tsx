import type { ArchitectureAnchor } from './data/architectureAnchors';

export function ArchitectureLabels({
  anchors,
  focusId,
  onSelect,
}: {
  anchors: ArchitectureAnchor[];
  focusId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="architecture-labels" aria-hidden={!onSelect}>
      {anchors.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`architecture-anchor architecture-anchor--${item.side}${focusId === item.id ? ' architecture-anchor--focused' : ''}`}
          style={{ top: `${item.top}%` }}
          onClick={() => onSelect?.(item.id)}
        >
          <span className="architecture-anchor__dot" />
          <span className="architecture-anchor__line" />
          <span className="architecture-anchor__label">
            <span className="architecture-anchor__index">{item.index}</span>
            <span>{item.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
