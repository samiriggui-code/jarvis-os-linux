import type { Page } from '../types'
import { HOST } from '../types'

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
    label: 'Cockpit',
    items: [
      { icon: '▣', label: 'Dashboard', id: 'dashboard' },
      { icon: '⬡', label: 'Command Center', id: 'command' },
      { icon: '◈', label: 'Hermes Core', id: 'hermes' },
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
      { icon: '◫', label: 'Applications', id: 'apps' },
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

interface Props {
  active: Page
  onNavigate: (page: Page) => void
  open?: boolean
  onClose?: () => void
}

export default function Sidebar({ active, onNavigate, open = false, onClose }: Props) {
  return (
    <aside className={`dash-sidebar${open ? ' is-open' : ''}`} aria-hidden={!open && undefined}>
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(0, 229, 255, 0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div className="animate-pulse-glow" style={{ width: 32, height: 32, border: '1.5px solid #00E5FF', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 229, 255, 0.06)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" stroke="#00E5FF" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M12 2v20M2 7l10 5 10-5" stroke="#00E5FF" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ fontFamily: 'Orbitron', fontWeight: 800, fontSize: 17, color: '#00E5FF', letterSpacing: '0.12em' }} className="glow-text">JARVIS</div>
          {onClose && (
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
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: 'rgba(0, 229, 255, 0.32)', letterSpacing: '0.12em', paddingLeft: 42 }}>
          DASHBOARD · VPS
        </div>
      </div>

      <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(0, 229, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', background: 'rgba(0, 255, 153, 0.05)', borderRadius: 6, border: '1px solid rgba(0, 255, 153, 0.12)' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00FF99', boxShadow: '0 0 6px #00FF99' }} className="animate-pulse-glow" />
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#00FF99', letterSpacing: '0.05em' }}>HERMES ONLINE</span>
        </div>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: 'rgba(0,229,255,0.4)', paddingLeft: 4 }}>
          {HOST.label} · {HOST.path}
        </div>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {sections.map((section, si) => (
          <div key={si}>
            {section.label && <div className="sidebar-section-label">{section.label}</div>}
            {section.items.map(item => (
              <div
                key={item.id}
                className={`sidebar-nav-item${active === item.id ? ' active' : ''}`}
                onClick={() => {
                  onNavigate(item.id)
                  onClose?.()
                }}
              >
                <span className="icon" style={{ fontFamily: 'monospace' }}>{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(0, 229, 255, 0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #0066FF, #00E5FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: '#050816' }}>A</div>
          <div>
            <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'rgba(224, 244, 255, 0.9)' }}>Admin</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: 'rgba(0, 229, 255, 0.35)' }}>dashboard_access · VPS</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
