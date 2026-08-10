/**
 * Login admin par visage — capture + envoi de JPEG au Core, comme le HUD
 * (`faceAuthLive.ts`) mais réduit à l'essentiel : le Dashboard n'a pas de
 * hologramme ni de choréographie, juste un aperçu caméra et un verdict.
 * Le Core fait tout le travail de reconnaissance (`vision/face_engine.py`) —
 * ici on n'envoie que des JPEG, jamais de landmarks côté client.
 */
import type { DashboardCoreClient } from './coreClient'

export type FaceLoginResult = {
  ok: boolean
  user_id?: string
  username?: string
  confidence?: number
  reason?: string
}

function grabJpegB64(video: HTMLVideoElement, quality = 0.85): string | null {
  const w = video.videoWidth
  const h = video.videoHeight
  if (w < 16 || h < 16) return null
  const canvas = document.createElement('canvas')
  const maxW = 960
  const scale = Math.min(1, maxW / w)
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  return dataUrl.replace(/^data:image\/jpeg;base64,/, '')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isFaceEvent(d: Record<string, unknown>): boolean {
  const t = d.type
  return t === 'FACE_PROGRESS' || t === 'FACE_SUCCESS' || t === 'FACE_FAILED' || t === 'holomat_error'
}

export async function runDashboardFaceLogin(opts: {
  client: DashboardCoreClient
  video: HTMLVideoElement
  isAlive: () => boolean
  onProgress?: (hudText: string, hudSubtext: string) => void
  /** Frames successives au-dessus du seuil avant de conclure — évite un faux positif isolé. */
  stableNeeded?: number
  timeoutMs?: number
}): Promise<FaceLoginResult> {
  const need = opts.stableNeeded ?? 2
  const timeoutMs = opts.timeoutMs ?? 35_000
  const t0 = Date.now()
  let hits = 0
  let lastUser: { user_id?: string; username?: string; confidence: number } | null = null

  while (opts.isAlive() && Date.now() - t0 < timeoutMs) {
    const jpeg = grabJpegB64(opts.video)
    if (!jpeg) {
      await sleep(200)
      continue
    }

    let ev: Record<string, unknown>
    try {
      ev = await opts.client.request(
        { type: 'holomat', action: 'face_frame', mode: 'verify', jpeg_b64: jpeg },
        isFaceEvent,
        6000,
      )
    } catch {
      await sleep(250)
      continue
    }
    if (ev.type === 'holomat_error') {
      await sleep(250)
      continue
    }

    opts.onProgress?.(String(ev.hudText ?? 'SCAN FACIAL'), String(ev.hudSubtext ?? ''))

    if (ev.type === 'FACE_SUCCESS' && ev.user_id) {
      hits += 1
      lastUser = {
        user_id: String(ev.user_id),
        username: ev.username as string | undefined,
        confidence: Number(ev.confidence ?? 0),
      }
      if (hits >= need) {
        return { ok: true, ...lastUser }
      }
    } else if (ev.type === 'FACE_FAILED') {
      return { ok: false, confidence: Number(ev.confidence ?? 0), reason: String(ev.reason ?? 'failed') }
    } else {
      hits = 0
    }
    await sleep(180)
  }

  return { ok: false, confidence: lastUser?.confidence ?? 0, reason: 'timeout' }
}
