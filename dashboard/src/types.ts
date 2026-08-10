/** Pages Dashboard Core — cahier §13.7 + host VPS + Recovery */
export type Page =
  | 'recovery'
  | 'hud'
  | 'dashboard'
  | 'command'
  | 'hermes'
  | 'voice'
  | 'holomat'
  | 'entities'
  | 'agents'
  | 'tools'
  | 'reach'
  | 'apps'
  | 'docker'
  | 'terminal'
  | 'deploy'
  | 'system'
  | 'ai'
  | 'settings'

export const PAGE_TITLES: Record<Page, string> = {
  recovery: 'Recovery / Diagnostic',
  hud: 'HUD · Surface kiosk',
  dashboard: 'Dashboard · Tokens & stats',
  command: 'Command Center',
  hermes: 'Hermes Core',
  voice: 'Voice Manager',
  holomat: 'Holomat Vision',
  entities: 'Entités',
  agents: 'Agents',
  tools: 'Tools',
  reach: 'Agent-Reach · Internet',
  apps: 'Applications',
  docker: 'Docker',
  terminal: 'Terminal · NUC / VPS / Pi',
  deploy: 'Déploiements',
  system: 'Système / Monitoring',
  ai: 'IA / Providers',
  settings: 'Réglages système',
}

export const PAGE_IDS = Object.keys(PAGE_TITLES) as Page[]

export function pageFromHash(): Page | null {
  if (typeof window === 'undefined') return null
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  if (!raw) return null
  return (PAGE_IDS as string[]).includes(raw) ? (raw as Page) : null
}

/** Contexte host — Dashboard servi en public via VPS ; Core/Hermes = NUC. */
export const HOST = {
  role: 'VPS→NUC',
  label: 'jarvis (proxy VPS)',
  path: '/opt/jarvis',
  coreHost: 'NUC',
  dockerUi: 'https://vps.example:9443', // Portainer optionnel VPS — à configurer
  ssh: 'via tunnel / Tailscale',
} as const
