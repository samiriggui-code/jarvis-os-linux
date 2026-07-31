import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'

/**
 * Holomat côté Dashboard = admin (services, FaceEngine, calib machine).
 * Caméra ON / calibrage utilisateur / mapping gestes = Settings HUD (expérience).
 * Persistance :
 *   - gesture_profile + hud_preferences → core/data/users/<id>/
 *   - calibration machine → core/data/holomat/calibration.json
 *   - face_profile → core/data/users/<id>/face_profile
 */
export default function HolomatPage() {
  return (
    <PageShell>
      <PlaceholderBanner note="Admin Holomat. L’onglet Paramètres du HUD (VISION) allume la caméra, lance la calib et sauve gesture_profile — pas ici." />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <StatPill label="FACE ENGINE" value="READY" color="#00FF99" />
        <StatPill label="CAMERA" value="HUD" color="#A855F7" />
        <StatPill label="GESTURES" value="PROFILE" color="#00E5FF" />
        <StatPill label="CALIB FILE" value="JSON" color="#FFC857" />
      </div>

      <div className="dash-grid-2">
        <Card>
          <CardTitle>Où c’est stocké</CardTitle>
          <Row name="hud_preferences" meta="core/data/users/&lt;id&gt;/ — caméra, Holomat on/off, coupures" status="USER" />
          <Row name="gesture_profile" meta="même dossier — main, sensibilité, bindings" status="USER" />
          <Row name="face_profile" meta="embeddings SFace (auth)" status="USER" />
          <Row name="calibration.json" meta="core/data/holomat/ — machine Charuco" status="HOST" statusColor="#FFC857" />
          <Row name="Mémoire chat" meta="Hermes / Memory Manager" status="NON" statusColor="rgba(255,100,100,0.8)" />
        </Card>

        <Card>
          <CardTitle>Frontière Settings</CardTitle>
          <Row name="HUD → Paramètres → Vision" meta="caméra ON, calib, gestes live" status="EXPÉRIENCE" />
          <Row name="HUD → Contrôle gestuel" meta="icône main TopBar" status="LIVE" />
          <Row name="Dashboard → Holomat" meta="services, FaceEngine, health" status="ADMIN" statusColor="#FFC857" />
          <Row name="Dashboard → Recovery" meta="si HUD mort" status="SURVIE" statusColor="#FF6B4A" />
        </Card>

        <Card>
          <CardTitle>Pipeline vision (admin)</CardTitle>
          <Row name="FaceEngine" meta="YuNet + SFace · jarvis-core" status="READY" />
          <Row name="MediaPipe Hands" meta="vendor/vision/HandTracking" status="TODO" statusColor="#FFC857" />
          <Row name="Charuco" meta="vendor/vision/Holomat" status="STUB→FILE" statusColor="#FFC857" />
          <Row name="jarvis-vision" meta="service systemd (cible)" status="PLANNED" statusColor="rgba(224,244,255,0.35)" />
        </Card>

        <Card>
          <CardTitle>Identité</CardTitle>
          <Row name="Face match" meta="facteur, pas sésame" status="FACTOR" statusColor="#FFC857" />
          <Row name="+ Voice / PIN / geste" meta="User Manager §10.1" status="REQUIRED" />
          <div style={{ marginTop: 12, fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0,229,255,0.4)', lineHeight: 1.5 }}>
            Pour calibrer : ouvrir le HUD → engrenage Paramètres → VISION / HOLOMAT → Allumer caméra → Lancer calibration → Enregistrer.
          </div>
        </Card>
      </div>
    </PageShell>
  )
}
