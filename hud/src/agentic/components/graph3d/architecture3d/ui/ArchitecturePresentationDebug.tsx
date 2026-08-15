import { lodAtDepth, stackDepth, type PresentationState } from '../state/presentationController';

export function ArchitecturePresentationDebug({
  presentation,
  onOverview,
  onEnterCore,
  onEnterArchitecture,
  onBack,
  onHome,
}: {
  presentation: PresentationState;
  onOverview: () => void;
  onEnterCore: () => void;
  onEnterArchitecture?: () => void;
  onBack: () => void;
  onHome: () => void;
}) {
  const depth = stackDepth(presentation);
  const lod = depth > 0 ? lodAtDepth(presentation, depth) : 0;
  const busy = presentation.direction !== 'idle';
  const stack = presentation.pendingStack ?? presentation.stack;

  return (
    <div className="architecture-presentation-debug" data-dev-only>
      <div className="architecture-presentation-debug__title">PRESENTATION</div>
      <div className="architecture-presentation-debug__state">
        depth {depth} · lod {(lod * 100).toFixed(0)}%
      </div>
      <div className="architecture-presentation-debug__state">
        stack: {['jarvis', ...stack].join(' → ')}
      </div>
      <div className="architecture-presentation-debug__actions">
        <button type="button" disabled={busy} onClick={onOverview}>
          OVERVIEW
        </button>
        <button type="button" disabled={busy || presentation.stack.length !== 0} onClick={onEnterCore}>
          ENTER CORE
        </button>
        {onEnterArchitecture ? (
          <button
            type="button"
            disabled={
              busy ||
              presentation.stack.length !== 1 ||
              presentation.stack[0] !== 'core'
            }
            onClick={onEnterArchitecture}
          >
            ENTER ARCHITECTURE
          </button>
        ) : null}
        <button type="button" disabled={busy || presentation.stack.length === 0} onClick={onBack}>
          BACK
        </button>
        <button type="button" disabled={busy} onClick={onHome}>
          HOME
        </button>
      </div>
    </div>
  );
}
