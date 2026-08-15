/**
 * DevIssueBoard — kanban Mission DEV (affichage Agentic UI, pas de boutons).
 * Actions = voix → Core → Policy → exécution.
 */
import { GlassPanel } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export type BoardIssue = {
  id: string;
  title: string;
  column?: string;
  status?: string;
  assignee_agent?: string | null;
  blocked_reason?: string | null;
  run_id?: string | null;
};

export interface DevIssueBoardProps {
  title?: string;
  columns?: string[];
  issues?: BoardIssue[];
  inbox_count?: number;
  inbox_blocked?: BoardIssue[];
  inbox_review?: BoardIssue[];
  voice_hint?: string;
}

const COL_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'À faire',
  doing: 'En cours',
  review: 'Review',
  done: 'Terminé',
};

export function DevIssueBoard({
  title = 'Mission DEV',
  columns = ['backlog', 'todo', 'doing', 'review', 'done'],
  issues = [],
  inbox_count = 0,
  inbox_blocked = [],
  inbox_review = [],
  voice_hint = '',
}: DevIssueBoardProps) {
  const theme = useSpatialTheme();
  const byCol: Record<string, BoardIssue[]> = {};
  for (const c of columns) byCol[c] = [];
  for (const issue of issues) {
    const col = issue.column || 'backlog';
    if (!byCol[col]) byCol[col] = [];
    byCol[col].push(issue);
  }

  return (
    <GlassPanel
      material="regular"
      elevation="surface"
      radius="lg"
      padding="md"
      style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', color: theme.text }}>
          {title}
        </p>
        {inbox_count > 0 ? (
          <span style={{ fontSize: 10, color: '#FF9F1C', fontFamily: 'JetBrains Mono, monospace' }}>
            INBOX {inbox_count}
          </span>
        ) : null}
      </div>

      {voice_hint ? (
        <p style={{ margin: 0, fontSize: 11, color: theme.textMuted, lineHeight: 1.45 }}>
          {voice_hint}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', flex: 1, minHeight: 0, paddingBottom: 4 }}>
        {columns.map(col => (
          <div key={col} style={{ minWidth: 168, flex: '0 0 168px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textMuted }}>
              {COL_LABEL[col] || col}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', flex: 1 }}>
              {(byCol[col] || []).map(issue => (
                <div
                  key={issue.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: `1px solid ${theme.border}`,
                    background: 'rgba(255,255,255,0.04)',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 12, color: theme.text, fontWeight: 500 }}>{issue.title}</p>
                  {issue.assignee_agent ? (
                    <p style={{ margin: '4px 0 0', fontSize: 10, color: '#0A84FF', fontFamily: 'JetBrains Mono, monospace' }}>
                      @{issue.assignee_agent}
                    </p>
                  ) : null}
                  {issue.status === 'blocked' && issue.blocked_reason ? (
                    <p style={{ margin: '4px 0 0', fontSize: 10, color: '#FF3B30' }}>{issue.blocked_reason}</p>
                  ) : null}
                  {issue.run_id ? (
                    <p style={{ margin: '4px 0 0', fontSize: 9, color: theme.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
                      run {issue.run_id.slice(0, 8)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {(inbox_blocked.length > 0 || inbox_review.length > 0) && (
        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 8 }}>
          <p style={{ margin: '0 0 6px', fontSize: 10, textTransform: 'uppercase', color: theme.textMuted }}>Inbox</p>
          {[...inbox_blocked, ...inbox_review].slice(0, 4).map(i => (
            <p key={i.id} style={{ margin: '2px 0', fontSize: 11, color: theme.text }}>
              {i.status === 'blocked' ? '⛔' : '👁'} {i.title}
            </p>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

export default DevIssueBoard;
