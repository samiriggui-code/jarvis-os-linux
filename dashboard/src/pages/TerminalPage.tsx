/**
 * Terminal admin — NUC / VPS / Pi salon, exécution réelle via Core WS
 * type=terminal (core/jarvis_core/ws/handlers/terminal.py).
 *
 * NUC → système déjà en place (Hermes toolset terminal, allowlist Policy).
 * VPS / Pi → SSH dédié (`remote_exec.py`) ; sans clé configurée côté Core,
 * la commande échoue avec une raison explicite — jamais un faux succès.
 *
 * Connexion PARTAGÉE (`CoreSessionContext`), pas une nouvelle par page :
 * `terminal.py` exige `role === 'admin'` sur la connexion, et un rôle admin
 * n'existe que sur la connexion où le login a eu lieu (`AdminLoginGate`).
 * Une connexion anonyme séparée n'aurait jamais aucun rôle.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardTitle, PageShell, PlaceholderBanner, StatPill } from '../components/ui'
import { useCoreSession } from '../context/CoreSessionContext'

type Host = 'nuc' | 'vps' | 'pi'

const HOSTS: { id: Host; label: string; note: string }[] = [
  { id: 'nuc', label: 'NUC', note: 'Hermes · toolset terminal' },
  { id: 'vps', label: 'VPS', note: 'SSH dédié · remote_exec.py' },
  { id: 'pi', label: 'Pi salon', note: 'SSH dédié · remote_exec.py' },
]

type Entry = {
  id: string
  host: Host
  kind: 'command' | 'output' | 'error' | 'system'
  text: string
}

type Pending = { approvalId: string; host: Host; command: string; reason: string }

let seq = 0
function entryId(): string {
  seq += 1
  return `e${seq}`
}

export default function TerminalPage() {
  const { client } = useCoreSession()
  const [host, setHost] = useState<Host>('nuc')
  const [command, setCommand] = useState('')
  const [history, setHistory] = useState<Entry[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [connected, setConnected] = useState(client.connected)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const push = useCallback((e: Omit<Entry, 'id'>) => {
    setHistory(prev => [...prev, { ...e, id: entryId() }])
  }, [])

  useEffect(() => {
    setConnected(client.connected)
    if (!client.connected) client.connect()
    const unsubConn = client.subscribeConnection(setConnected)
    const unsubMsg = client.subscribe((data) => {
      if (data.type === 'terminal_pending') {
        setPending({
          approvalId: String(data.approval_id || ''),
          host: (data.host as Host) || 'nuc',
          command: String(data.command || ''),
          reason: String(data.reason || 'Confirmation requise.'),
        })
        return
      }
      if (data.type === 'terminal_result') {
        setPending(null)
        const h = (data.host as Host) || 'nuc'
        if (data.granted === false) {
          push({ host: h, kind: 'system', text: 'Refusé.' })
          return
        }
        if (data.ok) {
          const out = String(data.output ?? data.text ?? '').trim()
          push({ host: h, kind: 'output', text: out || '(sortie vide)' })
        } else {
          push({ host: h, kind: 'error', text: String(data.error || 'échec') })
        }
      }
    })
    return () => { unsubConn(); unsubMsg() }
  }, [client, push])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [history])

  const submit = useCallback(() => {
    const cmd = command.trim()
    if (!cmd) return
    if (!client.connected) {
      push({ host, kind: 'system', text: 'Core WS non connecté — impossible d\'envoyer.' })
      return
    }
    push({ host, kind: 'command', text: cmd })
    client.send({ type: 'terminal', action: 'exec', host, command: cmd })
    setCommand('')
  }, [client, command, host, push])

  const answerApproval = useCallback((granted: boolean) => {
    if (!pending || !client.connected) return
    client.send({ type: 'terminal', action: 'approval', approval_id: pending.approvalId, granted })
    setPending(null)
  }, [client, pending])

  const lineColor: Record<Entry['kind'], string> = {
    command: '#0A84FF',
    output: 'rgba(0, 255, 153, 0.85)',
    error: '#FF3B30',
    system: 'rgba(17,17,20,0.45)',
  }

  return (
    <PageShell>
      <PlaceholderBanner note={connected ? 'Connecté — exécution réelle, sous approbation Policy.' : 'Core WS injoignable (8765).'} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <StatPill label="CONNEXION" value={connected ? 'EN LIGNE' : 'HORS LIGNE'} color={connected ? '#34C759' : '#FF3B30'} />
        <StatPill label="HÔTE ACTIF" value={HOSTS.find(h => h.id === host)?.label || host} color="#0A84FF" />
        <StatPill label="POLICY" value="ADMIN" color="#FFC857" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {HOSTS.map(h => (
          <button
            key={h.id}
            type="button"
            onClick={() => setHost(h.id)}
            title={h.note}
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              padding: '8px 16px',
              borderRadius: 999,
              border: h.id === host ? '1px solid #0A84FF' : '1px solid rgba(17,17,20,0.1)',
              background: h.id === host ? 'rgba(10,132,255,0.12)' : 'rgba(255,255,255,0.5)',
              color: h.id === host ? '#0A84FF' : 'rgba(17,17,20,0.7)',
              cursor: 'pointer',
            }}
          >
            {h.label}
          </button>
        ))}
      </div>

      {pending && (
        <Card style={{ marginBottom: 14, border: '1px solid #FFC857' }}>
          <CardTitle>Confirmation requise — {HOSTS.find(h => h.id === pending.host)?.label || pending.host}</CardTitle>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(17,17,20,0.8)', margin: '0 0 8px' }}>
            {pending.reason}
          </p>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'rgba(17,17,20,0.6)', margin: '0 0 14px' }}>
            $ {pending.command}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => answerApproval(true)}
              style={{
                fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600,
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: '#34C759', color: '#fff', cursor: 'pointer',
              }}
            >
              Autoriser
            </button>
            <button
              type="button"
              onClick={() => answerApproval(false)}
              style={{
                fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600,
                padding: '8px 18px', borderRadius: 8, border: '1px solid rgba(17,17,20,0.15)',
                background: 'transparent', color: 'rgba(17,17,20,0.7)', cursor: 'pointer',
              }}
            >
              Refuser
            </button>
          </div>
        </Card>
      )}

      <Card style={{ minHeight: 360 }}>
        <CardTitle>Session · {HOSTS.find(h => h.id === host)?.label || host}</CardTitle>
        <div
          ref={scrollRef}
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            lineHeight: 1.65,
            background: 'rgba(0,0,0,0.45)',
            borderRadius: 8,
            border: '1px solid rgba(17,17,20,0.1)',
            padding: 14,
            minHeight: 260,
            maxHeight: 420,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {history.length === 0 && (
            <div style={{ color: 'rgba(255,255,255,0.35)' }}>
              # En attente de commande — historique conservé au changement d'hôte.
            </div>
          )}
          {history.map(e => (
            <div key={e.id} style={{ color: lineColor[e.kind], marginBottom: 4 }}>
              {e.kind === 'command' ? `[${e.host}] $ ${e.text}` : e.text}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            value={command}
            onChange={(ev) => setCommand(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === 'Enter') submit() }}
            placeholder={`Commande ${HOSTS.find(h => h.id === host)?.label || host}…`}
            disabled={!connected}
            style={{
              flex: 1,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid rgba(17,17,20,0.15)',
              background: 'rgba(255,255,255,0.6)',
              color: 'rgba(17,17,20,0.9)',
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!connected || !command.trim()}
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 12,
              fontWeight: 600,
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: connected && command.trim() ? '#0A84FF' : 'rgba(17,17,20,0.15)',
              color: '#fff',
              cursor: connected && command.trim() ? 'pointer' : 'default',
            }}
          >
            Exécuter
          </button>
        </div>
      </Card>
    </PageShell>
  )
}
