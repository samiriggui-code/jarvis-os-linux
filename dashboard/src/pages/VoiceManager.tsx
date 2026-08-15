/**
 * Voice Manager — statut réel via Core WS type=voicebox (VoiceManager.status(),
 * sondé à chaque requête — `available` ne reste jamais un mock figé).
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardTitle, PageShell, PlaceholderBanner, Row, StatPill } from '../components/ui'
import { useCoreSession } from '../context/CoreSessionContext'
import { dashRequest } from '../lib/dashQuery'

type VoiceboxStatus = {
  ok?: boolean
  url?: string
  available?: boolean | null
  backend?: string | null
  error?: string | null
  speaking?: string | null
  engine_default?: string
}

export default function VoiceManager() {
  const { client } = useCoreSession()
  const [st, setSt] = useState<VoiceboxStatus | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    setErr('')
    void dashRequest(client, { type: 'voicebox', action: 'status' }, 'voicebox_result', 15000)
      .then((data) => {
        setSt(data as VoiceboxStatus)
        setLoading(false)
      })
      .catch(() => {
        setErr('Core WS injoignable (8765).')
        setLoading(false)
      })
  }, [client])

  useEffect(() => { refresh() }, [refresh])

  const available = st?.available === true

  return (
    <PageShell>
      <PlaceholderBanner note={err || 'Voicebox — TTS + Whisper STT, docker-compose sur le VPS, joint par tunnel SSH depuis le NUC.'} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <StatPill label="VOICEBOX" value={loading ? '…' : available ? 'EN LIGNE' : 'HORS LIGNE'} color={available ? '#34C759' : '#FF3B30'} />
        <StatPill label="BACKEND" value={st?.backend || '—'} color="#0A84FF" />
        <StatPill label="EN COURS" value={st?.speaking || 'silence'} />
      </div>
      <Card>
        <CardTitle>Voicebox (TTS + Whisper STT)</CardTitle>
        <Row name="URL" meta={st?.url || 'JARVIS_VOICEBOX_URL'} status={available ? 'OK' : (loading ? '…' : 'INJOIGNABLE')} statusColor={available ? '#34C759' : '#FF3B30'} />
        <Row name="Backend synthèse" meta={st?.backend || 'non sondé'} status={st?.backend ? 'OK' : '—'} statusColor={st?.backend ? '#34C759' : 'rgba(17,17,20,0.35)'} />
        <Row name="Moteur par défaut" meta="ENGINES · luxtts par défaut" status={st?.engine_default || '—'} statusColor="#0A84FF" />
        {st?.error && (
          <Row name="Dernière erreur" meta={st.error} status="ERREUR" statusColor="#FF3B30" />
        )}
      </Card>
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 11,
            padding: '6px 14px',
            borderRadius: 999,
            border: '1px solid rgba(17,17,20,0.12)',
            background: 'rgba(255,255,255,0.5)',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Sonde en cours…' : 'Actualiser'}
        </button>
      </div>
    </PageShell>
  )
}
