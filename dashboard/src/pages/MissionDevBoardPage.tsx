/**
 * Mission DEV Board — kanban local (WS type=mission_board).
 * Patterns UX inspirés Multica ; runtime 100 % JARVIS Core.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, CardTitle, PageShell, StatPill } from '../components/ui'
import { useCoreSession } from '../context/CoreSessionContext'
import { dashRequest } from '../lib/dashQuery'

type Issue = {
  id: string
  title: string
  body?: string
  column: string
  status: string
  assignee_agent?: string | null
  run_id?: string | null
  blocked_reason?: string | null
}

type BoardPayload = {
  columns?: string[]
  issues_by_column?: Record<string, Issue[]>
  blocked?: Issue[]
  review?: Issue[]
}

const COLUMN_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'À faire',
  doing: 'En cours',
  review: 'Review',
  done: 'Terminé',
}

const AGENTS = ['cursor', 'claude'] as const

export default function MissionDevBoardPage() {
  const { client } = useCoreSession()
  const [board, setBoard] = useState<BoardPayload | null>(null)
  const [inbox, setInbox] = useState<{ blocked: Issue[]; review: Issue[] } | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Issue | null>(null)
  const [comment, setComment] = useState('')

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [list, inboxRes] = await Promise.all([
        dashRequest(client, { type: 'mission_board', action: 'list' }, 'mission_board_result'),
        dashRequest(client, { type: 'mission_board', action: 'inbox' }, 'mission_board_result'),
      ])
      if (list.ok === false) throw new Error(String(list.error || 'list failed'))
      if (inboxRes.ok === false) throw new Error(String(inboxRes.error || 'inbox failed'))
      setBoard({
        columns: Array.isArray(list.columns) ? (list.columns as string[]) : undefined,
        issues_by_column: list.issues_by_column as Record<string, Issue[]> | undefined,
      })
      setInbox({
        blocked: Array.isArray(inboxRes.blocked) ? (inboxRes.blocked as Issue[]) : [],
        review: Array.isArray(inboxRes.review) ? (inboxRes.review as Issue[]) : [],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur board')
    }
  }, [client])

  useEffect(() => { void refresh() }, [refresh])

  const columns = useMemo(() => {
    if (board?.columns?.length) return board.columns
    return Object.keys(COLUMN_LABELS)
  }, [board])

  const issuesByColumn = board?.issues_by_column ?? {}

  const runAction = async (payload: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    try {
      const res = await dashRequest(
        client,
        { type: 'mission_board', ...payload },
        'mission_board_result',
      )
      if (res.ok === false) throw new Error(String(res.error || 'action failed'))
      await refresh()
      if (payload.action === 'get_issue' && res.issue) {
        setSelected(res.issue as Issue)
      }
      if (res.issue && selected?.id === (res.issue as Issue).id) {
        setSelected(res.issue as Issue)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  const createIssue = () => {
    const t = title.trim()
    if (!t) return
    void runAction({ action: 'create', title: t, body: body.trim() }).then(() => {
      setTitle('')
      setBody('')
    })
  }

  const moveIssue = (issueId: string, column: string) => {
    void runAction({ action: 'move', issue_id: issueId, column })
  }

  const assignIssue = (issueId: string, agent: string) => {
    void runAction({ action: 'assign', issue_id: issueId, agent })
  }

  const addComment = () => {
    if (!selected || !comment.trim()) return
    void runAction({
      action: 'comment',
      issue_id: selected.id,
      body: comment.trim(),
      author: 'dashboard',
    }).then(() => setComment(''))
  }

  const inboxCount = (inbox?.blocked.length ?? 0) + (inbox?.review.length ?? 0)

  return (
    <PageShell>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: 18, fontWeight: 600, color: 'rgba(17,17,20,0.92)' }}>
            Mission DEV · Board
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(17,17,20,0.5)' }}>
            Kanban local · assignation agent · inbox review/bloqué · replay run (P5)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatPill label="INBOX" value={String(inboxCount)} color={inboxCount ? '#FF9F1C' : '#34C759'} />
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            style={btnStyle(false)}
          >
            Rafraîchir
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,59,48,0.08)', color: '#FF3B30', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 14, alignItems: 'start' }}>
        <Card>
          <CardTitle>Nouveau ticket</CardTitle>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Titre"
            style={inputStyle}
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Description (optionnel)"
            rows={4}
            style={{ ...inputStyle, marginTop: 8, resize: 'vertical' }}
          />
          <button type="button" disabled={busy || !title.trim()} onClick={createIssue} style={{ ...btnStyle(false), marginTop: 10, width: '100%' }}>
            Créer
          </button>

          {inbox && inboxCount > 0 && (
            <div style={{ marginTop: 20 }}>
              <CardTitle>Inbox</CardTitle>
              {[...inbox.blocked, ...inbox.review].slice(0, 5).map(i => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setSelected(i)}
                  style={{
                    ...btnStyle(false),
                    width: '100%',
                    marginBottom: 6,
                    textAlign: 'left',
                    display: 'block',
                  }}
                >
                  {i.status === 'blocked' ? '⛔' : '👁'} {i.title}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div style={{ marginTop: 20 }}>
              <CardTitle>Détail</CardTitle>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>{selected.title}</p>
              {selected.body && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'rgba(17,17,20,0.55)' }}>{selected.body}</p>}
              {selected.assignee_agent && (
                <StatPill label="AGENT" value={selected.assignee_agent} color="#0A84FF" />
              )}
              {selected.run_id && (
                <p style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(17,17,20,0.45)', marginTop: 8 }}>
                  run: {selected.run_id.slice(0, 8)}…
                </p>
              )}
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Commentaire activité"
                rows={2}
                style={{ ...inputStyle, marginTop: 8 }}
              />
              <button type="button" disabled={busy || !comment.trim()} onClick={addComment} style={{ ...btnStyle(false), marginTop: 6, width: '100%' }}>
                Commenter
              </button>
            </div>
          )}
        </Card>

        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
          {columns.map(col => (
            <div key={col} style={{ minWidth: 220, flex: '0 0 220px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(17,17,20,0.45)', marginBottom: 8 }}>
                {(COLUMN_LABELS[col] || col).toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(issuesByColumn[col] || []).map(issue => (
                  <div
                    key={issue.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(issue)}
                    onKeyDown={e => { if (e.key === 'Enter') setSelected(issue) }}
                    style={{
                      borderRadius: 10,
                      border: '1px solid rgba(17,17,20,0.08)',
                      background: selected?.id === issue.id ? 'rgba(10,132,255,0.08)' : 'rgba(255,255,255,0.55)',
                      padding: '10px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{issue.title}</div>
                    {issue.assignee_agent && (
                      <div style={{ fontSize: 10, color: '#0A84FF', fontFamily: 'JetBrains Mono, monospace' }}>
                        {issue.assignee_agent}
                      </div>
                    )}
                    {issue.status === 'blocked' && issue.blocked_reason && (
                      <div style={{ fontSize: 10, color: '#FF3B30', marginTop: 4 }}>{issue.blocked_reason}</div>
                    )}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                      {columns.filter(c => c !== col).slice(0, 3).map(c => (
                        <button
                          key={c}
                          type="button"
                          disabled={busy}
                          onClick={e => { e.stopPropagation(); moveIssue(issue.id, c) }}
                          style={{ ...btnStyle(true), fontSize: 9, padding: '3px 6px' }}
                        >
                          → {COLUMN_LABELS[c] || c}
                        </button>
                      ))}
                      {col === 'todo' && AGENTS.map(agent => (
                        <button
                          key={agent}
                          type="button"
                          disabled={busy}
                          onClick={e => { e.stopPropagation(); assignIssue(issue.id, agent) }}
                          style={{ ...btnStyle(true), fontSize: 9, padding: '3px 6px' }}
                        >
                          @{agent}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}

function btnStyle(compact: boolean): CSSProperties {
  return {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: compact ? 10 : 11,
    padding: compact ? '4px 8px' : '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(17,17,20,0.12)',
    background: 'rgba(255,255,255,0.65)',
    color: 'rgba(17,17,20,0.75)',
    cursor: 'pointer',
  }
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'Inter, sans-serif',
  fontSize: 13,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid rgba(17,17,20,0.12)',
  background: 'rgba(255,255,255,0.7)',
}
