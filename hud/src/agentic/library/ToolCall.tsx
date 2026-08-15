/**
 * ToolCall — appel d’outil unique (brief étape 2).
 * Props issues du Core / fixture ; zéro donnée inventée dans le composant.
 */
import type { AgenticProps } from '../registry/renderers';
import { VisionPane, useVisionText } from './vision';

export interface ToolCallProps {
  intent: string;
  owner: string;
  status: string;
  duration_ms?: number;
  summary?: string;
}

const STATUS_RGB: Record<string, string> = {
  started: '10, 132, 255',
  completed: '52, 199, 89',
  failed: '255, 59, 48',
};

export const ToolCall = ({ props }: AgenticProps) => {
  const { intent, owner, status, duration_ms, summary } = props as unknown as ToolCallProps;
  const { title, body, caption, theme } = useVisionText();
  const rgb = STATUS_RGB[status] ?? '140, 140, 150';

  const statusLabel =
    status === 'started' ? 'En cours'
    : status === 'completed' ? 'Terminé'
    : status === 'failed' ? 'Échec'
    : status || 'en attente';

  return (
    <VisionPane material="thin" style={{ overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 650,
            letterSpacing: '0.02em',
            color: `rgba(${rgb}, 1)`,
            border: `1px solid rgba(${rgb}, 0.4)`,
            borderRadius: 999,
            padding: '3px 10px',
            background: `rgba(${rgb}, 0.12)`,
          }}
        >
          {statusLabel}
        </span>
        <strong style={{ ...title, fontSize: 14 }}>Appel d’outil</strong>
      </div>

      <p style={{ ...title, fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
        {intent || '—'}
      </p>
      <p style={{ ...caption, marginTop: 6 }}>
        {owner ? `Propriétaire : ${owner}` : 'Propriétaire : non branché'}
        {typeof duration_ms === 'number' ? ` · ${duration_ms} ms` : ''}
      </p>

      {summary ? (
        <p style={{ ...body, marginTop: 10, color: theme.text }}>{summary}</p>
      ) : (
        <p style={{ ...body, marginTop: 10 }}>En attente du Core — aucun résumé.</p>
      )}
    </VisionPane>
  );
};

export const TOOL_CALL_STATES = ['started', 'completed', 'failed'] as const;
