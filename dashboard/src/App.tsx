import { useEffect, useState } from 'react'
import AnimatedBackground from './components/AnimatedBackground'
import Sidebar from './components/Sidebar'
import TopNav from './components/TopNav'
import RecoveryPage from './pages/RecoveryPage'
import DashboardOverview from './pages/DashboardOverview'
import CommandCenter from './pages/CommandCenter'
import MissionDevBoardPage from './pages/MissionDevBoardPage'
import VoiceManager from './pages/VoiceManager'
import HolomatPage from './pages/HolomatPage'
import Entities from './pages/Entities'
import AgentsPage from './pages/AgentsPage'
import ToolsPage from './pages/ToolsPage'
import AgentReachPage from './pages/AgentReachPage'
import ApplicationsPage from './pages/ApplicationsPage'
import HudSurfacePage from './pages/HudSurfacePage'
import DockerPage from './pages/DockerPage'
import TerminalPage from './pages/TerminalPage'
import DeployPage from './pages/DeployPage'
import SystemMonitoring from './pages/SystemMonitoring'
import AIProviders from './pages/AIProviders'
import SystemSettings from './pages/SystemSettings'
import { pageFromHash, PAGE_IDS, type Page } from './types'
import { DashToastProvider } from './components/DashToast'
import { CoreSessionProvider } from './context/CoreSessionContext'
import { AdminLoginGate } from './components/AdminLoginGate'

function PageContent({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  switch (page) {
    case 'recovery': return <RecoveryPage onNavigate={onNavigate} />
    case 'hud': return <HudSurfacePage />
    case 'dashboard': return <DashboardOverview />
    case 'command': return <CommandCenter onNavigate={onNavigate} />
    case 'mission-board': return <MissionDevBoardPage />
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
 * Dashboard admin — clics/clavier actifs par défaut (paramétrage à la souris).
 * Le mode voice-only (clics coupés) n'a de sens que quand le HUD l'embarque
 * et le pilote explicitement via `jarvis:inputMode` — jamais par défaut, sinon
 * la totalité des boutons/liens reste inerte en accès direct.
 * Ctrl+Alt+R bascule quand même vers 'voice' pour tester ce mode-là.
 */
export default function App() {
  const [page, setPage] = useState<Page>(() => pageFromHash() ?? 'dashboard')
  const [inputMode, setInputMode] = useState<'voice' | 'recovery'>(() => {
    if (typeof window === 'undefined') return 'recovery'
    return new URLSearchParams(window.location.search).get('voice') === '1' ? 'voice' : 'recovery'
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
    <CoreSessionProvider>
    <AdminLoginGate>
    <DashToastProvider>
    <div className="dash-shell" data-input-mode={inputMode}>
      <AnimatedBackground />
      {inputMode === 'voice' && (
        <div
          data-jarvis-always-interactive
          className="dash-voice-banner"
        >
          MODE VOIX — clics désactivés
          <button
            type="button"
            data-jarvis-always-interactive
            onClick={() => setInputMode('recovery')}
          >
            ACTIVER CLICS
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
      <Sidebar
        active={page}
        onNavigate={go}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />
      <div className="dash-main">
        <TopNav
          page={page}
          onMenu={() => setNavOpen(true)}
          onRecovery={() => {
            setInputMode('recovery')
            go('recovery')
          }}
        />
        <div className="dash-main-scroll">
          <PageContent page={page} onNavigate={go} />
        </div>
      </div>
    </div>
    </DashToastProvider>
    </AdminLoginGate>
    </CoreSessionProvider>
  )
}
