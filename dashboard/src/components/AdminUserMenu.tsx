/**
 * Pied de sidebar — avatar + menu compte (patron Metronic / shadcn Avatar+Dropdown).
 * Données = session Core réelle. skipAuth n'invente pas un Admin VPS.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronUp, LogOut, Settings, ShieldAlert } from 'lucide-react'
import { useCoreSession } from '../context/CoreSessionContext'
import { isAuthBypassEnabled } from '../lib/devAuthBypass'
import type { Page } from '../types'
import { tokens } from '../ui/tokens'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  const one = parts[0] || '?'
  return one.slice(0, 2).toUpperCase()
}

export function AdminUserMenu({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean
  onNavigate: (page: Page) => void
}) {
  const { session, logout } = useCoreSession()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const bypass = isAuthBypassEnabled()

  const name = session?.displayName || session?.username || (bypass ? 'Session DEV' : 'Non connecté')
  const subtitle = session
    ? `${session.role || 'ADMIN'} · ${session.username || session.userId}`
    : bypass
      ? 'skipAuth · pas de session admin'
      : 'aucune session'

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={name}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? 4 : '6px 4px',
          border: 'none',
          background: open ? 'rgba(255,255,255,0.06)' : 'transparent',
          borderRadius: 12,
          cursor: 'pointer',
          color: tokens.color.text,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: tokens.font.body,
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            background: session
              ? `linear-gradient(165deg, ${tokens.color.accent} 0%, #0050c8 100%)`
              : 'rgba(255,255,255,0.18)',
            boxShadow: session ? '0 0 0 1px rgba(255,255,255,0.22), 0 6px 16px -8px rgba(10,132,255,0.7)' : 'none',
          }}
        >
          {initialsOf(name)}
        </div>
        {!collapsed && (
          <>
            <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <div style={{ fontFamily: tokens.font.body, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
              </div>
              <div style={{ fontFamily: tokens.font.mono, fontSize: 9, color: tokens.color.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {subtitle}
              </div>
            </div>
            <ChevronUp
              size={14}
              style={{
                color: tokens.color.textMuted,
                transform: open ? 'rotate(0deg)' : 'rotate(180deg)',
                transition: 'transform 0.15s ease',
                flexShrink: 0,
              }}
            />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            left: collapsed ? 44 : 0,
            right: collapsed ? 'auto' : 0,
            bottom: 'calc(100% + 8px)',
            minWidth: 200,
            padding: 6,
            borderRadius: 14,
            background: 'rgba(18,18,22,0.92)',
            backdropFilter: 'blur(24px) saturate(180%)',
            border: `1px solid ${tokens.color.border}`,
            boxShadow: '0 18px 40px -16px rgba(0,0,0,0.75)',
            zIndex: 40,
          }}
        >
          <div style={{ padding: '8px 10px 10px', borderBottom: `1px solid ${tokens.color.border}`, marginBottom: 4 }}>
            <div style={{ fontFamily: tokens.font.body, fontSize: 12, fontWeight: 600, color: tokens.color.text }}>{name}</div>
            <div style={{ fontFamily: tokens.font.mono, fontSize: 9, color: tokens.color.textMuted, marginTop: 2 }}>{subtitle}</div>
          </div>
          <MenuRow
            icon={<Settings size={14} />}
            label="Réglages système"
            onClick={() => { onNavigate('settings'); setOpen(false) }}
          />
          <MenuRow
            icon={<ShieldAlert size={14} />}
            label="Recovery"
            onClick={() => { onNavigate('recovery'); setOpen(false) }}
          />
          {session && (
            <MenuRow
              icon={<LogOut size={14} />}
              label="Déconnexion"
              danger
              onClick={() => { logout(); setOpen(false) }}
            />
          )}
        </div>
      )}
    </div>
  )
}

function MenuRow({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        border: 'none',
        background: 'transparent',
        borderRadius: 10,
        cursor: 'pointer',
        color: danger ? tokens.color.danger : tokens.color.text,
        fontFamily: tokens.font.body,
        fontSize: 12,
        textAlign: 'left',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {icon}
      {label}
    </button>
  )
}
