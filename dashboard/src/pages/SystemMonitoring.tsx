import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'
import { HOST } from '../types'

export default function SystemMonitoring() {
  return (
    <PageShell>
      <PlaceholderBanner note={`Monitoring — metrics live absentes. Cible : Core/Hermes/voix sur NUC · proxy TLS sur VPS (${HOST.label}).`} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <StatPill label="CPU" value="—" />
        <StatPill label="RAM" value="—" color="#A855F7" />
        <StatPill label="DISK" value="—" color="#FFC857" />
        <StatPill label="API" value="OFF" color="#FF6B4A" />
      </div>
      <div className="dash-grid-2">
        <Card>
          <CardTitle>Services foyer (NUC)</CardTitle>
          <Row name="jarvis-core" meta="WS :8765" status="PENDING" statusColor="#FFC857" />
          <Row name="hermes-agent" meta="orchestrateur" status="PENDING" statusColor="#FFC857" />
          <Row name="jarvis-voice" meta="Whisper + Piper" status="PENDING" statusColor="#FFC857" />
          <Row name="holomat" meta="dans Core" status="PENDING" statusColor="#FFC857" />
          <Row name="homeassistant" meta="HA sur NUC" status="PENDING" statusColor="#FFC857" />
        </Card>
        <Card>
          <CardTitle>Runtime public (VPS)</CardTitle>
          <Row name="Traefik" meta=":80/:443" status="PENDING" statusColor="#FFC857" />
          <Row name="Ollama secours" meta=":11434 localhost" status="PENDING" statusColor="#FFC857" />
          <Row name="Dashboard static" meta="HUD/Dash build" status="PENDING" statusColor="#FFC857" />
          <Row name="SSH" meta={HOST.ssh} status="CONFIG" />
          <Row name="jarvis-voice (legacy)" meta="supprimé du VPS" status="GONE" statusColor="rgba(224,244,255,0.35)" />
        </Card>
      </div>
    </PageShell>
  )
}
