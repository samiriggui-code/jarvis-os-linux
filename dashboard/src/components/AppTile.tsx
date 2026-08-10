import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { GlassPanel } from './glass'
import { GlassPill, type GlassPillTone } from './glass/GlassPill'
import { tokens } from '../ui/tokens'
import type { AppStatus } from '../apps/catalog'
import { statusLabel, statusTone } from '../apps/catalog'

export interface AppTileProps {
  name: string
  icon: LucideIcon
  color: string
  status: AppStatus
  blurb?: string
  meta?: string
  locked?: boolean
  onClick?: () => void
}

export function AppTile({
  name,
  icon: Icon,
  color,
  status,
  blurb,
  meta,
  locked,
  onClick,
}: AppTileProps) {
  const tone = statusTone(status) as GlassPillTone

  const tileStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    padding: '18px 14px 16px',
    textAlign: 'center',
    minHeight: 148,
    width: '100%',
    cursor: onClick ? 'pointer' : 'default',
    transition: 'transform 0.15s ease, box-shadow 0.2s ease',
  }

  const body = (
    <>
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(165deg, ${color}22 0%, rgba(255,255,255,0.04) 100%)`,
          border: `1px solid ${color}44`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px -12px ${color}55`,
        }}
      >
        <Icon size={24} strokeWidth={1.75} style={{ color }} />
      </div>
      <div style={{ width: '100%', minWidth: 0 }}>
        <div
          style={{
            fontFamily: tokens.font.body,
            fontSize: 13,
            fontWeight: 600,
            color: tokens.color.text,
            letterSpacing: '0.02em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
        {blurb ? (
          <div
            style={{
              fontFamily: tokens.font.mono,
              fontSize: 9,
              color: tokens.color.textMuted,
              marginTop: 4,
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {blurb}
          </div>
        ) : null}
        {meta ? (
          <div
            style={{
              fontFamily: tokens.font.mono,
              fontSize: 8,
              color: tokens.color.textMuted,
              marginTop: 6,
              opacity: 0.85,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {meta}
          </div>
        ) : null}
      </div>
      <GlassPill tone={locked ? 'warning' : tone} dot style={{ marginTop: 'auto' }}>
        {locked ? 'ADMIN' : statusLabel(status)}
      </GlassPill>
    </>
  )

  return (
    <GlassPanel
      level="regular"
      radius="lg"
      padding={0}
      className={onClick ? 'dash-app-tile glass-btn' : 'dash-app-tile'}
      style={tileStyle}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      } : undefined}
    >
      {body}
    </GlassPanel>
  )
}
