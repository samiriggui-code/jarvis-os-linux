import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'

export default function AIProviders() {
  return (
    <PageShell>
      <PlaceholderBanner note="AI Provider Manager §11 — ordre prod NUC. Jamais d’appel LLM depuis le Dashboard." />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <StatPill label="HOST" value="NUC" color="#00E5FF" />
        <StatPill label="API" value="PENDING" color="#FFC857" />
      </div>
      <Card>
        <CardTitle>Chaîne de bascule (cible)</CardTitle>
        <Row name="1. Ollama VPS" meta="LLM #1 · JARVIS_REMOTE_LLM_URL" status="PENDING" statusColor="#FFC857" />
        <Row name="2. OpenRouter" meta="2ᵉ IA · clés sur NUC" status="PENDING" statusColor="#FFC857" />
        <Row name="3. Mode sans LLM" meta="JARVIS BASE" status="STANDBY" statusColor="rgba(224,244,255,0.45)" />
      </Card>
    </PageShell>
  )
}
