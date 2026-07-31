import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'

export default function ToolsPage() {
  return (
    <PageShell>
      <PlaceholderBanner note="Tool Manager §2 — catalogue ; exécution toujours via Policy Engine." />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatPill label="TOOLS" value="12" />
        <StatPill label="CRITICAL" value="3" color="#FF6B4A" />
      </div>
      <Card>
        <CardTitle>Catalogue</CardTitle>
        <Row name="shell.exec" meta="admin · confirmation" status="POLICY" statusColor="#FF6B4A" />
        <Row name="files.read" meta="info" status="ALLOW" />
        <Row name="agent_reach.*" meta="Internet · Hermes skill" status="DELEGATE" statusColor="#00E5FF" />
        <Row name="ha.service" meta="domotique" status="CONFIRM" statusColor="#FFC857" />
        <Row name="media.play" meta="média" status="ALLOW" />
        <Row name="docker.ps" meta="system" status="ALLOW" />
        <p style={{ marginTop: 12, fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
          Paramétrage Agent-Reach → page sidebar « Agent-Reach » (doctor, install, cookies).
        </p>
      </Card>
    </PageShell>
  )
}
