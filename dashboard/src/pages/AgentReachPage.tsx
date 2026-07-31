/**
 * Agent-Reach — paramétrage admin (capability Internet Hermes).
 * Statut via Core WS type=agent_reach ; cookies = ~/.agent-reach (jamais git).
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'
import { HOST } from '../types'

type ReachStatus = {
  ok?: boolean
  installed?: boolean
  cli_path?: string | null
  config_exists?: boolean
  config_path?: string
  hint?: string | null
  skill?: string
  vendor?: string
  platforms?: Array<{ id: string; label: string; zero_config?: boolean }>
  doctor?: unknown
  error?: string
}

const CORE_WS = (import.meta as { env?: { VITE_CORE_WS?: string } }).env?.VITE_CORE_WS
  || 'ws://127.0.0.1:8765'

export default function AgentReachPage() {
  const [st, setSt] = useState<ReachStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const refresh = useCallback(() => {
    setLoading(true)
    setErr('')
    let settled = false
    const ws = new WebSocket(CORE_WS)
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true
        setErr('Timeout Core — relance jarvis_core.')
        setLoading(false)
        try { ws.close() } catch { /* */ }
      }
    }, 12000)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'agent_reach', action: 'doctor' }))
    }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data))
        if (data.type === 'agent_reach_status') {
          settled = true
          window.clearTimeout(timer)
          setSt(data as ReachStatus)
          setLoading(false)
          ws.close()
        }
      } catch { /* */ }
    }
    ws.onerror = () => {
      if (!settled) {
        settled = true
        window.clearTimeout(timer)
        setErr('Core WS injoignable (8765).')
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const installed = st?.installed === true

  return (
    <PageShell>
      <PlaceholderBanner note="Agent-Reach = couche Internet Hermes (fetch). Pas un LLM. Cookies locaux · install --safe sur VPS." />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <StatPill label="CLI" value={installed ? 'OK' : 'MISSING'} color={installed ? '#00FF99' : '#FF6B4A'} />
        <StatPill label="CONFIG" value={st?.config_exists ? 'YES' : 'NO'} color={st?.config_exists ? '#00E5FF' : '#FFC857'} />
        <StatPill label="HOST" value={HOST.label} />
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{
            fontFamily: 'JetBrains Mono',
            fontSize: 10,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid rgba(0,229,255,0.35)',
            background: 'rgba(0,229,255,0.08)',
            color: '#00E5FF',
            cursor: 'pointer',
          }}
        >
          {loading ? '…' : 'RAFRAÎCHIR DOCTOR'}
        </button>
      </div>

      {(err || st?.error) && (
        <Card style={{ marginBottom: 14, borderColor: 'rgba(255,107,74,0.4)' }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: '#FF6B4A' }}>{err || st?.error}</div>
        </Card>
      )}

      <div className="dash-grid-2">
        <Card>
          <CardTitle>État / install</CardTitle>
          <Row name="CLI agent-reach" meta={st?.cli_path || 'non trouvé dans PATH'} status={installed ? 'OK' : 'TODO'} statusColor={installed ? '#00FF99' : '#FF6B4A'} />
          <Row name="Config" meta={st?.config_path || '~/.agent-reach/config.yaml'} status={st?.config_exists ? 'OK' : 'VIDE'} />
          <Row name="Skill Hermes" meta={st?.skill || 'deploy/hermes/skills/agent-reach'} status="SEED" />
          <Row name="Vendor" meta={st?.vendor || 'vendor/Agent-Reach-main'} status="REF" />
          {!installed && (
            <pre style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 8,
              background: 'rgba(0,0,0,0.35)',
              fontFamily: 'JetBrains Mono',
              fontSize: 10,
              color: 'rgba(224,244,255,0.75)',
              whiteSpace: 'pre-wrap',
            }}>
{st?.hint || `pip install -e vendor/Agent-Reach-main
agent-reach install --env=auto --safe
agent-reach doctor`}
            </pre>
          )}
          <p style={{ marginTop: 10, fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
            Cookies / tokens Twitter-Reddit : Cookie-Editor → ~/.agent-reach (chmod 600). Jamais dans git ni core/.env.
            Setup profil VPS/complet inclut le module agent-reach.
          </p>
        </Card>

        <Card>
          <CardTitle>Plateformes</CardTitle>
          {(st?.platforms || []).map(p => (
            <Row
              key={p.id}
              name={p.label}
              meta={p.zero_config ? 'zéro config' : 'cookies / OpenCLI'}
              status={p.zero_config ? 'READY*' : 'SETUP'}
              statusColor={p.zero_config ? '#00E5FF' : '#FFC857'}
            />
          ))}
          <p style={{ marginTop: 10, fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
            * READY si CLI installée. Doctor JSON ci-dessous confirme les backends actifs.
          </p>
        </Card>
      </div>

      <Card style={{ marginTop: 14 }}>
        <CardTitle>Doctor (JSON)</CardTitle>
        <pre style={{
          margin: 0,
          maxHeight: 220,
          overflow: 'auto',
          fontFamily: 'JetBrains Mono',
          fontSize: 9,
          color: 'rgba(224,244,255,0.55)',
          whiteSpace: 'pre-wrap',
        }}>
          {st?.doctor ? JSON.stringify(st.doctor, null, 2) : (loading ? '…' : '— lance RAFRAÎCHIR ou installe la CLI')}
        </pre>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <CardTitle>Fonctionnement</CardTitle>
        <Row name="1. User" meta="« Jarvis cherche / résume cette vidéo YouTube »" status="VOICE" />
        <Row name="2. Hermes" meta="skill agent-reach → CLI amont (gh, yt-dlp, …)" status="DELEGATE" />
        <Row name="3. Filtre" meta="données externes avant LLM" status="POLICY" statusColor="#FFC857" />
        <Row name="4. Réponse" meta="synthèse locale (FR/EN profil)" status="TTS" />
      </Card>
    </PageShell>
  )
}
