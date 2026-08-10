import { useMemo, useState } from 'react'
import { PageShell, StatPill } from '../components/ui'
import { AppTile } from '../components/AppTile'
import { GlassButton } from '../components/glass'
import { useDashToast } from '../components/DashToast'
import {
  APP_CATEGORIES,
  DASH_APPS,
  hudPublicUrl,
  type AppCat,
  type DashApp,
} from '../apps/catalog'
import type { Page } from '../types'
import { tokens } from '../ui/tokens'

interface Props {
  onNavigate: (page: Page) => void
}

function appMeta(app: DashApp): string {
  const parts = [app.cat]
  if (app.intent) parts.push(app.intent)
  if (app.owner) parts.push(app.owner)
  return parts.join(' · ')
}

export default function ApplicationsPage({ onNavigate }: Props) {
  const { push } = useDashToast()
  const [cat, setCat] = useState<'Tout' | AppCat>('Tout')

  const filtered = useMemo(
    () => DASH_APPS.filter(a => cat === 'Tout' || a.cat === cat),
    [cat],
  )

  const counts = useMemo(() => {
    const live = DASH_APPS.filter(a => a.status === 'live').length
    const surface = DASH_APPS.filter(a => a.status === 'surface').length
    const soon = DASH_APPS.filter(a => a.status === 'soon').length
    return { live, surface, soon, total: DASH_APPS.length }
  }, [])

  const openApp = (app: DashApp) => {
    if (app.id === 'hud-surface') {
      window.location.href = hudPublicUrl()
      return
    }
    if (app.page) {
      onNavigate(app.page)
      push({
        type: 'info',
        title: app.name,
        message: `Ouverture · ${app.intent ?? app.page}`,
      })
      return
    }
    if (app.status === 'soon') {
      push({
        type: 'warning',
        title: app.name,
        message: 'Intention déclarée — exécution pas encore disponible.',
      })
      return
    }
    push({
      type: 'info',
      title: app.name,
      message: app.intent
        ? `${app.intent} — surface HUD ou agent requis.`
        : 'Disponible depuis le HUD kiosk.',
    })
  }

  return (
    <PageShell>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatPill label="APPLICATIONS" value={String(counts.total)} />
        <StatPill label="LIVE" value={String(counts.live)} color={tokens.color.success} />
        <StatPill label="SURFACE" value={String(counts.surface)} color={tokens.color.accent} />
        <StatPill label="SOON" value={String(counts.soon)} color={tokens.color.warning} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {APP_CATEGORIES.map(c => (
          <GlassButton
            key={c}
            active={cat === c}
            tone={c === 'Surfaces' ? 'accent' : 'neutral'}
            onClick={() => setCat(c)}
            style={{ fontSize: 10, padding: '6px 14px' }}
          >
            {c.toUpperCase()}
          </GlassButton>
        ))}
      </div>

      <div className="dash-app-grid">
        {filtered.map(app => (
          <AppTile
            key={app.id}
            name={app.name}
            icon={app.icon}
            color={app.color}
            status={app.status}
            blurb={app.blurb}
            meta={appMeta(app)}
            locked={app.adminOnly}
            onClick={() => openApp(app)}
          />
        ))}
      </div>
    </PageShell>
  )
}
