/**
 * Timeline outils — visualiseur des `tool_event` Core.
 * Réutilise `library/ToolCall` (pas une deuxième carte).
 */
import { ToolCall } from '../../agentic/library/ToolCall';
import { useToolTimeline, type ToolTimelineEntry } from '../bridge/toolTimelineStore';
import { visionCaption } from './visionChrome';
import { tokens } from '../../ui/tokens';

function toolStatus(entry: ToolTimelineEntry): string {
  const s = String(entry.stage || entry.status || '').toLowerCase();
  if (s === 'started' || s === 'running') return 'started';
  if (s === 'completed' || s === 'success') return 'completed';
  if (s === 'failed' || s === 'not_executable') return 'failed';
  return s || 'started';
}

function noopEmit() {
  /* lecture seule — le HUD ne relance pas l'outil */
}

export function ToolTimeline({ limit = 8 }: { limit?: number }) {
  const events = useToolTimeline();
  const shown = events.slice(-limit).reverse();

  if (shown.length === 0) {
    return (
      <p style={{ ...visionCaption, margin: 0, flexShrink: 0 }}>
        Aucun outil encore — en attente du Core.
      </p>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxHeight: 220,
        overflowY: 'auto',
        flexShrink: 0,
        scrollbarWidth: 'thin',
        scrollbarColor: `${tokens.color.borderActive} transparent`,
      }}
    >
      {shown.map((entry, i) => (
        <div key={`${entry.run_id || entry.intent || 'te'}-${entry.event || entry.stage}-${i}`} style={{ minHeight: 0 }}>
          <ToolCall
            id={`tl-${i}`}
            props={{
              intent: entry.intent || entry.tool || entry.event || 'outil',
              owner: entry.owner || '',
              status: toolStatus(entry),
              duration_ms: entry.duration_ms,
              summary: entry.summary
                || (entry.device_id ? `device ${entry.device_id}` : undefined),
            }}
            state={toolStatus(entry)}
            emit={noopEmit}
          >
            {null}
          </ToolCall>
        </div>
      ))}
    </div>
  );
}
