import { useState, useEffect } from 'react'
import { HOST, PAGE_TITLES, type Page } from '../types'

interface Props {
  page: Page
  onRecovery?: () => void
  onMenu?: () => void
}

export default function TopNav({ page, onRecovery, onMenu }: Props) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const timeStr = time.toLocaleTimeString('fr-FR', { hour12: false })
  const dateStr = time.toLocaleDateString('fr-FR', { weekday: 'short', month: 'short', day: 'numeric' })
  const isRecovery = page === 'recovery'

  return (
    <header style={{
      height: 52,
      background: isRecovery ? 'rgba(40, 12, 8, 0.85)' : 'rgba(5, 8, 22, 0.8)',
      backdropFilter: 'blur(16px)',
      borderBottom: isRecovery ? '1px solid rgba(255, 107, 74, 0.35)' : '1px solid rgba(0, 229, 255, 0.1)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 clamp(10px, 2vw, 24px)',
      gap: 10,
      zIndex: 10,
      flexShrink: 0,
      minWidth: 0,
    }}>
      {onMenu && (
        <button type="button" className="dash-menu-btn" onClick={onMenu} aria-label="Menu">
          ☰
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <span className="dash-hide-sm" style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.4)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
          JARVIS / {HOST.role} /
        </span>
        <span style={{
          fontFamily: 'Orbitron',
          fontSize: 12,
          fontWeight: 600,
          color: isRecovery ? '#FF6B4A' : '#00E5FF',
          letterSpacing: '0.1em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {PAGE_TITLES[page]}
        </span>
      </div>

      <div className="dash-nav-compact-meta">
        {onRecovery && (
          <button
            type="button"
            title="Ctrl+Alt+R — dépannage clavier/souris"
            onClick={onRecovery}
            style={{
              fontFamily: 'JetBrains Mono',
              fontSize: 10,
              letterSpacing: '0.06em',
              padding: '5px 10px',
              borderRadius: 6,
              border: '1px solid rgba(255,107,74,0.45)',
              background: isRecovery ? 'rgba(255,107,74,0.2)' : 'rgba(255,107,74,0.08)',
              color: '#FF6B4A',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            RECOVERY
          </button>
        )}
        <div className="dash-hide-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#00FF99', boxShadow: '0 0 6px #00FF99' }} />
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 255, 153, 0.7)' }}>UI OK</span>
        </div>
        <div className="dash-hide-sm" style={{ width: 1, height: 16, background: 'rgba(0, 229, 255, 0.15)' }} />
        <div className="dash-hide-sm" style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.5)' }}>{dateStr}</div>
        <div style={{ fontFamily: 'Orbitron', fontSize: 13, fontWeight: 600, color: '#00E5FF', letterSpacing: '0.15em' }} className="animate-flicker">
          {timeStr}
        </div>
      </div>
    </header>
  )
}
