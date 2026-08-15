/**
 * Command Center — vue d'ensemble réelle (Hermes + devices), reste un
 * lanceur vers les autres pages pour le détail. Docker/Événements : aucune
 * source Core aujourd'hui, affichés honnêtement plutôt qu'inventés.
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardTitle, PageShell, Row, StatPill } from '../components/ui'
import type { Page } from '../types'
import { HOST } from '../types'
import { useCoreSession } from '../context/CoreSessionContext'
import { dashRequest } from '../lib/dashQuery'

type DeviceInfo = { device_id?: string; type?: string; online?: boolean; metadata?: { label?: string } }

export default function CommandCenter({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const { client } = useCoreSession()
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null)
  const [hermesHealthy, setHermesHealthy] = useState<boolean | null>(null)

  const refresh = useCallback(() => {
    void Promise.all([
      dashRequest(client, { type: 'device', action: 'list' }, 'device_list'),
      dashRequest(client, { type: 'hermes_status', action: 'status' }, 'hermes_result'),
    ]).then(([dev, hermes]) => {
      setDevices(Array.isArray(dev.devices) ? (dev.devices as DeviceInfo[]) : [])
      setHermesHealthy(hermes.healthy === true)
    }).catch(() => {
      setDevices([])
      setHermesHealthy(false)
    })
  }, [client])

  useEffect(() => { refresh() }, [refresh])

  const jump: [Page, string][] = [
    ['mission-board', 'Mission DEV Board'],
    ['recovery', 'Recovery'],
    ['holomat', 'Holomat'],
    ['docker', 'Docker'],
    ['terminal', 'Terminal'],
    ['deploy', 'Deploy'],
  ]

  const onlineDevices = (devices || []).filter(d => d.online)

  return (
    <PageShell>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: 18, fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(17,17,20,0.92)' }}>
            Command Center
          </h1>
          <p style={{ margin: '8px 0 0', fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(17,17,20,0.5)', lineHeight: 1.45 }}>
            {HOST.label} · Core {HOST.coreHost} — HUD HS → Recovery (Ctrl+Alt+R).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {jump.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                padding: '7px 12px',
                borderRadius: 999,
                border: '1px solid rgba(17,17,20,0.1)',
                background: id === 'recovery' ? 'rgba(255,59,48,0.08)' : 'rgba(255,255,255,0.5)',
                color: id === 'recovery' ? '#FF3B30' : 'rgba(17,17,20,0.7)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <StatPill label="HOST" value={HOST.role} />
        <StatPill label="HERMES" value={hermesHealthy == null ? '…' : hermesHealthy ? 'EN LIGNE' : 'HORS LIGNE'} color={hermesHealthy ? '#34C759' : '#FF3B30'} />
        <StatPill label="DEVICES EN LIGNE" value={devices == null ? '…' : String(onlineDevices.length)} color="#0A84FF" />
        <StatPill label="DOCKER" value="—" color="rgba(17,17,20,0.35)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <Card>
          <CardTitle>Devices en ligne</CardTitle>
          {devices != null && onlineDevices.length === 0 && (
            <Row name="Aucun device en ligne" meta="" status="" statusColor="transparent" />
          )}
          {onlineDevices.slice(0, 6).map(d => (
            <Row key={d.device_id} name={d.metadata?.label || d.device_id || '?'} meta={d.type || '?'} status="ONLINE" statusColor="#34C759" />
          ))}
        </Card>

        <Card>
          <CardTitle>Accès host</CardTitle>
          <Row name="Terminal" meta="page Terminal · WS type=terminal (session admin)" status="CÂBLÉ" statusColor="#34C759" />
          <Row name="Docker UI" meta="Portainer" status="LIEN" statusColor="rgba(17,17,20,0.5)" />
          <Row name="Déploiements" meta="/opt/apps" status="À CÂBLER" statusColor="#FFC857" />
        </Card>

        <Card>
          <CardTitle>Événements</CardTitle>
          <Row name="Journal en direct" meta="voir la page « Tools » — table tool_events déjà branchée" status="→" statusColor="#0A84FF" />
        </Card>
      </div>
    </PageShell>
  )
}
