/**
 * Requête Core sur la connexion admin PARTAGÉE.
 * Ne jamais ouvrir un WebSocket de page : le rôle admin est lié à connection_id.
 */
import type { DashboardCoreClient } from './coreClient'

export function dashRequest(
  client: DashboardCoreClient,
  payload: Record<string, unknown>,
  matchType: string,
  timeoutMs = 12000,
): Promise<Record<string, unknown>> {
  client.connect()
  return client.request(
    payload,
    (d) => String(d.type || '') === matchType,
    timeoutMs,
  )
}
