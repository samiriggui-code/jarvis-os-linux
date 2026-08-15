import type { ProcessScreenAnchor } from './ProcessLabelProjector';

export function ProcessLabel({
  anchor,
  label,
  active,
  dimmed,
  onSelect,
  onInspect,
}: {
  anchor: ProcessScreenAnchor;
  label: string;
  active: boolean;
  dimmed: boolean;
  onSelect?: (processId: string) => void;
  onInspect?: (processId: string) => void;
}) {
  if (!anchor.visible) return null;

  const side = anchor.side;

  return (
    <button
      type="button"
      className={[
        'process-label',
        `process-label--${side}`,
        active ? 'process-label--active' : '',
        dimmed ? 'process-label--dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        left: anchor.labelX,
        top: anchor.labelY,
        transform: side === 'left' ? 'translate(-100%, -50%)' : 'translate(0, -50%)',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(anchor.processId);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onInspect?.(anchor.processId);
      }}
    >
      {side === 'left' ? (
        <>
          <span className="process-label__name">{label}</span>
          <span className="process-label__line" aria-hidden />
          <span className="process-label__dot" aria-hidden />
        </>
      ) : (
        <>
          <span className="process-label__dot" aria-hidden />
          <span className="process-label__line" aria-hidden />
          <span className="process-label__name">{label}</span>
        </>
      )}
    </button>
  );
}
