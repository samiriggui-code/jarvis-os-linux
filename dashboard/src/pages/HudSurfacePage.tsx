import { ExternalLink } from 'lucide-react'
import { PageShell, StatPill } from '../components/ui'
import { GlassCard, GlassButton } from '../components/glass'
import { hudPublicUrl } from '../apps/catalog'
import { tokens } from '../ui/tokens'

export default function HudSurfacePage() {
  const url = hudPublicUrl()

  return (
    <PageShell>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatPill label="SURFACE" value="HUD" color={tokens.color.accent} />
        <StatPill label="MODE" value="Kiosk" />
        <StatPill label="CORE" value="WebSocket /ws" color={tokens.color.success} />
      </div>
      <GlassCard
        level="regular"
        radius="lg"
        eyebrow="Front produit"
        title="Interface HUD"
        subtitle="Orbe, voix, authentification faciale et lanceur d'applications"
        style={{ maxWidth: 520 }}
      >
        <p style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.color.textMuted, lineHeight: 1.55, margin: '0 0 20px' }}>
          Le Dashboard admin que vous consultez ici est distinct du HUD kiosk.
          Ouvrez le HUD pour l'expérience utilisateur sur tablette, NUC ou navigateur dédié.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <GlassButton
            active
            onClick={() => { window.location.href = url }}
            style={{ gap: 8 }}
          >
            <ExternalLink size={14} />
            OUVRIR LE HUD
          </GlassButton>
          <GlassButton
            tone="neutral"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          >
            NOUVEL ONGLET
          </GlassButton>
        </div>
        <p style={{ fontFamily: tokens.font.mono, fontSize: 9, color: tokens.color.textMuted, marginTop: 16, wordBreak: 'break-all' }}>
          {url}
        </p>
      </GlassCard>
    </PageShell>
  )
}
