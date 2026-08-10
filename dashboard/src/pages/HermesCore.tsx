/**
 * Hermes — statut réel via Core WS type=hermes_status.
 * Toolsets : liste RÉELLEMENT enabled/configured côté Hermes (pas la liste
 * déclarée dans capabilities.py — les deux divergent, cf. analyse du 09/08).
 * Skills : lus statiquement depuis deploy/hermes/skills/<nom>/SKILL.md (pas
 * de route WS pour ça — liste exacte, pas une supposition comme avant).
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'

type ToolsetInfo = { name?: string; enabled?: boolean; configured?: boolean }
type HermesStatus = {
  ok?: boolean
  configured?: boolean
  healthy?: boolean
  url?: string
  toolsets?: ToolsetInfo[]
  error?: string
}

import { coreWsUrl } from '../lib/coreWs'
const CORE_WS = coreWsUrl()

const SKILLS: { name: string; blurb: string }[] = [
  { name: 'agent-reach', blurb: 'Recherche web/Exa, GitHub, YouTube, Reddit, X, RSS — Hermes décide, Agent-Reach ne fait que fetch.' },
  { name: 'ecosystem-hosts', blurb: 'Choisit la bonne machine (VPS/NUC/Windows/HA/ProLiant) pour exécuter une intention.' },
  { name: 'family-enroll', blurb: 'Enrôle un membre du foyer (USER/CHILD) via Core Auth WS + capture Holomat.' },
  { name: 'hud-apps', blurb: "Catalogue des apps HUD pilotables — l'intention passe toujours par capabilities.py + Policy." },
  { name: 'jarvis-os', blurb: 'Loi produit : protocole vocal, rôles foyer, Policy avant exécution.' },
  { name: 'user-locale', blurb: 'Langue de réponse + preset voix selon le profil identifié (face+voix).' },
]

export default function HermesCore() {
  const [st, setSt] = useState<HermesStatus | null>(null)
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
      ws.send(JSON.stringify({ type: 'hermes_status', action: 'status' }))
    }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data))
        if (data.type === 'hermes_result') {
          settled = true
          window.clearTimeout(timer)
          setSt(data as HermesStatus)
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

  const healthy = st?.healthy === true
  const configured = st?.configured === true
  const toolsets = st?.toolsets || []

  return (
    <PageShell>
      <PlaceholderBanner note={err || "Hermes tourne exclusivement sur le NUC (127.0.0.1:8642, jamais exposé publiquement)."} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <StatPill label="SANTÉ" value={loading ? '…' : healthy ? 'EN LIGNE' : 'HORS LIGNE'} color={healthy ? '#34C759' : '#FF3B30'} />
        <StatPill label="CLÉ API" value={loading ? '…' : configured ? 'CONFIGURÉE' : 'MANQUANTE'} color={configured ? '#34C759' : '#FFC857'} />
        <StatPill label="URL" value={st?.url || '—'} color="#0A84FF" />
        <StatPill label="TOOLSETS ACTIFS" value={loading ? '…' : String(toolsets.filter(t => t.enabled && t.configured).length)} />
      </div>

      <div className="dash-grid-2">
        <Card>
          <CardTitle>Toolsets — réellement utilisables (enabled ET configured)</CardTitle>
          {loading && <Row name="Chargement…" meta="" status="…" />}
          {!loading && toolsets.length === 0 && (
            <Row name="Aucune donnée" meta={healthy ? 'Hermes en ligne mais 0 toolset renvoyé' : 'Hermes hors ligne'} status="—" statusColor="#FF3B30" />
          )}
          {toolsets.map((t, i) => {
            const usable = Boolean(t.enabled && t.configured)
            return (
              <Row
                key={`${t.name}-${i}`}
                name={String(t.name || '?')}
                meta={t.enabled ? (t.configured ? 'enabled · configured' : 'enabled · pas configuré (clé manquante)') : 'désactivé'}
                status={usable ? 'OK' : (t.enabled ? 'INCOMPLET' : 'OFF')}
                statusColor={usable ? '#34C759' : t.enabled ? '#FFC857' : 'rgba(17,17,20,0.35)'}
              />
            )
          })}
        </Card>

        <Card>
          <CardTitle>Skills (deploy/hermes/skills/*/SKILL.md)</CardTitle>
          {SKILLS.map(s => (
            <Row key={s.name} name={s.name} meta={s.blurb} status="" statusColor="transparent" />
          ))}
        </Card>
      </div>

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
