/**
 * Session admin du Dashboard — un seul contexte, une seule connexion Core.
 *
 * Le Core lie une session à une CONNEXION (`connection_id`, cf.
 * `_session_role` côté Core) — sans ce contexte, chaque page ouvrait sa
 * propre connexion anonyme et ne pouvait jamais hériter d'une session
 * ouverte ailleurs. `client` (singleton `DashboardCoreClient`) doit donc
 * être la SEULE connexion WS admin du Dashboard.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { getDashboardCoreClient, type DashboardCoreClient } from '../lib/coreClient'

export type AdminSession = {
  userId: string
  username?: string
  displayName?: string
}

type CoreSessionValue = {
  client: DashboardCoreClient
  session: AdminSession | null
  setSession: (s: AdminSession | null) => void
  logout: () => void
}

const CoreSessionContext = createContext<CoreSessionValue | null>(null)

export function CoreSessionProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getDashboardCoreClient(), [])
  const [session, setSession] = useState<AdminSession | null>(null)

  const logout = useCallback(() => {
    try { client.send({ type: 'auth', action: 'logout' }) } catch { /* */ }
    setSession(null)
  }, [client])

  const value = useMemo<CoreSessionValue>(() => ({ client, session, setSession, logout }), [client, session, logout])

  return <CoreSessionContext.Provider value={value}>{children}</CoreSessionContext.Provider>
}

export function useCoreSession(): CoreSessionValue {
  const ctx = useContext(CoreSessionContext)
  if (!ctx) throw new Error('useCoreSession doit être utilisé sous CoreSessionProvider')
  return ctx
}
