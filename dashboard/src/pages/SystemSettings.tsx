import { Card, CardTitle, PageShell, PlaceholderBanner, Row } from '../components/ui'
import { HOST } from '../types'

/**
 * Réglages système Dashboard — vue d'ensemble opérationnelle.
 * Settings expérience (voix, caméra, kill switch) = HUD, jamais ici.
 */
export default function SystemSettings() {
  return (
    <PageShell>
      <PlaceholderBanner note="Admin système : Policy, host, recovery, Holomat. Expérience utilisateur → HUD Paramètres." />
      <div className="dash-grid-2">
        <Card>
          <CardTitle>Policy Engine</CardTitle>
          <Row name="info" meta="lecture · status" status="ALLOW" />
          <Row name="média" meta="plex · cast" status="ALLOW" />
          <Row name="domotique" meta="Home Assistant" status="CONFIRM" statusColor="#FFC857" />
          <Row name="admin / shell" meta="VPS · docker · deploy" status="DENY→AUTH" statusColor="#FF6B4A" />
          <Row name="enrôlement foyer" meta="admin session ou recovery PIN" status="GATED" statusColor="#FFC857" />
        </Card>
        <Card>
          <CardTitle>Host / Accès</CardTitle>
          <Row name="Hostname" meta={HOST.label} status="SET" />
          <Row name="Root path" meta={HOST.path} status="SET" />
          <Row name="Docker UI" meta={HOST.dockerUi} status="CONFIG" statusColor="#FFC857" />
          <Row name="SSH" meta={HOST.ssh} status="CONFIG" statusColor="#FFC857" />
          <Row name="HUD public" meta="jarvis.global-it-ss.com" status="HTTPS" />
        </Card>
        <Card>
          <CardTitle>Auth / Session</CardTitle>
          <Row name="Facteurs login" meta="phrase vocale (DECISIONS 2026-08-07) · Dashboard gate encore visage" status="À MIGRER" statusColor="#FFC857" />
          <Row name="Unlock session" meta="HUD : AuthVoiceWave · pas de fenêtre caméra d’accès" status="HUD" />
          <Row name="Wake word" meta="hey Jarvis · écrit, non branché" status="OFF" statusColor="#FFC857" />
          <Row name="Caméra idle" meta="éteinte hors auth/gestes" status="ENFORCED" />
          <Row name="Recovery PIN" meta="niveau 0 · docs/RECOVERY.md" status="READY" />
        </Card>
        <Card>
          <CardTitle>Maintenance</CardTitle>
          <Row name="Recovery Manager" meta="JARVIS BASE" status="READY" />
          <Row name="Backup volumes" meta="docker · data" status="IDLE" statusColor="#FFC857" />
          <Row name="Secrets" meta="hors git · coffre TBD" status="EXTERNAL" statusColor="#FFC857" />
          <Row name="Face profiles" meta="core/data/users/<id>/face_profile" status="LOCAL" />
        </Card>
        <Card>
          <CardTitle>Holomat (admin)</CardTitle>
          <Row name="FaceEngine" meta="YuNet / SFace" status="ON DISK" />
          <Row name="Auth factors" meta="face ≠ seul accès total" status="ENFORCED" />
          <Row name="Gestures" meta="opt-in · pas laptop par défaut" status="POLICY" />
        </Card>
        <Card>
          <CardTitle>Agentic / HA</CardTitle>
          <Row name="Surfaces" meta="prefab + compose" status="PARTIAL" statusColor="#FFC857" />
          <Row name="Capabilities" meta="déclaré ≠ exécutable" status="AUDIT" statusColor="#FFC857" />
          <Row name="Home Assistant" meta="Pi salon · fond" status="WIRED" />
          <Row name="Intentions SOON" meta="docker · storage · devices" status="VISIBLE" statusColor="#FFC857" />
        </Card>
      </div>
    </PageShell>
  )
}
