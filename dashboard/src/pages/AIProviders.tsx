/**
 * AI Provider Manager — statut réel via Core WS type=providers.
 * Même donnée que la voix « Jarvis, montre-moi les providers » (core.providers,
 * executors/system.py) — juste sans surface HUD ni synthèse vocale ici.
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'

type ProviderStatus = {
  ok?: boolean
  mode?: string
  openrouter?: { ok?: boolean; error?: string; label?: string; usage?: number; limit?: number | null }
  ollama?: { ok?: boolean; error?: string; model_count?: number }
  error?: string
}

import { coreWsUrl } from '../lib/coreWs'
const CORE_WS = coreWsUrl()

const MODE_LABEL: Record<string, string> = {
  local: 'Ollama local',
  remote: 'Ollama VPS',
  cloud: 'OpenRouter (cloud)',
  system: 'Sans LLM (JARVIS BASE)',
}

export default function AIProviders() {
  const [st, setSt] = useState<ProviderStatus | null>(null)
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
      ws.send(JSON.stringify({ type: 'providers', action: 'status' }))
    }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data))
        if (data.type === 'providers_result') {
          settled = true
          window.clearTimeout(timer)
          setSt(data as ProviderStatus)
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

  const mode = st?.mode || ''
  const orOk = st?.openrouter?.ok === true
  const ollamaOk = st?.ollama?.ok === true

  return (
    <PageShell>
      <PlaceholderBanner note={err || 'AI Provider Manager — mode actif détecté par le Core, jamais choisi par le Dashboard.'} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <StatPill label="MODE ACTIF" value={loading ? '…' : (MODE_LABEL[mode] || mode || '—')} color="#0A84FF" />
        <StatPill
          label="OPENROUTER"
          value={loading ? '…' : orOk ? 'OK' : (st?.openrouter?.error ? 'ERREUR' : 'NON CONFIGURÉ')}
          color={orOk ? '#34C759' : '#FFC857'}
        />
        <StatPill
          label="OLLAMA"
          value={loading ? '…' : ollamaOk ? `${st?.ollama?.model_count ?? 0} modèles` : (st?.ollama?.error ? 'ERREUR' : 'NON CONFIGURÉ')}
          color={ollamaOk ? '#34C759' : '#FFC857'}
        />
      </div>
      <Card>
        <CardTitle>Chaîne de bascule (AI Provider Manager)</CardTitle>
        <Row
          name="Ollama VPS/local"
          meta={ollamaOk ? `${st?.ollama?.model_count ?? 0} modèle(s) disponible(s)` : 'JARVIS_REMOTE_LLM_URL / JARVIS_OLLAMA_URL'}
          status={ollamaOk ? 'OK' : (loading ? '…' : 'NON CONFIGURÉ')}
          statusColor={ollamaOk ? '#34C759' : '#FFC857'}
        />
        <Row
          name="OpenRouter"
          meta={st?.openrouter?.label ? `Clé « ${st.openrouter.label} »` : 'OPENROUTER_API_KEY'}
          status={orOk ? 'OK' : (loading ? '…' : (st?.openrouter?.error || 'NON CONFIGURÉ'))}
          statusColor={orOk ? '#34C759' : '#FFC857'}
        />
        <Row
          name="Mode sans LLM"
          meta="JARVIS BASE — fonctions programmées, aucune dépendance réseau"
          status={mode === 'system' ? 'ACTIF' : 'STANDBY'}
          statusColor={mode === 'system' ? '#0A84FF' : 'rgba(17,17,20,0.4)'}
        />
      </Card>
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 11,
            padding: '6px 14px',
            borderRadius: 999,
            border: '1px solid rgba(17,17,20,0.12)',
            background: 'rgba(255,255,255,0.5)',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Actualisation…' : 'Actualiser'}
        </button>
      </div>
    </PageShell>
  )
}
