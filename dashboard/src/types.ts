/** Pages Dashboard Core — cahier §13.7 + host VPS + Recovery */
export type Page =
  | 'recovery'
  | 'hud'
  | 'dashboard'
  | 'command'
  | 'mission-board'
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
  'mission-board': 'Mission DEV · Board',
  voice: 'Voice Manager',
  holomat: 'Holomat Vision',
  entities: 'Entités',
  agents: 'Agents',
  tools: 'Tools',
  reach: 'Recherche web',
  apps: 'Applications hôtes',
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

/** Contexte host — en DEV = Core local ; en prod = VPS → NUC. */
export const HOST = {
  role: import.meta.env.DEV ? 'PC DEV → Core local' : 'VPS→NUC',
  label: import.meta.env.DEV ? '127.0.0.1:8765' : 'jarvis (proxy VPS)',
  path: import.meta.env.DEV ? 'c:/laragon/www/jarvis-os-linux' : '/opt/jarvis',
  coreHost: import.meta.env.DEV ? 'local' : 'NUC',
  dockerUi: 'https://vps.example:9443',
  ssh: 'via tunnel / Tailscale',
} as const
