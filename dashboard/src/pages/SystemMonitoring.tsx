/**
 * Supervision — statut réel via Core WS type=supervisor (composants) et
 * SYSTEM_METRICS (poussé en continu par le bus, pas en requête/réponse —
 * la connexion reste donc ouverte ici, contrairement aux autres pages qui
 * ferment après une réponse).
 *
 * Connu et volontairement absent : aucune sonde Home Assistant / PostgreSQL /
 * Ollama côté superviseur aujourd'hui (cf. docs/COMPOSANTS.md) — ces lignes
 * ne s'affichent pas plutôt que d'inventer un statut.
 */
import { useEffect, useRef, useState } from 'react'
import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'

type Component = {
  name: string
  state: 'unknown' | 'loading' | 'ready' | 'degraded' | string
  error?: string | null
  critical?: boolean
  age_s?: number | null
}

type SupervisorStatus = {
  ok?: boolean
  degraded?: string[]
  components?: Component[]
}

type SystemMetrics = {
  host?: string
  cpu?: number
  ram?: number
  disk?: number
  uptime_s?: number
  threat_level?: string
}

import { coreWsUrl } from '../lib/coreWs'
const CORE_WS = coreWsUrl()

const STATE_COLOR: Record<string, string> = {
  ready: '#34C759',
  loading: '#0A84FF',
  degraded: '#FF3B30',
  unknown: 'rgba(17,17,20,0.35)',
}

export default function SystemMonitoring() {
  const [sup, setSup] = useState<SupervisorStatus | null>(null)
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(CORE_WS)
    wsRef.current = ws
    ws.onopen = () => {
      setConnected(true)
      ws.send(JSON.stringify({ type: 'supervisor', action: 'status' }))
    }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data))
        if (data.type === 'supervisor_status') setSup(data as SupervisorStatus)
        if (data.type === 'SYSTEM_METRICS') setMetrics(data as SystemMetrics)
      } catch { /* */ }
    }
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    return () => { try { ws.close() } catch { /* */ } }
  }, [])

  const components = sup?.components || []

  return (
    <PageShell>
      <PlaceholderBanner note={connected ? 'Connecté — métriques en direct (SYSTEM_METRICS), composants via superviseur.' : 'Core WS injoignable (8765).'} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <StatPill label="CPU" value={metrics ? `${metrics.cpu ?? '—'}%` : '—'} />
        <StatPill label="RAM" value={metrics ? `${metrics.ram ?? '—'}%` : '—'} color="#0A84FF" />
        <StatPill label="DISQUE" value={metrics ? `${metrics.disk ?? '—'}%` : '—'} color="#FFC857" />
        <StatPill label="MENACE" value={metrics?.threat_level || '—'} color={metrics?.threat_level === 'nominal' ? '#34C759' : '#FF3B30'} />
      </div>
      <div className="dash-grid-2">
        <Card>
          <CardTitle>Composants supervisés (superviseur Core)</CardTitle>
          {components.length === 0 && <Row name="En attente…" meta="" status="" statusColor="transparent" />}
          {components.map(c => (
            <Row
              key={c.name}
              name={c.name}
              meta={c.error || (c.critical ? 'critique' : 'non critique')}
              status={c.state}
              statusColor={STATE_COLOR[c.state] || STATE_COLOR.unknown}
            />
          ))}
        </Card>
        <Card>
          <CardTitle>Non couvert par le superviseur</CardTitle>
          <Row name="Home Assistant" meta="aucune sonde côté Core" status="INCONNU" statusColor="rgba(17,17,20,0.35)" />
          <Row name="PostgreSQL" meta="aucune sonde côté Core" status="INCONNU" statusColor="rgba(17,17,20,0.35)" />
          <Row name="Ollama" meta="statut lu à la demande (page AI Providers), pas supervisé en continu" status="PARTIEL" statusColor="#FFC857" />
          <div style={{ marginTop: 12, fontFamily: 'Inter, sans-serif', fontSize: 10, color: 'rgba(17,17,20,0.4)' }}>
            Écart documenté (docs/COMPOSANTS.md) — pas une case à cocher rapide, un vrai chantier côté Core.
          </div>
        </Card>
      </div>
    </PageShell>
  )
}
