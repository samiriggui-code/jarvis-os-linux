import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'

export default function HermesCore() {
  return (
    <PageShell>
      <PlaceholderBanner note="Hermes sur NUC (à côté du Core). Statuts live = health JARVIS_HERMES_URL — pas encore branché." />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <StatPill label="AGENT" value="—" color="rgba(224,244,255,0.5)" />
        <StatPill label="HOST" value="NUC" color="#00E5FF" />
        <StatPill label="SESSIONS" value="—" />
        <StatPill label="SKILLS" value="—" color="#FFC857" />
      </div>

      <div className="dash-grid-2">
        <Card>
          <CardTitle>Statut agent</CardTitle>
          <Row name="Hermes Agent" meta="NUC · HTTP health (JARVIS_HERMES_URL)" status="PENDING" statusColor="#FFC857" />
          <Row name="jarvis_core WS" meta="NUC :8765 · proxy VPS WSS" status="PENDING" statusColor="#FFC857" />
          <Row name="Policy Engine" meta="Proposition → Auth → Exécution" status="ARMED" />
          <Row name="Memory store" meta="users/*/memories.json" status="FILE" />
        </Card>

        <Card>
          <CardTitle>Modèle IA (via Provider)</CardTitle>
          <Row name="Provider" meta="AI Provider Manager" status="CORE" />
          <Row name="Route" meta="ProLiant → VPS Ollama → OpenRouter → offline" status="TARGET" statusColor="#00E5FF" />
          <Row name="OpenRouter" meta="clés .env NUC" status="CONFIG" />
          <Row name="Direct LLM" meta="interdit hors Provider / Hermes" status="BLOCKED" statusColor="rgba(255,100,100,0.8)" />
        </Card>

        <Card>
          <CardTitle>Skills (registre déployé)</CardTitle>
          {['shell', 'files', 'browser', 'home-assistant', 'voice', 'holomat', 'recovery', 'plex'].map(s => (
            <Row key={s} name={s} meta="à charger au deploy NUC" status="—" />
          ))}
        </Card>

        <Card>
          <CardTitle>Sessions / logs</CardTitle>
          <Row name="stream events" meta="table usage_events / session_log — absente" status="TODO" statusColor="#FFC857" />
          <div style={{ marginTop: 12, fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0,229,255,0.4)' }}>
            Pas de faux historiques. Brancher Core emit → Dashboard.
          </div>
        </Card>
      </div>
    </PageShell>
  )
}
