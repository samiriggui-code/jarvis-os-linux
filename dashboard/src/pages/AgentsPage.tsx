import { useCallback, useEffect, useState } from 'react'
import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'
import { useCoreSession } from '../context/CoreSessionContext'
import { dashRequest } from '../lib/dashQuery'

type DeviceInfo = {
  device_id?: string
  type?: string
  runtime_kind?: string
  online?: boolean
  metadata?: { label?: string; agent_version?: string; [k: string]: unknown }
}

export default function AgentsPage() {
  const { client } = useCoreSession()
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null)
  const [err, setErr] = useState('')

  const refresh = useCallback(() => {
    void dashRequest(client, { type: 'device', action: 'list' }, 'device_list')
      .then((data) => {
        setDevices(Array.isArray(data.devices) ? (data.devices as DeviceInfo[]) : [])
        setErr('')
      })
      .catch(() => {
        setDevices([])
        setErr('Core WS injoignable (8765).')
      })
  }, [client])

  useEffect(() => { refresh() }, [refresh])

  const list = devices || []
  const online = list.filter(d => d.online)

  return (
    <PageShell>
      <PlaceholderBanner note={err || 'DeviceRegistry Core — pas un catalogue d’agents lifestyle. Windows Agent 0.5 = device.register / heartbeat.'} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatPill label="DEVICES" value={devices == null ? '…' : String(list.length)} />
        <StatPill label="EN LIGNE" value={devices == null ? '…' : String(online.length)} color="#34C759" />
      </div>
      <Card>
        <CardTitle>Registry (Core V2)</CardTitle>
        {devices != null && list.length === 0 && (
          <Row name="Aucun device" meta="Aucun satellite enregistré sur ce Core" status="—" statusColor="transparent" />
        )}
        {list.map(d => (
          <Row
            key={d.device_id}
            name={(d.metadata?.label as string) || d.device_id || '?'}
            meta={`${d.type || '?'} · ${d.runtime_kind || '—'} · ${String(d.metadata?.agent_version || '')}`}
            status={d.online ? 'ONLINE' : 'OFFLINE'}
            statusColor={d.online ? '#34C759' : 'rgba(17,17,20,0.35)'}
          />
        ))}
      </Card>
    </PageShell>
  )
}
