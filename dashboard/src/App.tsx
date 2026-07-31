import { useEffect, useState } from 'react'
import AnimatedBackground from './components/AnimatedBackground'
import Sidebar from './components/Sidebar'
import TopNav from './components/TopNav'
import RecoveryPage from './pages/RecoveryPage'
import DashboardOverview from './pages/DashboardOverview'
import CommandCenter from './pages/CommandCenter'
import HermesCore from './pages/HermesCore'
import VoiceManager from './pages/VoiceManager'
import HolomatPage from './pages/HolomatPage'
import Entities from './pages/Entities'
import AgentsPage from './pages/AgentsPage'
import ToolsPage from './pages/ToolsPage'
import AgentReachPage from './pages/AgentReachPage'
import ApplicationsPage from './pages/ApplicationsPage'
import DockerPage from './pages/DockerPage'
import TerminalPage from './pages/TerminalPage'
import DeployPage from './pages/DeployPage'
import SystemMonitoring from './pages/SystemMonitoring'
import AIProviders from './pages/AIProviders'
import SystemSettings from './pages/SystemSettings'
import { pageFromHash, PAGE_IDS, type Page } from './types'

function PageContent({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  switch (page) {
    case 'recovery': return <RecoveryPage onNavigate={onNavigate} />
    case 'dashboard': return <DashboardOverview />
    case 'command': return <CommandCenter onNavigate={onNavigate} />
    case 'hermes': return <HermesCore />
    case 'voice': return <VoiceManager />
    case 'holomat': return <HolomatPage />
    case 'entities': return <Entities />
    case 'agents': return <AgentsPage />
    case 'tools': return <ToolsPage />
    case 'reach': return <AgentReachPage />
    case 'apps': return <ApplicationsPage />
    case 'docker': return <DockerPage />
    case 'terminal': return <TerminalPage />
    case 'deploy': return <DeployPage />
    case 'system': return <SystemMonitoring />
    case 'ai': return <AIProviders />
    case 'settings': return <SystemSettings />
    default: return <DashboardOverview />
  }
}

function navigateTo(page: Page, setPage: (p: Page) => void) {
  setPage(page)
  const next = `#/${page}`
  if (window.location.hash !== next) {
    window.history.replaceState(null, '', next)
  }
}

/**
 * Dashboard VPS — défaut voice-only (pas de clic).
 * Ctrl+Alt+R → recovery (clics) + page Recovery.
 * postMessage depuis HUD : jarvis:navigate / jarvis:inputMode
 */
export default function App() {
  const [page, setPage] = useState<Page>(() => pageFromHash() ?? 'dashboard')
  const [inputMode, setInputMode] = useState<'voice' | 'recovery'>(() => {
    if (typeof window === 'undefined') return 'voice'
    return new URLSearchParams(window.location.search).get('recovery') === '1' ? 'recovery' : 'voice'
  })

  useEffect(() => {
    document.body.classList.toggle('dash-voice-only', inputMode === 'voice')
    document.body.classList.toggle('dash-recovery', inputMode === 'recovery')
    document.documentElement.dataset.jarvisInput = inputMode
  }, [inputMode])

  useEffect(() => {
    const onHash = () => {
      const p = pageFromHash()
      if (p) setPage(p)
    }
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/dashboard')
    }
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        setInputMode(m => {
          const next = m === 'voice' ? 'recovery' : 'voice'
          if (next === 'recovery') navigateTo('recovery', setPage)
          return next
        })
      }
      if (inputMode === 'voice') {
        const t = e.target as HTMLElement | null
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [inputMode])

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data
      if (!data || typeof data !== 'object') return
      if (data.type === 'jarvis:navigate' && typeof data.page === 'string') {
        const raw = String(data.page)
        const p = (PAGE_IDS as string[]).includes(raw) ? (raw as Page) : null
        if (p) navigateTo(p, setPage)
      }
      if (data.type === 'jarvis:inputMode' && (data.mode === 'voice' || data.mode === 'recovery')) {
        setInputMode(data.mode)
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const go = (p: Page) => navigateTo(p, setPage)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    const onResize = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) setNavOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className="dash-shell" data-input-mode={inputMode}>
      <AnimatedBackground />
      {inputMode === 'recovery' && (
        <div
          data-jarvis-always-interactive
          style={{
            position: 'fixed',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            padding: '6px 14px',
            borderRadius: 8,
            background: 'rgba(40,12,8,0.92)',
            border: '1px solid rgba(255,107,74,0.5)',
            fontFamily: 'JetBrains Mono',
            fontSize: 10,
            color: '#FF6B4A',
            letterSpacing: '0.06em',
            pointerEvents: 'auto',
            maxWidth: 'min(92vw, 420px)',
            textAlign: 'center',
          }}
        >
          RECOVERY — CLICS ACTIFS · Ctrl+Alt+R = voix
          <button
            type="button"
            data-jarvis-always-interactive
            onClick={() => setInputMode('voice')}
            style={{
              marginLeft: 12,
              fontFamily: 'JetBrains Mono',
              fontSize: 9,
              color: '#00E5FF',
              background: 'rgba(0,229,255,0.1)',
              border: '1px solid rgba(0,229,255,0.35)',
              borderRadius: 6,
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            MODE VOIX
          </button>
        </div>
      )}
      {navOpen && (
        <div
          className="dash-sidebar-backdrop"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}
      <div style={{ pointerEvents: inputMode === 'voice' ? 'none' : 'auto', display: 'contents' }}>
        <Sidebar
          active={page}
          onNavigate={go}
          open={navOpen}
          onClose={() => setNavOpen(false)}
        />
      </div>
      <div className="dash-main">
        <div style={{ pointerEvents: inputMode === 'voice' ? 'none' : 'auto' }}>
          <TopNav
            page={page}
            onMenu={() => setNavOpen(true)}
            onRecovery={() => {
              setInputMode('recovery')
              go('recovery')
            }}
          />
        </div>
        <main
          style={{
            flex: 1,
            overflow: 'hidden',
            position: 'relative',
            pointerEvents: inputMode === 'voice' ? 'none' : 'auto',
            minHeight: 0,
          }}
        >
          <PageContent page={page} onNavigate={go} />
        </main>
      </div>
    </div>
  )
}
