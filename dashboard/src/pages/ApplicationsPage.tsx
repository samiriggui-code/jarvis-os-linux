import { useMemo } from 'react'
import { Card, CardTitle, PageShell, Row, StatPill } from '../components/ui'

/**
 * Miroir du catalogue HUD (`hud/src/app/apps/catalog.ts`) — intentions, pas apps.
 * Source de vérité runtime = Core capabilities ; ici vue d'ensemble admin.
 */
const HUD_INTENTIONS = [
  { name: 'Paramètres', cat: 'Système', status: 'LIVE', intent: '—', owner: 'core' },
  { name: 'Sécurité', cat: 'Système', status: 'SURFACE', intent: 'core.security', owner: 'core' },
  { name: 'Providers IA', cat: 'Système', status: 'SURFACE', intent: 'core.providers', owner: 'core' },
  { name: 'Usage', cat: 'Système', status: 'SURFACE', intent: 'core.usage', owner: 'core' },
  { name: 'Réseau', cat: 'Système', status: 'SOON', intent: 'system.network', owner: 'core' },
  { name: 'Missions', cat: 'Agent', status: 'SOON', intent: 'core.missions', owner: 'core' },
  { name: 'Maison', cat: 'Maison', status: 'SURFACE', intent: 'home.control', owner: 'core' },
  { name: 'Musique', cat: 'Médias', status: 'SURFACE', intent: 'media.music', owner: 'hermes' },
  { name: 'Vidéo', cat: 'Médias', status: 'SURFACE', intent: 'media.video', owner: 'core' },
  { name: 'Terminal', cat: 'Outils', status: 'SURFACE', intent: 'vps.shell', owner: 'hermes' },
  { name: 'Docker', cat: 'Outils', status: 'SOON', intent: 'vps.docker', owner: 'hermes' },
  { name: 'Stockage', cat: 'Outils', status: 'SOON', intent: 'vps.storage', owner: 'hermes' },
  { name: 'Code', cat: 'Outils', status: 'SOON', intent: 'vps.code', owner: 'hermes' },
  { name: 'Appareils', cat: 'Système', status: 'SOON', intent: 'devices.list', owner: 'device' },
  { name: 'Topologie', cat: 'Système', status: 'SOON', intent: 'devices.topology', owner: 'device' },
  { name: 'Agent Reach', cat: 'Agent', status: 'SURFACE', intent: 'agent.reach', owner: 'hermes' },
  { name: 'Holomat', cat: 'Système', status: 'LIVE', intent: '—', owner: 'core' },
  { name: 'Mission Control DEV', cat: 'Agent', status: 'LIVE', intent: '—', owner: 'core' },
] as const

const STATUS_COLOR: Record<string, string> = {
  LIVE: '#22c55e',
  SURFACE: '#00f5ff',
  SOON: '#FFC857',
}

export default function ApplicationsPage() {
  const counts = useMemo(() => {
    const live = HUD_INTENTIONS.filter(a => a.status === 'LIVE').length
    const surface = HUD_INTENTIONS.filter(a => a.status === 'SURFACE').length
    const soon = HUD_INTENTIONS.filter(a => a.status === 'SOON').length
    return { live, surface, soon, total: HUD_INTENTIONS.length }
  }, [])

  return (
    <PageShell>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatPill label="INTENTIONS" value={String(counts.total)} />
        <StatPill label="LIVE" value={String(counts.live)} />
        <StatPill label="SURFACE" value={String(counts.surface)} />
        <StatPill label="SOON" value={String(counts.soon)} />
      </div>
      <Card>
        <CardTitle>Catalogue HUD — intentions</CardTitle>
        {HUD_INTENTIONS.map(app => (
          <Row
            key={app.name}
            name={app.name}
            meta={`${app.cat} · ${app.intent} · ${app.owner}`}
            status={app.status}
            statusColor={STATUS_COLOR[app.status]}
          />
        ))}
      </Card>
    </PageShell>
  )
}
