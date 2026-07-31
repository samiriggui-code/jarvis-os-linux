import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'

export default function ApplicationsPage() {
  return (
    <PageShell>
      <PlaceholderBanner />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatPill label="CATALOG" value="7" />
      </div>
      <Card>
        <CardTitle>Applications</CardTitle>
        {['Terminal', 'Plex', 'VLC', 'VS Code', 'Docker', 'Chromium', 'Home Assistant'].map(app => (
          <Row key={app} name={app} meta="launcher · agent cible" status="AVAIL" />
        ))}
      </Card>
    </PageShell>
  )
}
