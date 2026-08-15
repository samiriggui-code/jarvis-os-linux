/**
 * Porte d'entrée admin du Dashboard — visage, même moteur que le HUD
 * (`vision/face_engine.py`, aucun landmark côté client). Tant qu'aucune
 * session admin n'existe sur la connexion partagée (`CoreSessionContext`),
 * rien du Dashboard ne s'affiche.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { GlassPanel, GlassButton } from './glass'
import { tokens } from '../ui/tokens'
import { useCoreSession } from '../context/CoreSessionContext'
import { runDashboardFaceLogin } from '../lib/faceLogin'
import { isAuthBypassEnabled, isRecoveryRoute } from '../lib/devAuthBypass'

type Phase = 'idle' | 'connecting' | 'scanning' | 'error'

export function AdminLoginGate({ children }: { children: React.ReactNode }) {
  const { client, session, setSession } = useCoreSession()
  const videoRef = useRef<HTMLVideoElement>(null)
  const aliveRef = useRef(true)
  const [phase, setPhase] = useState<Phase>('idle')
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const [recovery, setRecovery] = useState(isRecoveryRoute)

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  useEffect(() => {
    const onHash = () => setRecovery(isRecoveryRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const startScan = useCallback(async () => {
    setError('')
    setPhase('connecting')
    setHint('Ouverture de la caméra…')

    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Caméra refusée')
      setPhase('error')
      return
    }
    if (!aliveRef.current) { stream.getTracks().forEach(t => t.stop()); return }

    const video = videoRef.current
    if (video) {
      video.srcObject = stream
      try { await video.play() } catch { /* autoplay policy — pas bloquant, muted */ }
    }

    client.connect()
    const t0 = Date.now()
    while (!client.connected && Date.now() - t0 < 6000) {
      await new Promise(r => setTimeout(r, 100))
    }
    if (!aliveRef.current) { stream.getTracks().forEach(t => t.stop()); return }
    if (!client.connected) {
      setError('Core hors ligne (WS 8765/8080 injoignable)')
      setPhase('error')
      stream.getTracks().forEach(t => t.stop())
      return
    }

    setPhase('scanning')
    setHint('Placez-vous face à la caméra')

    const result = await runDashboardFaceLogin({
      client,
      video: video!,
      isAlive: () => aliveRef.current,
      onProgress: (hudText, hudSubtext) => setHint(`${hudText}${hudSubtext ? ' — ' + hudSubtext : ''}`),
    })
    if (!aliveRef.current) { stream.getTracks().forEach(t => t.stop()); return }

    if (!result.ok || !result.user_id) {
      const reason = result.reason || 'inconnu'
      setError(
        reason === 'no_profile'
          ? 'Aucun profil facial reconnu sur ce Core'
          : reason === 'timeout'
            ? 'Aucun visage détecté — réessayez'
            : `Échec (${reason})`,
      )
      setPhase('error')
      stream.getTracks().forEach(t => t.stop())
      return
    }

    let loginRes: Record<string, unknown>
    try {
      loginRes = await client.request(
        {
          type: 'auth',
          action: 'login',
          user_id: result.user_id,
          username: result.username,
          method: 'face',
          confidence: result.confidence ?? 0.9,
        },
        (d) => d.type === 'auth_login_result',
        8000,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login Core impossible')
      setPhase('error')
      stream.getTracks().forEach(t => t.stop())
      return
    }
    stream.getTracks().forEach(t => t.stop())
    if (!aliveRef.current) return

    const event = loginRes.event as { user?: { id?: string; username?: string; display_name?: string; role?: string } } | undefined
    const role = String(event?.user?.role || '').toUpperCase()
    if (!loginRes.ok || role !== 'ADMIN') {
      setError(role && role !== 'ADMIN' ? 'Accès réservé à l\'administrateur' : String(loginRes.error || 'Connexion refusée'))
      setPhase('error')
      return
    }

    setSession({
      userId: String(event?.user?.id ?? result.user_id),
      username: event?.user?.username,
      displayName: event?.user?.display_name,
      role: role || 'ADMIN',
    })
  }, [client, setSession])

  // Recovery = JARVIS BASE (cahier) : accessible sans visage.
  // skipAuth = DEV only, élidé au build prod — ne fabrique pas de session admin.
  if (session || isAuthBypassEnabled() || recovery) return <>{children}</>

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 30%, #0d1420 0%, #05070a 70%)',
      }}
    >
      <GlassPanel level="floating" radius="lg" padding="lg" style={{ maxWidth: 420, width: '90%', textAlign: 'center' }}>
        <p style={{ fontFamily: tokens.font.display, color: tokens.color.accent, fontSize: 13, letterSpacing: '0.28em', margin: 0 }}>
          JARVIS DASHBOARD
        </p>
        <p style={{ fontFamily: tokens.font.mono, color: tokens.color.textMuted, fontSize: 10, letterSpacing: '0.14em', margin: '8px 0 20px' }}>
          ACCÈS ADMINISTRATEUR
        </p>

        <div
          style={{
            width: 200, height: 200, margin: '0 auto 18px',
            borderRadius: tokens.radius.lg,
            overflow: 'hidden',
            background: '#000',
            border: `1px solid ${tokens.color.border}`,
            position: 'relative',
          }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transform: 'scaleX(-1)',
              opacity: phase === 'scanning' || phase === 'connecting' ? 1 : 0.15,
            }}
          />
          {phase === 'idle' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: tokens.font.mono, fontSize: 9, color: tokens.color.textMuted, letterSpacing: '0.1em' }}>
                CAMÉRA INACTIVE
              </span>
            </div>
          )}
        </div>

        {(phase === 'connecting' || phase === 'scanning') && hint && (
          <p style={{ fontFamily: tokens.font.mono, color: tokens.color.accent, fontSize: 10, letterSpacing: '0.08em', margin: '0 0 16px' }}>
            {hint}
          </p>
        )}

        {phase !== 'connecting' && phase !== 'scanning' && (
          <GlassButton tone="accent" active onClick={() => void startScan()} style={{ width: '100%', justifyContent: 'center' }}>
            SCANNER MON VISAGE
          </GlassButton>
        )}

        {error && (
          <p style={{ fontFamily: tokens.font.mono, color: tokens.color.danger, fontSize: 10, letterSpacing: '0.06em', marginTop: 14 }}>
            {error}
          </p>
        )}
      </GlassPanel>
    </div>
  )
}
