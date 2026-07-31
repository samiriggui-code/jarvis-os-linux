import { Card, CardTitle, PageShell, PlaceholderBanner, Row } from '../components/ui'
import { HOST } from '../types'

/** Réglages système Dashboard — host VPS + Policy. Distinct Settings HUD. */
export default function SystemSettings() {
  return (
    <PageShell>
      <PlaceholderBanner note="Panneau système VPS : Policy, Docker UI URL, chemins projets, recovery — pas Settings expérience HUD." />
      <div className="dash-grid-2">
        <Card>
          <CardTitle>Policy Engine</CardTitle>
          <Row name="info / média" meta="auto" status="ALLOW" />
          <Row name="domotique" meta="confirm" status="CONFIRM" statusColor="#FFC857" />
          <Row name="shell / docker / deploy" meta="VPS admin" status="DENY→AUTH" statusColor="#FF6B4A" />
        </Card>
        <Card>
          <CardTitle>Host VPS</CardTitle>
          <Row name="Hostname" meta={HOST.label} status="SET" />
          <Row name="Root path" meta={HOST.path} status="SET" />
          <Row name="Docker UI URL" meta={HOST.dockerUi} status="CONFIG" statusColor="#FFC857" />
          <Row name="SSH" meta={HOST.ssh} status="CONFIG" statusColor="#FFC857" />
        </Card>
        <Card>
          <CardTitle>Maintenance</CardTitle>
          <Row name="Recovery Manager" meta="JARVIS BASE" status="READY" />
          <Row name="Backup volumes" meta="docker · data" status="IDLE" statusColor="#FFC857" />
          <Row name="Secrets" meta="hors git · coffre TBD" status="EXTERNAL" statusColor="#FFC857" />
        </Card>
        <Card>
          <CardTitle>Holomat (admin)</CardTitle>
          <Row name="FaceEngine models" meta="YuNet / SFace" status="ON DISK" />
          <Row name="vendor/vision" meta="Holomat · HandTracking" status="MERGED" />
          <Row name="Auth factors" meta="face ≠ seul accès" status="ENFORCED" />
        </Card>
      </div>
    </PageShell>
  )
}
