import { useState, useEffect } from 'react'
import type { Page } from '../types'
import { HOST } from '../types'
import { tokens } from '../ui/tokens'
import { useCoreSession } from '../context/CoreSessionContext'
import { dashRequest } from '../lib/dashQuery'
import { AdminUserMenu } from './AdminUserMenu'

const BORDER = tokens.color.border
const TEXT = tokens.color.text
const MUTED = tokens.color.textMuted

interface NavItem { icon: string; label: string; id: Page }
interface NavSection { label: string; items: NavItem[] }

const sections: NavSection[] = [
  {
    label: 'Survie',
    items: [
      { icon: '⚠', label: 'Recovery', id: 'recovery' },
    ],
  },
  {
    label: 'Surfaces',
    items: [
      { icon: '◈', label: 'HUD', id: 'hud' },
      { icon: '▣', label: 'Dashboard', id: 'dashboard' },
    ],
  },
  {
    label: 'Cockpit',
    items: [
      { icon: '⬡', label: 'Command Center', id: 'command' },
      { icon: '▦', label: 'Mission DEV Board', id: 'mission-board' },
      { icon: '◎', label: 'Hermes Core', id: 'hermes' },
    ],
  },
  {
    label: 'Managers',
    items: [
      { icon: '◎', label: 'Voice', id: 'voice' },
      { icon: '◉', label: 'Holomat', id: 'holomat' },
      { icon: '⊕', label: 'Entités', id: 'entities' },
      { icon: '⊗', label: 'Agents', id: 'agents' },
      { icon: '⟨⟩', label: 'Tools', id: 'tools' },
      { icon: '👁', label: 'Agent-Reach', id: 'reach' },
      { icon: '◫', label: 'Apps hôtes', id: 'apps' },
    ],
  },
  {
    label: 'Host VPS',
    items: [
      { icon: '▣', label: 'Docker', id: 'docker' },
      { icon: '>_', label: 'Terminal', id: 'terminal' },
      { icon: '⇑', label: 'Déploiements', id: 'deploy' },
      { icon: '⊡', label: 'Système', id: 'system' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { icon: '◐', label: 'IA / Providers', id: 'ai' },
      { icon: '◌', label: 'Réglages', id: 'settings' },
    ],
  },
]

const LS_COLLAPSED = 'dash.sidebarCollapsed'

interface Props {
  active: Page
  onNavigate: (page: Page) => void
  open?: boolean
  onClose?: () => void
}

export default function Sidebar({ active, onNavigate, open = false, onClose }: Props) {
  const { client } = useCoreSession()
  const [hermesOnline, setHermesOnline] = useState<boolean | null>(null)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(LS_COLLAPSED) === '1'
  })

  useEffect(() => {
    void dashRequest(client, { type: 'hermes_status', action: 'status' }, 'hermes_result', 8000)
      .then((d) => setHermesOnline(d.healthy === true))
      .catch(() => setHermesOnline(false))
  }, [client])

  const toggleCollapsed = () => {
    setCollapsed(c => {
      const next = !c
      try { window.localStorage.setItem(LS_COLLAPSED, next ? '1' : '0') } catch { /* */ }
      return next
    })
  }

  return (
    <aside className={`dash-sidebar${open ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`} aria-hidden={!open && undefined}>
      <div style={{ padding: collapsed ? '20px 12px 16px' : '20px 16px 16px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: collapsed ? 0 : 4, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <div
            className="dash-brand-orb"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              flexShrink: 0,
              overflow: 'hidden',
              boxShadow: '0 0 20px rgba(10, 132, 255, 0.45), inset 0 0 0 1px rgba(255,255,255,0.25)',
            }}
          >
            <img
              src="/orb/jarvis.jpeg"
              alt=""
              width={36}
              height={36}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
          {!collapsed && (
            <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 15, color: TEXT, letterSpacing: '0.14em' }}>
              J.A.R.V.I.S
            </div>
          )}
          {!collapsed && onClose && (
            <button
              type="button"
              className="dash-menu-btn"
              onClick={onClose}
              aria-label="Fermer le menu"
              style={{ marginLeft: 'auto' }}
            >
              ✕
            </button>
          )}
        </div>
        {!collapsed && (
          <div style={{ fontFamily: 'Inter', fontSize: 10, color: MUTED, letterSpacing: '0.06em', paddingLeft: 46 }}>
            Dashboard · VPS
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Déplier le menu' : 'Réduire le menu'}
          title={collapsed ? 'Déplier' : 'Réduire'}
          className="dash-hide-mobile"
          style={{
            marginTop: 12,
            width: collapsed ? 32 : '100%',
            marginLeft: collapsed ? 'auto' : 0,
            marginRight: collapsed ? 'auto' : 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '6px 0',
            borderRadius: 10,
            border: `1px solid ${BORDER}`,
            background: 'rgba(255,255,255,0.04)',
            color: MUTED,
            cursor: 'pointer',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!collapsed && <span style={{ fontFamily: 'Inter', fontSize: 10, letterSpacing: '0.08em' }}>RÉDUIRE</span>}
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', background: hermesOnline ? 'rgba(52, 199, 89, 0.08)' : 'rgba(255, 59, 48, 0.08)', borderRadius: 8, border: hermesOnline ? '1px solid rgba(52, 199, 89, 0.2)' : '1px solid rgba(255, 59, 48, 0.2)' }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: hermesOnline ? tokens.color.success : tokens.color.danger }} />
            <span style={{ fontFamily: 'Inter', fontSize: 10, color: hermesOnline ? tokens.color.success : tokens.color.danger, letterSpacing: '0.02em' }}>
              {hermesOnline == null ? 'Hermes …' : hermesOnline ? 'Hermes en ligne' : 'Hermes hors ligne'}
            </span>
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 10, color: MUTED, paddingLeft: 4 }}>
            {HOST.label} · {HOST.path}
          </div>
        </div>
      )}

      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 8px' }}>
        {sections.map((section, si) => (
          <div key={si}>
            {section.label && !collapsed && <div className="sidebar-section-label">{section.label}</div>}
            {section.items.map(item => (
              <button
                key={item.id}
                type="button"
                className={`sidebar-nav-item${active === item.id ? ' active' : ''}${collapsed ? ' is-collapsed' : ''}`}
                title={collapsed ? item.label : undefined}
                onClick={() => {
                  onNavigate(item.id)
                  onClose?.()
                }}
              >
                <span className="icon" style={{ fontFamily: 'monospace' }}>{item.icon}</span>
                {!collapsed && item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div style={{ padding: collapsed ? '10px 12px' : '10px 16px', borderTop: `1px solid ${BORDER}` }}>
        <AdminUserMenu collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </aside>
  )
}
