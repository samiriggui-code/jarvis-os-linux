/**
 * Dashboard — consommation IA live via Core WS `type: usage`.
 * OpenRouter crédits · Anthropic tokens locaux · Cursor Cloud Agents · ElevenLabs TTS.
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
import { GlassButton } from '../components/glass'
import { tokens } from '../ui/tokens'
import { useCoreSession } from '../context/CoreSessionContext'
import { dashRequest } from '../lib/dashQuery'

type Granularity = 'hour' | 'day' | 'week' | 'month'

type SeriesPoint = {
  bucket: string
  tokens: number
  cost: number
  openrouter: number
  anthropic: number
  cursor: number
  elevenlabs: number
}

type PeriodTot = {
  tokens: number
  cost: number
  calls: number
  by_provider?: Record<string, { tokens: number; cost: number; calls?: number }>
}

type LiveProvider = {
  ok?: boolean
  configured?: boolean
  error?: string
  note?: string
  local_day_tokens?: number
  local_month_tokens?: number
  local_month_calls?: number
}

type UsagePayload = {
  ok?: boolean
  error?: string
  totals?: Record<string, PeriodTot>
  series?: SeriesPoint[]
  granularity?: string
  openrouter?: LiveProvider & {
    usage?: number
    limit?: number | null
    limit_remaining?: number | null
    label?: string
  }
  anthropic?: LiveProvider & {
    model_count?: number
    models?: string[]
  }
  cursor?: LiveProvider & {
    agent_count?: number
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
  generated_at?: string
}

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
  const { client } = useCoreSession()
  const [gran, setGran] = useState<Granularity>('day')
  const [data, setData] = useState<UsagePayload | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback((g: Granularity) => {
    setLoading(true)
    setErr('')
    void dashRequest(client, { type: 'usage', action: 'summary', granularity: g }, 'usage_result', 15000)
      .then((msg) => {
        setData(msg as UsagePayload)
        if (msg.ok === false) setErr(String(msg.error || 'usage error'))
        setLoading(false)
      })
      .catch(() => {
        setErr('Core WS injoignable (8765).')
        setLoading(false)
      })
  }, [client])

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
  const an = data?.anthropic
  const cu = data?.cursor
  const el = data?.elevenlabs

  return (
    <PageShell>
      <PlaceholderBanner
        note={
          loading
            ? 'Chargement usage Core…'
            : err
              ? err
              : `Live Core · ${data?.generated_at?.slice(0, 19) || '—'} · OpenRouter · Anthropic · Cursor`
        }
      />

      <div className="dash-stat-row">
        <StatPill label="1 H" value={fmtTokens(t?.hour?.tokens)} color="#0A84FF" />
        <StatPill label="24 H" value={fmtTokens(t?.day?.tokens)} color="#0A84FF" />
        <StatPill label="7 J" value={fmtTokens(t?.week?.tokens)} color="#22c55e" />
        <StatPill label="30 J" value={fmtTokens(t?.month?.tokens)} color="#FFC857" />
        <StatPill label="COÛT 30 J" value={fmtUsd(t?.month?.cost)} color="#FF6B4A" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {GRANS.map((g) => (
          <GlassButton
            key={g.id}
            active={gran === g.id}
            onClick={() => setGran(g.id)}
          >
            {g.label}
          </GlassButton>
        ))}
        <GlassButton tone="neutral" onClick={() => refresh(gran)} style={{ marginLeft: 'auto' }}>
          RAFRAÎCHIR
        </GlassButton>
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
                  color: tokens.color.textMuted,
                }}
              >
                Aucun événement local — OpenRouter, Anthropic et Cursor rempliront le graphe.
              </div>
            ) : (
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tokFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#0A84FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" vertical />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(14,15,18,0.92)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }} />
                  <Area
                    type="monotone"
                    dataKey="openrouter"
                    name="OpenRouter"
                    stroke="#0A84FF"
                    fill="url(#tokFill)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="anthropic"
                    name="Anthropic"
                    stroke="#D97757"
                    fill="rgba(217,119,87,0.18)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="cursor"
                    name="Cursor"
                    stroke="#34C759"
                    fill="rgba(52,199,89,0.12)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Providers (live API + compteurs locaux)</CardTitle>
          <Row
            name="OpenRouter"
            meta={
              or?.ok
                ? `usage ${fmtUsd(or.usage)} · reste ${fmtUsd(or.limit_remaining ?? undefined)} · local 30j ${fmtTokens(or.local_month_tokens)} · ${or.label || 'key'}`
                : or?.configured
                  ? `erreur · ${or.error || '?'}`
                  : 'clé absente'
            }
            status={or?.ok ? 'OK' : or?.configured ? 'ERR' : 'OFF'}
            statusColor={or?.ok ? '#00FF99' : or?.configured ? '#FF6B4A' : '#FFC857'}
          />
          <Row
            name="Anthropic"
            meta={
              an?.ok
                ? `${an.model_count ?? 0} modèles · local 24h ${fmtTokens(an.local_day_tokens)} · 30j ${fmtTokens(an.local_month_tokens)} (${an.local_month_calls ?? 0} appels)`
                : an?.configured
                  ? `erreur · ${an.error || '?'}`
                  : 'clé absente'
            }
            status={an?.ok ? 'OK' : an?.configured ? 'ERR' : 'OFF'}
            statusColor={an?.ok ? '#00FF99' : an?.configured ? '#FF6B4A' : '#FFC857'}
          />
          <Row
            name="Cursor"
            meta={
              cu?.ok
                ? `${cu.agent_count ?? 0} agents récents · local 30j ${fmtTokens(cu.local_month_tokens)} (${cu.local_month_calls ?? 0} runs)`
                : cu?.configured
                  ? `erreur · ${cu.error || '?'}`
                  : 'clé absente'
            }
            status={cu?.ok ? 'OK' : cu?.configured ? 'ERR' : 'OFF'}
            statusColor={cu?.ok ? '#00FF99' : cu?.configured ? '#FF6B4A' : '#FFC857'}
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
          <div style={{ marginTop: 12, fontFamily: tokens.font.mono, fontSize: 9, color: tokens.color.textMuted, lineHeight: 1.5 }}>
            Compteurs locaux = chaque completion Core (OpenRouter / Anthropic) et chaque run Cloud Agent (Cursor, tokens via GET /usage — 0 si l’API n’a pas encore posé les chiffres).
            Crédits OpenRouter = API compte. Anthropic n’expose pas le solde sur la clé Messages.
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
                  borderRadius: tokens.radius.md,
                  background: tokens.color.surface,
                  border: `1px solid ${tokens.color.border}`,
                  backdropFilter: 'blur(16px)',
                }}
              >
                <div style={{ fontFamily: tokens.font.mono, fontSize: 9, color: tokens.color.textMuted, marginBottom: 8 }}>
                  {k.toUpperCase()}
                </div>
                <div style={{ fontFamily: tokens.font.body, fontSize: 16, color: tokens.color.text, marginBottom: 6 }}>
                  {fmtTokens(p?.tokens)}
                </div>
                <div style={{ fontFamily: tokens.font.mono, fontSize: 10, color: tokens.color.accent }}>
                  {p?.calls ?? 0} appels · {fmtUsd(p?.cost)}
                </div>
                <div style={{ marginTop: 8, fontFamily: tokens.font.mono, fontSize: 9, color: tokens.color.textMuted }}>
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
