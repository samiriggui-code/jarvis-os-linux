import { useState } from 'react'
import { Card, CardTitle, PageShell, PlaceholderBanner, StatPill } from '../components/ui'
import { HOST } from '../types'

/** Terminal — pas d’exec réel. Pas de faux docker ps “Up”. */
export default function TerminalPage() {
  const [lines] = useState([
    `# Terminal non connecté — Tool Manager shell.exec + Policy admin requis`,
    `# Cible SSH : ${HOST.ssh}`,
    `# Core/Hermes : ${HOST.coreHost} (pas de faux jarvis-core Up ici)`,
    `$ # En attente bridge Core`,
  ])

  return (
    <PageShell>
      <PlaceholderBanner note="Terminal — mock UI only. Aucune commande exécutée." />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <StatPill label="HOST" value={HOST.role} color="#00E5FF" />
        <StatPill label="SHELL" value="OFF" color="#FFC857" />
        <StatPill label="POLICY" value="ADMIN" color="#FF6B4A" />
      </div>

      <Card style={{ minHeight: 360 }}>
        <CardTitle>Session · {HOST.label}</CardTitle>
        <div style={{
          fontFamily: 'JetBrains Mono',
          fontSize: 12,
          lineHeight: 1.65,
          color: 'rgba(0, 255, 153, 0.85)',
          background: 'rgba(0,0,0,0.45)',
          borderRadius: 8,
          border: '1px solid rgba(0,229,255,0.12)',
          padding: 14,
          minHeight: 280,
          whiteSpace: 'pre-wrap',
        }}>
          {lines.join('\n')}
        </div>
      </Card>
    </PageShell>
  )
}
