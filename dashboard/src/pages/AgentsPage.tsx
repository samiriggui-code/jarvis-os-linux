import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'

export default function AgentsPage() {
  return (
    <PageShell>
      <PlaceholderBanner note="Agent Manager §13.4 — catalogue agents d’appareil (pas agents lifestyle)." />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatPill label="INSTALLED" value="3" />
        <StatPill label="UPDATES" value="0" color="#00FF99" />
      </div>
      <Card>
        <CardTitle>Registry</CardTitle>
        <Row name="agent-windows" meta="v0.1.0 · shell, media, apps" status="OK" />
        <Row name="agent-linux" meta="v0.1.0 · systemd, docker" status="OK" />
        <Row name="agent-android" meta="v0.0.3 · limited" status="STALE" statusColor="#FFC857" />
      </Card>
    </PageShell>
  )
}
