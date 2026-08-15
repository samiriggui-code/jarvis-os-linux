/**
 * Apps installées sur les machines hôtes (agents Windows / fake_agent).
 * Source = Core DeviceRegistry `app.software.*` — jamais le catalogue HUD/JARVIS.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MonitorSmartphone } from 'lucide-react'
import { PageShell, PlaceholderBanner, StatPill } from '../components/ui'
import { GlassButton, GlassPanel } from '../components/glass'
import { GlassPill } from '../components/glass/GlassPill'
import { useCoreSession } from '../context/CoreSessionContext'
import { dashRequest } from '../lib/dashQuery'
import { tokens } from '../ui/tokens'

type HostApp = {
  app_id?: string
  display_name?: string
  publisher?: string
  version?: string
  source?: string
  exe?: string
  launchable?: boolean
}

type HostInventory = {
  device_id?: string
  label?: string
  type?: string
  runtime_kind?: string
  online?: boolean
  stats?: { total_apps?: number; launchable_apps?: number }
  apps?: HostApp[]
}

function hostLabel(h: HostInventory): string {
  return h.label || h.device_id || 'hôte'
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0] || '?').slice(0, 2).toUpperCase()
}

function hueFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 42% 52%)`
}

export default function ApplicationsPage() {
  const { client } = useCoreSession()
  const [hosts, setHosts] = useState<HostInventory[] | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [hostFilter, setHostFilter] = useState<'all' | string>('all')
  const [onlyLaunchable, setOnlyLaunchable] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    setErr('')
    void dashRequest(client, { type: 'device', action: 'software' }, 'device_software', 15000)
      .then((data) => {
        const list = Array.isArray(data.devices) ? (data.devices as HostInventory[]) : []
        setHosts(list)
        setLoading(false)
      })
      .catch(() => {
        setHosts([])
        setErr('Core WS injoignable (8765) — les agents n’ont nulle part où pousser l’inventaire.')
        setLoading(false)
      })
  }, [client])

  useEffect(() => { refresh() }, [refresh])

  const rows = useMemo(() => {
    const out: Array<HostApp & { hostId: string; hostName: string; online?: boolean }> = []
    for (const h of hosts || []) {
      if (hostFilter !== 'all' && h.device_id !== hostFilter) continue
      for (const app of h.apps || []) {
        if (onlyLaunchable && !app.launchable) continue
        out.push({
          ...app,
          hostId: h.device_id || '',
          hostName: hostLabel(h),
          online: h.online,
        })
      }
    }
    return out
  }, [hosts, hostFilter, onlyLaunchable])

  const launchableCount = (hosts || []).reduce(
    (n, h) => n + (h.apps || []).filter(a => a.launchable).length,
    0,
  )
  const total = (hosts || []).reduce((n, h) => n + (h.apps || []).length, 0)
  const onlineHosts = (hosts || []).filter(h => h.online).length

  return (
    <PageShell>
      <PlaceholderBanner
        note={err || 'Inventaire réel des agents (PC, portable, tablette…). Pas les tuiles HUD / Holomat.'}
      />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <StatPill label="HÔTES" value={hosts == null ? '…' : String((hosts || []).length)} />
        <StatPill label="EN LIGNE" value={hosts == null ? '…' : String(onlineHosts)} color={tokens.color.success} />
        <StatPill label="APPS" value={loading ? '…' : String(total)} />
        <StatPill label="LANÇABLES" value={loading ? '…' : String(launchableCount)} color={tokens.color.accent} />
        <GlassButton tone="neutral" onClick={refresh} disabled={loading} style={{ fontSize: 10, padding: '6px 14px' }}>
          {loading ? '…' : 'ACTUALISER'}
        </GlassButton>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <GlassButton active={hostFilter === 'all'} onClick={() => setHostFilter('all')} style={{ fontSize: 10, padding: '6px 14px' }}>
          TOUS LES HÔTES
        </GlassButton>
        {(hosts || []).map(h => (
          <GlassButton
            key={h.device_id}
            active={hostFilter === h.device_id}
            onClick={() => setHostFilter(h.device_id || 'all')}
            style={{ fontSize: 10, padding: '6px 14px' }}
          >
            {hostLabel(h).toUpperCase()}
            {h.online ? '' : ' · OFF'}
          </GlassButton>
        ))}
        <GlassButton
          active={onlyLaunchable}
          onClick={() => setOnlyLaunchable(v => !v)}
          style={{ fontSize: 10, padding: '6px 14px' }}
        >
          LANÇABLES
        </GlassButton>
      </div>

      {hosts != null && (hosts || []).length === 0 && !err && (
        <GlassPanel level="regular" radius="lg" padding="lg" style={{ maxWidth: 560 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <MonitorSmartphone size={22} style={{ color: tokens.color.accent, flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontFamily: tokens.font.body, fontSize: 14, fontWeight: 600, color: tokens.color.text }}>
                Aucun inventaire hôte
              </div>
              <p style={{ margin: '8px 0 0', fontFamily: tokens.font.mono, fontSize: 11, color: tokens.color.textMuted, lineHeight: 1.5 }}>
                Les apps viennent des agents sur PC / portable / tablette / téléphone
                (`app.software.*` → Core). Sans agent connecté, la liste reste vide — on n’affiche pas le catalogue JARVIS.
              </p>
            </div>
          </div>
        </GlassPanel>
      )}

      <div className="dash-app-grid">
        {rows.map(app => {
          const name = app.display_name || app.app_id || '?'
          const color = hueFor(app.app_id || name)
          return (
            <GlassPanel
              key={`${app.hostId}-${app.app_id}`}
              level="regular"
              radius="lg"
              padding={0}
              className="dash-app-tile"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                padding: '18px 14px 16px',
                textAlign: 'center',
                minHeight: 148,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `linear-gradient(165deg, ${color}33 0%, rgba(255,255,255,0.04) 100%)`,
                  border: `1px solid ${color}55`,
                  fontFamily: tokens.font.body,
                  fontSize: 16,
                  fontWeight: 700,
                  color,
                }}
              >
                {initials(name)}
              </div>
              <div style={{ width: '100%', minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: tokens.font.body,
                    fontSize: 13,
                    fontWeight: 600,
                    color: tokens.color.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {name}
                </div>
                <div
                  style={{
                    fontFamily: tokens.font.mono,
                    fontSize: 9,
                    color: tokens.color.textMuted,
                    marginTop: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {[app.publisher, app.version].filter(Boolean).join(' · ') || app.app_id}
                </div>
                <div
                  style={{
                    fontFamily: tokens.font.mono,
                    fontSize: 8,
                    color: tokens.color.textMuted,
                    marginTop: 6,
                    opacity: 0.85,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {app.hostName}{app.exe ? ` · ${app.exe.split(/[/\\]/).pop()}` : ''}
                </div>
              </div>
              <GlassPill tone={app.launchable ? 'success' : 'neutral'} dot style={{ marginTop: 'auto' }}>
                {app.launchable ? 'LANÇABLE' : 'INSTALLÉE'}
              </GlassPill>
            </GlassPanel>
          )
        })}
      </div>
    </PageShell>
  )
}
