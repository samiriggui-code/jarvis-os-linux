import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'
import { HOST } from '../types'

/** Projets hébergés / déployés sur le VPS — JARVIS garde la main pour futurs deploys. */
export default function DeployPage() {
  const projects = [
    {
      name: 'jarvis-os-linux',
      path: HOST.path,
      stack: 'core · hud · dashboard · hermes',
      status: 'RUNNING',
      ok: true,
    },
    {
      name: 'jarvis-dashboard',
      path: `${HOST.path}/dashboard`,
      stack: 'React · Vite · :5174→proxy',
      status: 'RUNNING',
      ok: true,
    },
    {
      name: '(slot) future-app',
      path: '/opt/apps/_empty',
      stack: 'git · docker compose · policy',
      status: 'READY',
      ok: false,
    },
  ]

  return (
    <PageShell>
      <PlaceholderBanner note="Déploiements VPS — JARVIS peut cloner, build, compose up/down pour ce monorepo et de futurs projets (après Policy admin)." />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <StatPill label="PROJECTS" value={String(projects.length)} />
        <StatPill label="LIVE" value="2" color="#00FF99" />
        <StatPill label="SLOTS" value="1" color="#FFC857" />
      </div>

      <div className="dash-grid-2">
        <Card>
          <CardTitle>Projets sur {HOST.label}</CardTitle>
          {projects.map(p => (
            <Row
              key={p.name}
              name={p.name}
              meta={`${p.path} · ${p.stack}`}
              status={p.status}
              statusColor={p.ok ? '#00FF99' : '#FFC857'}
            />
          ))}
        </Card>

        <Card>
          <CardTitle>Actions JARVIS (cibles)</CardTitle>
          <Row name="git pull / checkout" meta="repo authentifié" status="POLICY" statusColor="#FF6B4A" />
          <Row name="docker compose up -d" meta="stack projet" status="POLICY" statusColor="#FF6B4A" />
          <Row name="health + rollback" meta="Recovery Manager" status="READY" />
          <Row name="nouveau projet" meta="slot /opt/apps/&lt;name&gt;" status="SOON" statusColor="#FFC857" />
          <div style={{ marginTop: 14, fontFamily: 'Inter', fontSize: 12, color: 'rgba(224,244,255,0.65)', lineHeight: 1.55 }}>
            Le Dashboard tourne sur le VPS : tu pilotes le host où vit le code, Docker UI, terminal et futurs déploiements — sans confondre avec le HUD kiosk local.
          </div>
        </Card>
      </div>
    </PageShell>
  )
}
