import { Card, CardTitle, PageShell, Row, StatPill } from '../components/ui'
import type { Page } from '../types'
import { HOST } from '../types'

export default function CommandCenter({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const events = [
    { t: '—', msg: 'File events Core — pas encore branchée (usage_events / bus)' },
    { t: '—', msg: `Cible : Core+Hermes sur ${HOST.coreHost} · Dashboard via ${HOST.label}` },
  ]

  const jump: [Page, string][] = [
    ['recovery', 'Recovery'],
    ['holomat', 'Holomat'],
    ['docker', 'Docker'],
    ['terminal', 'Terminal'],
    ['deploy', 'Deploy'],
  ]

  return (
    <PageShell>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'Orbitron, sans-serif', fontSize: 18, fontWeight: 600, letterSpacing: '0.12em', color: '#e0f4ff' }}>
            Command Center
          </h1>
          <p style={{ margin: '8px 0 0', fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(224,244,255,0.45)', lineHeight: 1.45 }}>
            {HOST.label} · Core {HOST.coreHost} — HUD HS → Recovery (Ctrl+Alt+R).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {jump.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                padding: '7px 12px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.1)',
                background: id === 'recovery' ? 'rgba(255,107,74,0.1)' : 'rgba(255,255,255,0.03)',
                color: id === 'recovery' ? '#FF6B4A' : 'rgba(0,229,255,0.85)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <StatPill label="HOST" value="VPS" />
        <StatPill label="HERMES" value="ONLINE" color="#00FF99" />
        <StatPill label="DOCKER" value="4↑" color="#00E5FF" />
        <StatPill label="HOLOMAT" value="READY" color="#A855F7" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <Card>
          <CardTitle>Agents</CardTitle>
          <Row name="vps-agent" meta={`${HOST.label} · linux`} status="READY" />
          <Row name="windows-agent" meta="PC local" status="READY" />
          <Row name="nuc-home" meta="LAN" status="READY" />
        </Card>

        <Card>
          <CardTitle>Accès host</CardTitle>
          <Row name="Terminal" meta="shell admin" status="MOCK" statusColor="#FFC857" />
          <Row name="Docker UI" meta="Portainer" status="LINK" />
          <Row name="Déploiements" meta="/opt/apps" status="READY" />
        </Card>

        <Card>
          <CardTitle>Événements</CardTitle>
          {events.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', width: 40 }}>{e.t}</span>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(224,244,255,0.7)' }}>{e.msg}</span>
            </div>
          ))}
        </Card>
      </div>
    </PageShell>
  )
}
