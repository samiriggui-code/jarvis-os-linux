/**
 * AI Provider Manager — statut réel via Core WS type=providers.
 * Chaîne : OpenRouter → Anthropic → mode sans LLM. Cursor = Cloud Agents (dev).
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'
import { useCoreSession } from '../context/CoreSessionContext'
import { dashRequest } from '../lib/dashQuery'

type ProviderBlock = { ok?: boolean; error?: string; configured?: boolean }

type ProviderStatus = {
  ok?: boolean
  mode?: string
  openrouter?: ProviderBlock & { label?: string; usage?: number; limit?: number | null }
  anthropic?: ProviderBlock & { model_count?: number }
  cursor?: ProviderBlock & { agent_count?: number }
  error?: string
}

const MODE_LABEL: Record<string, string> = {
  cloud: 'OpenRouter → Anthropic',
  system: 'Sans LLM (JARVIS BASE)',
}

export default function AIProviders() {
  const { client } = useCoreSession()
  const [st, setSt] = useState<ProviderStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const refresh = useCallback(() => {
    setLoading(true)
    setErr('')
    void dashRequest(client, { type: 'providers', action: 'status' }, 'providers_result')
      .then((data) => {
        setSt(data as ProviderStatus)
        setLoading(false)
      })
      .catch(() => {
        setErr('Core WS injoignable (8765).')
        setLoading(false)
      })
  }, [client])

  useEffect(() => { refresh() }, [refresh])

  const mode = st?.mode || ''
  const orOk = st?.openrouter?.ok === true
  const anOk = st?.anthropic?.ok === true
  const cuOk = st?.cursor?.ok === true

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
          label="ANTHROPIC"
          value={loading ? '…' : anOk ? `${st?.anthropic?.model_count ?? 0} modèles` : (st?.anthropic?.error ? 'ERREUR' : 'NON CONFIGURÉ')}
          color={anOk ? '#34C759' : '#FFC857'}
        />
        <StatPill
          label="CURSOR"
          value={loading ? '…' : cuOk ? `${st?.cursor?.agent_count ?? 0} agents` : (st?.cursor?.error ? 'ERREUR' : 'NON CONFIGURÉ')}
          color={cuOk ? '#34C759' : '#FFC857'}
        />
      </div>
      <Card>
        <CardTitle>Chaîne de bascule (AI Provider Manager)</CardTitle>
        <Row
          name="OpenRouter"
          meta={st?.openrouter?.label ? `Clé « ${st.openrouter.label} » — chat primaire` : 'OPENROUTER_API_KEY — chat primaire'}
          status={orOk ? 'OK' : (loading ? '…' : (st?.openrouter?.error || 'NON CONFIGURÉ'))}
          statusColor={orOk ? '#34C759' : '#FFC857'}
        />
        <Row
          name="Anthropic"
          meta="ANTHROPIC_API_KEY — repli direct si OpenRouter échoue"
          status={anOk ? 'OK' : (loading ? '…' : (st?.anthropic?.error || 'NON CONFIGURÉ'))}
          statusColor={anOk ? '#34C759' : '#FFC857'}
        />
        <Row
          name="Cursor Cloud Agents"
          meta="CURSOR_API_KEY — Mission Control Dev, pas le chat"
          status={cuOk ? 'OK' : (loading ? '…' : (st?.cursor?.error || 'NON CONFIGURÉ'))}
          statusColor={cuOk ? '#34C759' : '#FFC857'}
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
