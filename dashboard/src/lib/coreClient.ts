/**
 * Client WS Core — PARTAGÉ, contrairement au reste du Dashboard.
 *
 * Chaque page ouvrait jusqu'ici sa propre connexion (ouvre → requête →
 * ferme) : correct pour de la lecture anonyme, mais une session admin est
 * liée par le Core à une connexion (`connection_id`, cf. `_session_role`
 * côté Core) — sans connexion PERSISTANTE, aucune page ne peut jamais
 * hériter d'une session ouverte ailleurs. Ce singleton est la seule
 * connexion admin du Dashboard, partagée via `CoreSessionContext`.
 */
import { coreWsUrl } from './coreWs'

type Listener = (data: Record<string, unknown>) => void
type ConnectionListener = (ok: boolean) => void

export class DashboardCoreClient {
  private ws: WebSocket | null = null
  private url: string
  private listeners = new Set<Listener>()
  private connectionListeners = new Set<ConnectionListener>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false
  connected = false

  constructor(url: string) {
    this.url = url
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    this.intentionalClose = false
    const ws = new WebSocket(this.url)
    this.ws = ws

    ws.onopen = () => {
      this.connected = true
      this.connectionListeners.forEach(fn => fn(true))
    }
    ws.onclose = () => {
      this.connected = false
      this.connectionListeners.forEach(fn => fn(false))
      this.ws = null
      if (!this.intentionalClose) {
        this.reconnectTimer = setTimeout(() => this.connect(), 2500)
      }
    }
    ws.onerror = () => { /* onclose suit toujours */ }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as Record<string, unknown>
        this.listeners.forEach(fn => {
          try { fn(data) } catch { /* un abonné qui lève ne prive pas les autres */ }
        })
      } catch { /* */ }
    }
  }

  /** Ferme volontairement — utilisé au logout, jamais au simple démontage d'une page. */
  disconnect(): void {
    this.intentionalClose = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
    this.connected = false
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  subscribeConnection(fn: ConnectionListener): () => void {
    this.connectionListeners.add(fn)
    return () => { this.connectionListeners.delete(fn) }
  }

  send(payload: Record<string, unknown>): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
      return true
    }
    this.connect()
    return false
  }

  /** Envoie et attend un message qui matche le prédicat, ou expire. */
  request(
    payload: Record<string, unknown>,
    match: (data: Record<string, unknown>) => boolean,
    timeoutMs = 8000,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let done = false
      const timer = setTimeout(() => {
        if (done) return
        done = true
        unsub()
        reject(new Error('Timeout Core WS'))
      }, timeoutMs)
      const unsub = this.subscribe((data) => {
        if (done || !match(data)) return
        done = true
        clearTimeout(timer)
        unsub()
        resolve(data)
      })
      if (!this.send(payload)) {
        // Pas encore connecté : `connect()` a été déclenché par `send()`,
        // on laisse le timeout normal jouer plutôt que d'échouer tout de
        // suite — la reconnexion peut aboutir dans la fenêtre.
      }
    })
  }
}

let singleton: DashboardCoreClient | null = null

export function getDashboardCoreClient(): DashboardCoreClient {
  if (!singleton) {
    singleton = new DashboardCoreClient(coreWsUrl())
  }
  return singleton
}
