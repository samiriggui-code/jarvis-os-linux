/**
 * Tool Manager — journal réel via Core WS type=tool_timeline (table
 * tool_events, déjà écrite par le Core à chaque appel d'outil).
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'

type ToolEvent = {
  intent?: string
  stage?: string
  owner?: string
  toolset?: string
  risk?: number
  operation?: string
  role?: string
  duration_ms?: number
  device_id?: string
  summary?: string
  status?: string
}

import { coreWsUrl } from '../lib/coreWs'
const CORE_WS = coreWsUrl()

const RISK_LABEL: Record<number, string> = { 1: 'INFO', 2: 'MEDIA', 3: 'HOME', 4: 'ADMIN', 5: 'VPS' }
const RISK_COLOR: Record<number, string> = { 1: 'rgba(17,17,20,0.4)', 2: '#0A84FF', 3: '#0A84FF', 4: '#FFC857', 5: '#FF3B30' }

export default function ToolsPage() {
  const [events, setEvents] = useState<ToolEvent[] | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

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
      ws.send(JSON.stringify({ type: 'tool_timeline', action: 'recent', limit: 40 }))
    }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data))
        if (data.type === 'tool_timeline') {
          settled = true
          window.clearTimeout(timer)
          setEvents(Array.isArray(data.events) ? [...data.events].reverse() : [])
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

  const list = events || []
  const criticalCount = list.filter(e => (e.risk || 0) >= 4).length

  return (
    <PageShell>
      <PlaceholderBanner note={err || 'Journal réel — table tool_events, écrite à chaque appel Core + Hermes délégué.'} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatPill label="ÉVÉNEMENTS (40 DERNIERS)" value={loading ? '…' : String(list.length)} />
        <StatPill label="ADMIN/VPS" value={loading ? '…' : String(criticalCount)} color="#FF3B30" />
      </div>
      <Card>
        <CardTitle>Derniers appels d'outils</CardTitle>
        {!loading && list.length === 0 && (
          <Row name="Aucun événement" meta="Rien dans tool_events pour l'instant" status="" statusColor="transparent" />
        )}
        {list.map((e, i) => {
          const risk = e.risk || 0
          return (
            <Row
              key={i}
              name={e.intent || e.summary || '?'}
              meta={`${e.toolset || e.owner || '?'}${e.operation ? ' · ' + e.operation : ''}${e.duration_ms ? ' · ' + e.duration_ms + 'ms' : ''}${e.device_id ? ' · ' + e.device_id : ''}`}
              status={RISK_LABEL[risk] || e.stage || e.status || '—'}
              statusColor={RISK_COLOR[risk] || 'rgba(17,17,20,0.4)'}
            />
          )
        })}
      </Card>
    </PageShell>
  )
}
