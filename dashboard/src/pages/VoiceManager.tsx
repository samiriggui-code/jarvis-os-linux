import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'

export default function VoiceManager() {
  return (
    <PageShell>
      <PlaceholderBanner note="Voix cible NUC — Whisper STT · Piper TTS · ElevenLabs premium. Pas encore déployé (Core VoiceManager → voicebox / fallback HUD)." />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <StatPill label="STT" value="—" color="#FFC857" />
        <StatPill label="TTS" value="—" color="#FFC857" />
        <StatPill label="WAKE" value="—" color="#FFC857" />
        <StatPill label="HOST" value="NUC" color="#00E5FF" />
      </div>
      <div className="dash-grid-2">
        <Card>
          <CardTitle>Pipeline cible</CardTitle>
          <Row name="Whisper STT" meta="NUC · tiny/base · LG AN-VC500" status="TODO" statusColor="#FFC857" />
          <Row name="Piper TTS" meta="NUC · sortie HDMI Bravia" status="TODO" statusColor="#FFC857" />
          <Row name="ElevenLabs" meta="premium · clés sur NUC" status="TODO" statusColor="#FFC857" />
          <Row name="Wake word" meta="OpenWakeWord local" status="TODO" statusColor="#FFC857" />
        </Card>
        <Card>
          <CardTitle>Aujourd’hui (dev)</CardTitle>
          <Row name="Core VoiceManager" meta="voicebox HTTP ou tts_fallback" status="PARTIAL" statusColor="#FFC857" />
          <Row name="HUD ttsDev" meta="SpeechSynthesis navigateur" status="DEV" statusColor="rgba(224,244,255,0.45)" />
          <Row name="Micro / cam" meta="getUserMedia · Holomat" status="LIVE" statusColor="#00FF99" />
        </Card>
      </div>
    </PageShell>
  )
}
