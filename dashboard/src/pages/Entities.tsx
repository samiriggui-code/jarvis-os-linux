/**
 * Devices — liste réelle via Core WS type=device action=list (registre,
 * pas de droits nécessaires : discovery ≠ droits, §6).
 *
 * Utilisateurs — `auth`/`list_users` existe côté Core mais EXIGE une session
 * admin authentifiée liée à la connexion WS (`dashboard_access` ou
 * `user_management`). Le Dashboard n'a aujourd'hui aucun flux de login —
 * chaque page ouvre une connexion anonyme, requête, ferme. Résultat honnête :
 * "accès admin requis" plutôt qu'une liste inventée. Le vrai fix est un flux
 * d'auth dashboard, pas cette page.
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'

type DeviceInfo = {
  device_id?: string
  type?: string
  runtime_kind?: string
  online?: boolean
  device_mode?: string
  metadata?: { label?: string; [k: string]: unknown }
}

type UserInfo = { username?: string; display_name?: string; role?: string }

import { coreWsUrl } from '../lib/coreWs'
const CORE_WS = coreWsUrl()

export default function Entities() {
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null)
  const [users, setUsers] = useState<UserInfo[] | null>(null)
  const [usersError, setUsersError] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    setErr('')
    setUsersError('')
    let devicesDone = false
    let usersDone = false
    let settled = false
    const finishIfDone = () => {
      if (devicesDone && usersDone && !settled) {
        settled = true
        setLoading(false)
        try { ws.close() } catch { /* */ }
      }
    }

    const ws = new WebSocket(CORE_WS)
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true
        setErr('Timeout Core — relance jarvis_core.')
        setLoading(false)
        try { ws.close() } catch { /* */ }
      }
    }, 12000)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'device', action: 'list' }))
      ws.send(JSON.stringify({ type: 'auth', action: 'list_users' }))
    }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data))
        if (data.type === 'device_list') {
          setDevices(Array.isArray(data.devices) ? data.devices : [])
          devicesDone = true
          window.clearTimeout(timer)
          finishIfDone()
        }
        if (data.type === 'auth_users') {
          if (data.ok) {
            setUsers(Array.isArray(data.users) ? data.users : [])
          } else {
            setUsersError(String(data.error || 'refusé'))
            setUsers([])
          }
          usersDone = true
          window.clearTimeout(timer)
          finishIfDone()
        }
      } catch { /* */ }
    }
    ws.onerror = () => {
      if (!settled) {
        settled = true
        window.clearTimeout(timer)
        setErr('Core WS injoignable (8765).')
        setLoading(false)
      }
    }
  }, [])

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
