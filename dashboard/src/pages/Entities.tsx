/**
 * Devices — DeviceRegistry Core (`device` / `list`).
 * Utilisateurs — `auth`/`list_users` sur la MÊME connexion que AdminLoginGate.
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'
import { useCoreSession } from '../context/CoreSessionContext'
import { dashRequest } from '../lib/dashQuery'

type DeviceInfo = {
  device_id?: string
  type?: string
  runtime_kind?: string
  online?: boolean
  device_mode?: string
  metadata?: { label?: string; [k: string]: unknown }
}

type UserInfo = { username?: string; display_name?: string; role?: string }

export default function Entities() {
  const { client, session } = useCoreSession()
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null)
  const [users, setUsers] = useState<UserInfo[] | null>(null)
  const [usersError, setUsersError] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    setErr('')
    setUsersError('')
    void dashRequest(client, { type: 'device', action: 'list' }, 'device_list')
      .then((data) => {
        setDevices(Array.isArray(data.devices) ? (data.devices as DeviceInfo[]) : [])
      })
      .catch(() => {
        setErr('Core WS injoignable (8765).')
        setDevices([])
      })
      .finally(() => setLoading(false))

    if (!session) {
      setUsersError('session admin absente (visage ou skipAuth sans login)')
      setUsers([])
      return
    }
    void dashRequest(client, { type: 'auth', action: 'list_users' }, 'auth_users')
      .then((data) => {
        if (data.ok) {
          setUsers(Array.isArray(data.users) ? (data.users as UserInfo[]) : [])
        } else {
          setUsersError(String(data.error || 'refusé'))
          setUsers([])
        }
      })
      .catch((e) => {
        setUsersError(e instanceof Error ? e.message : 'refusé')
        setUsers([])
      })
  }, [client, session])

  useEffect(() => { refresh() }, [refresh])

  const onlineCount = (devices || []).filter(d => d.online).length

  return (
    <PageShell>
      <PlaceholderBanner note={err || 'Discovery ≠ droits — appairage obligatoire avant contrôle (§6).'} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatPill label="DEVICES" value={loading ? '…' : String((devices || []).length)} />
        <StatPill label="EN LIGNE" value={loading ? '…' : String(onlineCount)} color="#34C759" />
        <StatPill label="USERS" value={users ? String(users.length) : (usersError ? 'N/A' : '…')} color="#0A84FF" />
      </div>
      <div className="dash-grid-2">
        <Card>
          <CardTitle>Appareils (registre Core)</CardTitle>
          {!loading && (devices || []).length === 0 && (
            <Row name="Aucun device enregistré" meta="" status="" statusColor="transparent" />
          )}
          {(devices || []).map(d => (
            <Row
              key={d.device_id}
              name={(d.metadata?.label as string) || d.device_id || '?'}
              meta={`${d.type || '?'}${d.runtime_kind ? ' · ' + d.runtime_kind : ''} · ${d.device_mode || 'shared'}`}
              status={d.online ? 'ONLINE' : 'OFFLINE'}
              statusColor={d.online ? '#34C759' : 'rgba(17,17,20,0.35)'}
            />
          ))}
        </Card>
        <Card>
          <CardTitle>Utilisateurs</CardTitle>
          {usersError && (
            <Row name="Accès refusé" meta={`Le Dashboard n'a pas de session admin authentifiée — ${usersError}`} status="ADMIN REQUIS" statusColor="#FFC857" />
          )}
          {!usersError && (users || []).map((u, i) => (
            <Row
              key={`${u.username}-${i}`}
              name={u.display_name || u.username || '?'}
              meta={u.username || ''}
              status={String(u.role || '').toUpperCase()}
              statusColor={u.role === 'admin' ? '#0A84FF' : 'rgba(17,17,20,0.4)'}
            />
          ))}
        </Card>
      </div>
    </PageShell>
  )
}
