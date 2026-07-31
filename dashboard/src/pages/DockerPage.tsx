import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'
import { HOST } from '../types'

/** Docker — catalogue cible. Pas de faux "up" tant que l’API host n’est pas branchée. */
export default function DockerPage() {
  const containers = [
    { name: 'ollama (VPS)', image: 'ollama/ollama', ports: '127.0.0.1:11434', status: 'PENDING', note: 'secours LLM — déjà possible sur VPS' },
    { name: 'traefik', image: 'traefik', ports: '80/443', status: 'PENDING', note: 'TLS / reverse WSS → Core NUC' },
    { name: 'jarvis-core', image: '—', ports: 'NUC:8765', status: 'NUC', note: 'pas sur le VPS (archi foyer)' },
    { name: 'hermes-agent', image: '—', ports: 'NUC', status: 'NUC', note: 'à côté du Core' },
  ]

  return (
    <PageShell>
      <PlaceholderBanner note="Docker VPS = Traefik + Ollama secours. Core/Hermes/voix = NUC. Liste non live tant que Tool Manager absent." />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <StatPill label="HOST" value={HOST.role} color="#00E5FF" />
        <StatPill label="LIVE API" value="OFF" color="#FFC857" />
        <StatPill label="CORE" value="NUC" color="#22c55e" />
      </div>

      <div className="dash-grid-2">
        <Card>
          <CardTitle>Cibles (pas un docker ps live)</CardTitle>
          {containers.map(c => (
            <Row
              key={c.name}
              name={c.name}
              meta={`${c.image} · ${c.ports} · ${c.note}`}
              status={c.status}
              statusColor={c.status === 'NUC' ? '#00E5FF' : '#FFC857'}
            />
          ))}
        </Card>

        <Card>
          <CardTitle>Docker UI</CardTitle>
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(224,244,255,0.75)', lineHeight: 1.55, marginBottom: 12 }}>
            Portainer / UI optionnel sur le VPS — après Policy admin. Pas de faux RUNNING.
          </div>
          <div style={{
            padding: 12,
            borderRadius: 8,
            border: '1px dashed rgba(0,229,255,0.25)',
            background: 'rgba(0,229,255,0.04)',
            fontFamily: 'JetBrains Mono',
            fontSize: 11,
            color: '#00E5FF',
            marginBottom: 12,
            wordBreak: 'break-all',
          }}>
            {HOST.dockerUi}
          </div>
          <Row name="Compose JARVIS" meta="à définir au deploy NUC+VPS" status="TODO" statusColor="#FFC857" />
        </Card>
      </div>
    </PageShell>
  )
}
