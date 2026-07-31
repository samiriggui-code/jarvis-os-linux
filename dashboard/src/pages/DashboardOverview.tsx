/**
 * Dashboard — consommation IA live via Core WS `type: usage`.
 * OpenRouter crédits · ElevenLabs caractères · Ollama status · charts locaux.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'

type Granularity = 'hour' | 'day' | 'week' | 'month'

type SeriesPoint = {
  bucket: string
  tokens: number
  cost: number
  openrouter: number
  ollama: number
  elevenlabs: number
}

type PeriodTot = {
  tokens: number
  cost: number
  calls: number
  by_provider?: Record<string, { tokens: number; cost: number }>
}

type UsagePayload = {
  ok?: boolean
  error?: string
  totals?: Record<string, PeriodTot>
  series?: SeriesPoint[]
  granularity?: string
  openrouter?: {
    ok?: boolean
    configured?: boolean
    usage?: number
    limit?: number | null
    limit_remaining?: number | null
    label?: string
    error?: string
  }
  elevenlabs?: {
    ok?: boolean
    configured?: boolean
    character_count?: number
    character_limit?: number
    remaining?: number | null
    tier?: string
    error?: string
  }
  ollama?: {
    ok?: boolean
    configured?: boolean
    host?: string
    models?: string[]
    model_count?: number
    error?: string
  }
  generated_at?: string
}

const CORE_WS =
  (import.meta as { env?: { VITE_CORE_WS?: string } }).env?.VITE_CORE_WS ||
  'ws://127.0.0.1:8765'

const GRANS: { id: Granularity; label: string }[] = [
  { id: 'hour', label: '24 h' },
  { id: 'day', label: '14 j' },
  { id: 'week', label: '12 sem' },
  { id: 'month', label: '12 mois' },
]

function fmtTokens(n: number | undefined) {
  if (n == null || Number.isNaN(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

function fmtUsd(n: number | undefined | null) {
  if (n == null || Number.isNaN(n)) return '—'
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

function shortBucket(b: string, g: Granularity) {
  if (!b) return ''
  if (g === 'hour') return b.slice(11, 13) + 'h'
  if (g === 'day') return b.slice(5)
  if (g === 'month') return b
  return b.replace(/^20/, '')
}

export default function DashboardOverview() {
  const [gran, setGran] = useState<Granularity>('day')
  const [data, setData] = useState<UsagePayload | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback((g: Granularity) => {
    setLoading(true)
    setErr('')
    let settled = false
    const ws = new WebSocket(CORE_WS)
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true
        setErr('Timeout Core — relance `python -m jarvis_core`.')
        setLoading(false)
        try {
          ws.close()
        } catch {
          /* */
        }
      }
    }, 15000)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'usage', action: 'summary', granularity: g }))
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as UsagePayload & { type?: string }
        if (msg.type === 'usage_result') {
          settled = true
          window.clearTimeout(timer)
          setData(msg)
          if (msg.ok === false) setErr(String(msg.error || 'usage error'))
          setLoading(false)
          ws.close()
        }
      } catch {
        /* */
      }
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

  useEffect(() => {
    refresh(gran)
  }, [gran, refresh])

  const chartData = useMemo(() => {
    return (data?.series || []).map((p) => ({
      ...p,
      label: shortBucket(p.bucket, gran),
    }))
  }, [data?.series, gran])

  const t = data?.totals
  const or = data?.openrouter
  const el = data?.elevenlabs
  const ol = data?.ollama

  return (
    <PageShell>
      <PlaceholderBanner
        note={
          loading
            ? 'Chargement usage Core…'
            : err
              ? err
              : `Live Core · ${data?.generated_at?.slice(0, 19) || '—'} · DB usage_events`
        }
      />

      <div className="dash-stat-row">
        <StatPill label="1 H" value={fmtTokens(t?.hour?.tokens)} color="#A855F7" />
        <StatPill label="24 H" value={fmtTokens(t?.day?.tokens)} color="#00E5FF" />
        <StatPill label="7 J" value={fmtTokens(t?.week?.tokens)} color="#22c55e" />
        <StatPill label="30 J" value={fmtTokens(t?.month?.tokens)} color="#FFC857" />
        <StatPill label="COÛT 30 J" value={fmtUsd(t?.month?.cost)} color="#FF6B4A" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {GRANS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGran(g.id)}
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              padding: '6px 12px',
              borderRadius: 8,
              border: gran === g.id ? '1px solid #00E5FF' : '1px solid rgba(255,255,255,0.1)',
              background: gran === g.id ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.03)',
              color: gran === g.id ? '#00E5FF' : 'rgba(224,244,255,0.55)',
              cursor: 'pointer',
            }}
          >
            {g.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => refresh(gran)}
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            color: 'rgba(224,244,255,0.6)',
            cursor: 'pointer',
            marginLeft: 'auto',
          }}
        >
          RAFRAÎCHIR
        </button>
      </div>

      <div className="dash-grid-2" style={{ marginBottom: 14 }}>
        <Card>
          <CardTitle>Tokens · {GRANS.find((x) => x.id === gran)?.label}</CardTitle>
          <div style={{ width: '100%', height: 240 }}>
            {chartData.length === 0 ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'JetBrains Mono',
                  fontSize: 11,
                  color: 'rgba(224,244,255,0.35)',
                }}
              >
                Aucun événement local — les appels OpenRouter/Ollama rempliront le graphe.
              </div>
            ) : (
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tokFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#A855F7" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#A855F7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'rgba(224,244,255,0.4)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(224,244,255,0.4)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0a0e1c',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, color: 'rgba(224,244,255,0.5)' }} />
                  <Area
                    type="monotone"
                    dataKey="openrouter"
                    name="OpenRouter"
                    stroke="#A855F7"
                    fill="url(#tokFill)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="ollama"
                    name="Ollama"
                    stroke="#00E5FF"
                    fill="rgba(0,229,255,0.15)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Providers (live API)</CardTitle>
          <Row
            name="OpenRouter"
            meta={
              or?.ok
                ? `usage ${fmtUsd(or.usage)} · reste ${fmtUsd(or.limit_remaining ?? undefined)} · ${or.label || 'key'}`
                : or?.configured
                  ? `erreur · ${or.error || '?'}`
                  : 'clé absente'
            }
            status={or?.ok ? 'OK' : or?.configured ? 'ERR' : 'OFF'}
            statusColor={or?.ok ? '#00FF99' : or?.configured ? '#FF6B4A' : '#FFC857'}
          />
          <Row
            name="ElevenLabs"
            meta={
              el?.ok
                ? `${el.character_count ?? '—'}/${el.character_limit ?? '—'} car. · reste ${el.remaining ?? '—'} · ${el.tier || ''}`
                : el?.configured
                  ? `erreur · ${el.error || '?'}`
                  : 'clé absente'
            }
            status={el?.ok ? 'OK' : el?.configured ? 'ERR' : 'OFF'}
            statusColor={el?.ok ? '#00FF99' : el?.configured ? '#FF6B4A' : '#FFC857'}
          />
          <Row
            name="Ollama"
            meta={
              ol?.ok
                ? `${ol.host} · ${ol.model_count ?? 0} modèles · ${(ol.models || []).slice(0, 2).join(', ') || '—'}`
                : ol?.configured
                  ? `${ol.host || ''} · ${ol.error || 'down'}`
                  : 'URL absente (JARVIS_REMOTE_LLM_URL)'
            }
            status={ol?.ok ? 'OK' : ol?.configured ? 'DOWN' : 'OFF'}
            statusColor={ol?.ok ? '#00FF99' : ol?.configured ? '#FF6B4A' : '#FFC857'}
          />
          <div style={{ marginTop: 12, fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(224,244,255,0.35)', lineHeight: 1.5 }}>
            Compteurs locaux = chaque completion Core. Crédits OpenRouter / quota ElevenLabs = API compte.
            Ollama VPS : décommenter JARVIS_REMOTE_LLM_URL (tunnel) dans core/.env.
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>Détail période · appels locaux</CardTitle>
        <div className="dash-grid-4">
          {(['hour', 'day', 'week', 'month'] as const).map((k) => {
            const p = t?.[k]
            const bp = p?.by_provider || {}
            return (
              <div
                key={k}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
                  {k.toUpperCase()}
                </div>
                <div style={{ fontFamily: 'Orbitron', fontSize: 16, color: '#e0f4ff', marginBottom: 6 }}>
                  {fmtTokens(p?.tokens)}
                </div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0,229,255,0.7)' }}>
                  {p?.calls ?? 0} appels · {fmtUsd(p?.cost)}
                </div>
                <div style={{ marginTop: 8, fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(224,244,255,0.4)' }}>
                  {Object.keys(bp).length === 0
                    ? '—'
                    : Object.entries(bp)
                        .map(([name, v]) => `${name}: ${fmtTokens(v.tokens)}`)
                        .join(' · ')}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </PageShell>
  )
}
