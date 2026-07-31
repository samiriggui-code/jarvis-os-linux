import { useState } from 'react'
import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'
import type { Page } from '../types'
import { HOST } from '../types'

type CheckStatus = 'ok' | 'warn' | 'fail' | 'unk'

const STATUS_COLOR: Record<CheckStatus, string> = {
  ok: '#00FF99',
  warn: '#FFC857',
  fail: 'rgba(255,100,100,0.9)',
  unk: 'rgba(224,244,255,0.4)',
}

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: 'OK',
  warn: 'WARN',
  fail: 'FAIL',
  unk: '—',
}

/**
 * JARVIS BASE / Recovery — accessible clavier+souris sans HUD, sans voix, sans Hermes.
 * URL directe : /#/recovery  ·  raccourci Ctrl+Alt+R
 */
export default function RecoveryPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [checks] = useState({
    dashboard: 'ok' as CheckStatus,
    coreWs: 'warn' as CheckStatus,
    hermes: 'fail' as CheckStatus,
    voiceMic: 'warn' as CheckStatus,
    apiKeys: 'warn' as CheckStatus,
    ha: 'fail' as CheckStatus,
    hud: 'fail' as CheckStatus,
    docker: 'ok' as CheckStatus,
  })

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
      title: 'Micro mal configuré',
      detail: 'Pas de listening / STT muet — dépannage clavier, pas vocal.',
      go: 'voice' as Page,
      fix: ['Voice Manager → device défaut', 'Tester périphérique OS', 'Désactiver wake word temporairement'],
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
      detail: 'Token HA, URL, IoT gateway — config manuelle ici.',
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
        <div style={{ fontFamily: 'Orbitron', fontSize: 12, letterSpacing: '0.14em', color: '#FF6B4A', marginBottom: 6 }}>
          MODE RECOVERY · JARVIS BASE
        </div>
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(224,244,255,0.8)', lineHeight: 1.5 }}>
          Entrée <strong style={{ color: '#FFC857' }}>clavier + souris uniquement</strong> — pas de voix, pas de HUD, pas besoin que Hermes réponde.
          URL directe <code style={{ color: '#00E5FF' }}>#/recovery</code> · raccourci <code style={{ color: '#00E5FF' }}>Ctrl+Alt+R</code>.
        </div>
      </div>

      <PlaceholderBanner note="Checks mock — brancher Health Manager / Recovery Manager (§12). Secrets jamais affichés en clair." />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {(
          [
            ['DASHBOARD', checks.dashboard],
            ['CORE WS', checks.coreWs],
            ['HERMES', checks.hermes],
            ['MIC', checks.voiceMic],
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
                borderBottom: '1px solid rgba(0,229,255,0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: 'rgba(224,244,255,0.95)', marginBottom: 4 }}>
                    {issue.title}
                  </div>
                  <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224,244,255,0.55)', marginBottom: 8, lineHeight: 1.45 }}>
                    {issue.detail}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0,229,255,0.55)', lineHeight: 1.6 }}>
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
                    border: '1px solid rgba(255,200,87,0.35)',
                    background: 'rgba(255,200,87,0.1)',
                    color: '#FFC857',
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
            <Row name="URL Dashboard" meta={`https://${HOST.label}/dashboard/`} status="SOURIS" statusColor="#00E5FF" />
            <Row name="Recovery deep-link" meta="#/recovery" status="BOOKMARK" statusColor="#FFC857" />
            <Row name="SSH secours" meta={HOST.ssh} status="HORS UI" statusColor="#FF6B4A" />
            <Row name="Docker UI" meta={HOST.dockerUi} status="LINK" />
            <div style={{ marginTop: 10, fontFamily: 'Inter', fontSize: 12, color: 'rgba(224,244,255,0.6)', lineHeight: 1.5 }}>
              Si le kiosk HUD est mort, ouvre un navigateur normal (PC / tablette) vers le VPS — ce Dashboard reste le cockpit de réparation (JARVIS BASE §1 / Recovery §12).
            </div>
          </Card>

          <Card>
            <CardTitle>Actions rapides</CardTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {([
                ['terminal', 'Terminal'],
                ['docker', 'Docker'],
                ['ai', 'API / LLM'],
                ['voice', 'Micro'],
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
                    borderRadius: 6,
                    border: '1px solid rgba(0,229,255,0.25)',
                    background: 'rgba(0,229,255,0.08)',
                    color: '#00E5FF',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
