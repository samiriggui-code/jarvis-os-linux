import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'

export default function Entities() {
  return (
    <PageShell>
      <PlaceholderBanner note="Discovery ≠ droits — appairage obligatoire avant contrôle (§6)." />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatPill label="DEVICES" value="5" />
        <StatPill label="USERS" value="2" color="#A855F7" />
        <StatPill label="PAIRED" value="4" color="#00FF99" />
      </div>
      <div className="dash-grid-2">
        <Card>
          <CardTitle>Appareils</CardTitle>
          <Row name="NUC principal" meta="linux · jarvis-base" status="ONLINE" />
          <Row name="PC Windows" meta="agent win32" status="ONLINE" />
          <Row name="TV salon" meta="cast · unpaired" status="PENDING" statusColor="#FFC857" />
          <Row name="Cam Holomat" meta="vision · calibrated" status="ONLINE" />
        </Card>
        <Card>
          <CardTitle>Utilisateurs</CardTitle>
          <Row name="admin" meta="dashboard_access · ADMIN" status="ACTIVE" />
          <Row name="guest" meta="HUD only" status="LIMITED" statusColor="#FFC857" />
        </Card>
      </div>
    </PageShell>
  )
}
