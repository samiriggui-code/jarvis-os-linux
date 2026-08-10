/**
 * JARVIS BASE / Recovery — accessible clavier+souris sans HUD, sans voix, sans Hermes.
 * URL directe : /#/recovery · raccourci Ctrl+Alt+R
 *
 * Les indicateurs de santé étaient des `useState` figés qui ne bougeaient
 * jamais (coreWs/hermes/ha/hud toujours aux mêmes valeurs) — dangereux sur
 * LA page qu'on ouvre quand tout va mal. Remplacés par de vraies requêtes
 * Core (supervisor, hermes_status, providers, voicebox). HA/HUD/Docker
 * n'ont aucune sonde côté Core aujourd'hui — affichés "—" (inconnu),
 * jamais un faux vert ni un faux rouge.
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'
import type { Page } from '../types'
import { HOST } from '../types'

type CheckStatus = 'ok' | 'warn' | 'fail' | 'unk'

const STATUS_COLOR: Record<CheckStatus, string> = {
  ok: '#34C759',
  warn: '#FFC857',
  fail: '#FF3B30',
  unk: 'rgba(17,17,20,0.35)',
}

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: 'OK',
  warn: 'WARN',
  fail: 'FAIL',
  unk: '—',
}

import { coreWsUrl } from '../lib/coreWs'
const CORE_WS = coreWsUrl()

type Checks = {
  dashboard: CheckStatus
  coreWs: CheckStatus
  hermes: CheckStatus
  voicebox: CheckStatus
  apiKeys: CheckStatus
  ha: CheckStatus
  hud: CheckStatus
  docker: CheckStatus
}

const UNKNOWN: Checks = {
  dashboard: 'ok',
  coreWs: 'fail',
  hermes: 'unk',
  voicebox: 'unk',
  apiKeys: 'unk',
  ha: 'unk',
  hud: 'unk',
  docker: 'unk',
}

export default function RecoveryPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [checks, setChecks] = useState<Checks>(UNKNOWN)
  const [checking, setChecking] = useState(false)

  const runChecks = useCallback(() => {
    setChecking(true)
    const next: Checks = { ...UNKNOWN }
    let gotAny = false
    let settled = false

    const ws = new WebSocket(CORE_WS)
    const finish = () => {
      if (settled) return
      settled = true
      next.coreWs = gotAny ? 'ok' : 'fail'
      setChecks(next)
      setChecking(false)
      try { ws.close() } catch { /* */ }
    }
    const timer = window.setTimeout(finish, 8000)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'hermes_status', action: 'status' }))
      ws.send(JSON.stringify({ type: 'providers', action: 'status' }))
      ws.send(JSON.stringify({ type: 'voicebox', action: 'status' }))
    }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data))
        gotAny = true
        if (data.type === 'hermes_result') {
          next.hermes = data.healthy ? 'ok' : (data.configured ? 'fail' : 'warn')
        }
        if (data.type === 'providers_result') {
          const orOk = data.openrouter?.ok === true
          const ollamaOk = data.ollama?.ok === true
          next.apiKeys = orOk || ollamaOk ? 'ok' : (data.mode === 'system' ? 'warn' : 'fail')
        }
        if (data.type === 'voicebox_result') {
          next.voicebox = data.available === true ? 'ok' : (data.available === false ? 'fail' : 'unk')
        }
      } catch { /* */ }
    }
    ws.onerror = () => {
      window.clearTimeout(timer)
      finish()
    }
    // Le Core répond aux 3 requêtes vite (santé sondée en parallèle côté
    // handlers) — pas besoin d'attendre les 8s si tout est déjà revenu.
    const settleSoon = window.setTimeout(() => {
      if (gotAny) { window.clearTimeout(timer); finish() }
    }, 4000)
    return () => window.clearTimeout(settleSoon)
  }, [])

  useEffect(() => { runChecks() }, [runChecks])

  const issues = [
    {
      id: 'hud',
      title: 'HUD ne répond plus',
      detail: 'Kiosk figé / blanc / orbe morte — ouvrir ce Dashboard en navigateur (souris) sur le VPS.',
      go: 'system' as Page,
      fix: ['Ouvrir https://vps/dashboard/#/recovery', 'Vérifier jarvis-hud / process React', 'Redémarrer stack Docker hud'],
    },
    {
      id: 'api',
      title: 'Clé API / Provider HS',
      detail: 'OpenRouter / cloud / Ollama — LLM muet ou erreurs 401.',
      go: 'ai' as Page,
      fix: ['IA / Providers → statut route', 'Vérifier secrets (.env / coffre) — jamais en clair ici', 'Bascule mode sans LLM (JARVIS BASE)'],
    },
    {
      id: 'mic',
      title: 'Voicebox injoignable',
      detail: 'Pas de synthèse/transcription — le Core replie sur tts_fallback / SpeechSynthesis navigateur.',
      go: 'voice' as Page,
      fix: ['Voice Manager → statut voicebox', 'Vérifier tunnel SSH NUC→VPS (17600)', 'jarvis-tunnel-voicebox.service'],
    },
    {
      id: 'hermes',
      title: 'Hermes déconne',
      detail: 'Agent :8642 down, timeouts, skills morts.',
      go: 'hermes' as Page,
      fix: ['Hermes Core → health :8642', 'Docker → hermes-agent restart', 'Terminal → logs container'],
    },
    {
      id: 'ha',
      title: 'Home Assistant difficile à paramétrer',
      detail: 'Token HA, URL, IoT gateway — config manuelle ici. Aucune sonde automatique aujourd’hui.',
      go: 'settings' as Page,
      fix: ['Entités / Tools → ha.control', 'URL + token HA (secrets)', 'Isoler IoT du Core (réseau)'],
    },
  ]

  return (
    <PageShell>
      <div style={{
        marginBottom: 14,
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid rgba(255,107,74,0.45)',
        background: 'rgba(255,107,74,0.08)',
      }}>
        <div style={{ fontFamily: 'Inter', fontSize: 12, letterSpacing: '0.14em', color: '#FF6B4A', marginBottom: 6 }}>
          MODE RECOVERY · JARVIS BASE
        </div>
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(17,17,20,0.75)', lineHeight: 1.5 }}>
          Entrée <strong style={{ color: '#FFC857' }}>clavier + souris uniquement</strong> — pas de voix, pas de HUD, pas besoin que Hermes réponde.
          URL directe <code style={{ color: '#0A84FF' }}>#/recovery</code> · raccourci <code style={{ color: '#0A84FF' }}>Ctrl+Alt+R</code>.
        </div>
      </div>

      <PlaceholderBanner note={checking ? 'Sonde en cours (Hermes, Providers, Voicebox)…' : 'HA/HUD/Docker : aucune sonde côté Core — "—" veut dire inconnu, jamais un statut inventé.'} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {(
          [
            ['DASHBOARD', checks.dashboard],
            ['CORE WS', checks.coreWs],
            ['HERMES', checks.hermes],
            ['VOICEBOX', checks.voicebox],
            ['API', checks.apiKeys],
            ['HA', checks.ha],
            ['HUD', checks.hud],
            ['DOCKER', checks.docker],
          ] as [string, CheckStatus][]
        ).map(([label, st]) => (
          <StatPill key={label} label={label} value={STATUS_LABEL[st]} color={STATUS_COLOR[st]} />
        ))}
      </div>

      <div className="dash-grid-2">
        <Card>
          <CardTitle>Scénarios de dépannage</CardTitle>
          {issues.map(issue => (
            <div
              key={issue.id}
              style={{
                padding: '12px 0',
                borderBottom: '1px solid rgba(17,17,20,0.06)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: 'rgba(17,17,20,0.9)', marginBottom: 4 }}>
                    {issue.title}
                  </div>
                  <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(17,17,20,0.55)', marginBottom: 8, lineHeight: 1.45 }}>
                    {issue.detail}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(17,17,20,0.45)', lineHeight: 1.6 }}>
                    {issue.fix.map(f => <li key={f}>{f}</li>)}
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(issue.go)}
                  style={{
                    flexShrink: 0,
                    fontFamily: 'JetBrains Mono',
                    fontSize: 10,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,200,87,0.5)',
                    background: 'rgba(255,200,87,0.12)',
                    color: '#B8860B',
                    cursor: 'pointer',
                  }}
                >
                  Ouvrir →
                </button>
              </div>
            </div>
          ))}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <CardTitle>Accès indépendant du HUD</CardTitle>
            <Row name="URL Dashboard" meta={`https://${HOST.label}/dashboard/`} status="SOURIS" statusColor="#0A84FF" />
            <Row name="Recovery deep-link" meta="#/recovery" status="BOOKMARK" statusColor="#FFC857" />
            <Row name="SSH secours" meta={HOST.ssh} status="HORS UI" statusColor="#FF3B30" />
            <Row name="Docker UI" meta={HOST.dockerUi} status="LINK" statusColor="rgba(17,17,20,0.5)" />
            <div style={{ marginTop: 10, fontFamily: 'Inter', fontSize: 12, color: 'rgba(17,17,20,0.6)', lineHeight: 1.5 }}>
              Si le kiosk HUD est mort, ouvre un navigateur normal (PC / tablette) vers le VPS — ce Dashboard reste le cockpit de réparation (JARVIS BASE / Recovery).
            </div>
          </Card>

          <Card>
            <CardTitle>Actions rapides</CardTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {([
                ['terminal', 'Terminal'],
                ['docker', 'Docker'],
                ['ai', 'API / LLM'],
                ['voice', 'Voix'],
                ['hermes', 'Hermes'],
                ['settings', 'HA / Policy'],
              ] as [Page, string][]).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate(id)}
                  style={{
                    fontFamily: 'JetBrains Mono',
                    fontSize: 10,
                    padding: '7px 11px',
                    borderRadius: 999,
                    border: '1px solid rgba(10,132,255,0.3)',
                    background: 'rgba(10,132,255,0.08)',
                    color: '#0A84FF',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Ré-sonder</CardTitle>
            <button
              type="button"
              onClick={runChecks}
              disabled={checking}
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: 11,
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid rgba(17,17,20,0.12)',
                background: 'rgba(255,255,255,0.5)',
                cursor: checking ? 'default' : 'pointer',
                opacity: checking ? 0.6 : 1,
              }}
            >
              {checking ? 'Sonde en cours…' : 'Relancer les checks'}
            </button>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
