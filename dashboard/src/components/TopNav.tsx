import { useState, useEffect } from 'react'
import { HOST, PAGE_TITLES, type Page } from '../types'
import { GlassButton } from './glass'
import { tokens } from '../ui/tokens'

const ACCENT = tokens.color.accent
const BORDER = tokens.color.border
const MUTED = tokens.color.textMuted

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
    <header className={`dash-topnav${isRecovery ? ' is-recovery' : ''}`}>
      {onMenu && (
        <button type="button" className="dash-menu-btn" onClick={onMenu} aria-label="Menu">
          ☰
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <span className="dash-hide-sm" style={{ fontFamily: tokens.font.mono, fontSize: 10, color: MUTED, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
          JARVIS / {HOST.role} /
        </span>
        <span style={{
          fontFamily: 'Inter',
          fontSize: 12,
          fontWeight: 600,
          color: isRecovery ? '#FF6B4A' : ACCENT,
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
          <GlassButton
            tone="danger"
            active={isRecovery}
            title="Ctrl+Alt+R — dépannage clavier/souris"
            onClick={onRecovery}
            style={{ fontFamily: 'JetBrains Mono', fontSize: 10, flexShrink: 0 }}
          >
            RECOVERY
          </GlassButton>
        )}
        <div className="dash-hide-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: tokens.color.success }} />
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(52, 199, 89, 0.85)' }}>UI OK</span>
        </div>
        <div className="dash-hide-sm" style={{ width: 1, height: 16, background: BORDER }} />
        <div className="dash-hide-sm" style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: MUTED }}>{dateStr}</div>
        <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 600, color: ACCENT, letterSpacing: '0.15em' }}>
          {timeStr}
        </div>
      </div>
    </header>
  )
}
