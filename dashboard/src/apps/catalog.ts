/**
 * Catalogue intentions — miroir HUD + surfaces Core (capabilities.py).
 * Une entrée = une intention affichable ; le routage runtime reste côté Core.
 */
import type { LucideIcon } from 'lucide-react'
import {
  Terminal, Settings, Cpu, Shield, Wifi, Brain, Boxes, Camera,
  BarChart3, Code, HardDrive, Globe, Music, Video, Home, Mail,
  FolderOpen, Box, Calendar, Sparkles, Radar, Link2,
  BrainCog, Coins, Target, Network, Timer, Wrench, LayoutGrid, Monitor,
} from 'lucide-react'
import type { Page } from '../types'

export type AppStatus = 'live' | 'surface' | 'soon'
export type AppCat = 'Surfaces' | 'Système' | 'Agent' | 'Maison' | 'Médias' | 'Outils'
export type AppOwner = 'core' | 'hermes' | 'device'

export interface DashApp {
  id: string
  name: string
  icon: LucideIcon
  color: string
  cat: AppCat
  status: AppStatus
  blurb?: string
  intent?: string
  owner?: AppOwner
  /** Page dashboard si cliquable depuis l'admin */
  page?: Page
  /** Lien externe (ex. HUD kiosk) */
  externalUrl?: string | (() => string)
  adminOnly?: boolean
  pinned?: boolean
}

const C = {
  accent: '#0A84FF',
  success: '#34C759',
  warning: '#FF9F1C',
  danger: '#FF3B30',
  muted: '#8E8E93',
  violet: '#BF5AF2',
  teal: '#64D2FF',
} as const

/** Surfaces produit — arborescence Core (HUD kiosk + Dashboard admin). */
export const SURFACE_APPS: DashApp[] = [
  {
    id: 'hud-surface',
    name: 'HUD',
    icon: LayoutGrid,
    color: C.accent,
    cat: 'Surfaces',
    status: 'live',
    pinned: true,
    owner: 'core',
    blurb: 'Interface kiosk — orbe, voix, apps',
    page: 'hud',
  },
  {
    id: 'hub',
    name: 'Dashboard',
    icon: Monitor,
    color: C.teal,
    cat: 'Surfaces',
    status: 'live',
    pinned: true,
    adminOnly: true,
    owner: 'core',
    blurb: 'Admin Core / VPS — tokens, managers',
    intent: 'core.dashboard',
    page: 'dashboard',
  },
]

/** Intentions — alignées `hud/src/app/apps/catalog.ts` + capabilities.py */
export const DASH_APPS: DashApp[] = [
  ...SURFACE_APPS,
  {
    id: 'settings', name: 'Paramètres', icon: Settings, color: C.accent, cat: 'Système',
    status: 'live', pinned: true, owner: 'core', intent: 'core.preferences', page: 'settings',
    blurb: 'Préférences système',
  },
  {
    id: 'jarvis', name: 'Noyau', icon: Brain, color: C.violet, cat: 'Système',
    status: 'live', pinned: true, owner: 'core', intent: 'core.neural_map', page: 'hermes',
    blurb: 'Carte NeuralMap / Hermes',
  },
  {
    id: 'monitor', name: 'Moniteur', icon: Cpu, color: C.success, cat: 'Système',
    status: 'live', owner: 'core', intent: 'core.monitor', page: 'system',
    blurb: 'Charge & processus',
  },
  {
    id: 'vision', name: 'Holomat', icon: Camera, color: C.violet, cat: 'Système',
    status: 'live', owner: 'core', intent: 'core.holomat', page: 'holomat',
    blurb: 'Caméra / gestes',
  },
  {
    id: 'security', name: 'Sécurité', icon: Shield, color: C.danger, cat: 'Système',
    status: 'surface', owner: 'core', intent: 'core.security', page: 'settings',
    blurb: 'Policy / auth',
  },
  {
    id: 'cerveau', name: 'Providers IA', icon: BrainCog, color: C.violet, cat: 'Système',
    status: 'surface', owner: 'core', intent: 'core.providers', page: 'ai',
    blurb: 'Routeur de modèles',
  },
  {
    id: 'tokens', name: 'Usage', icon: Coins, color: C.warning, cat: 'Système',
    status: 'surface', owner: 'core', intent: 'core.usage', page: 'dashboard',
    blurb: 'Quotas & tokens',
  },
  {
    id: 'network', name: 'Réseau', icon: Wifi, color: C.accent, cat: 'Système',
    status: 'soon', owner: 'core', intent: 'system.network',
    blurb: 'LAN / agents',
  },
  {
    id: 'terminal', name: 'Terminal', icon: Terminal, color: C.accent, cat: 'Outils',
    status: 'surface', owner: 'hermes', intent: 'system.shell', page: 'terminal',
    blurb: 'Shell allowlist VPS',
  },
  {
    id: 'files', name: 'Fichiers', icon: FolderOpen, color: C.warning, cat: 'Agent',
    status: 'surface', owner: 'hermes', intent: 'files.browse',
    blurb: 'Explorateur chemins autorisés',
  },
  {
    id: 'browser', name: 'Navigateur', icon: Globe, color: C.accent, cat: 'Agent',
    status: 'surface', owner: 'hermes', intent: 'web.browse',
    blurb: 'Navigation pilotée',
  },
  {
    id: 'reach', name: 'Agent Reach', icon: Globe, color: C.teal, cat: 'Agent',
    status: 'surface', owner: 'hermes', intent: 'web.search', page: 'reach',
    blurb: 'Recherche web',
  },
  {
    id: 'docker', name: 'Docker', icon: Box, color: C.accent, cat: 'Outils',
    status: 'soon', owner: 'hermes', intent: 'vps.docker', page: 'docker',
    blurb: 'Conteneurs VPS',
  },
  {
    id: 'code', name: 'Code', icon: Code, color: C.success, cat: 'Outils',
    status: 'soon', owner: 'device', intent: 'vps.code',
    blurb: 'Éditeur distant',
  },
  {
    id: 'analyze', name: 'Analyse', icon: BarChart3, color: C.accent, cat: 'Agent',
    status: 'surface', owner: 'hermes', intent: 'data.analyze',
    blurb: 'Exécution / stats',
  },
  {
    id: 'storage', name: 'Stockage', icon: HardDrive, color: C.warning, cat: 'Outils',
    status: 'soon', owner: 'hermes', intent: 'vps.storage',
    blurb: 'Volumes VPS',
  },
  {
    id: 'objectifs', name: 'Missions', icon: Target, color: C.success, cat: 'Agent',
    status: 'soon', owner: 'core', intent: 'core.missions',
    blurb: 'Objectifs utilisateur',
  },
  {
    id: 'skills', name: 'Skills', icon: Sparkles, color: C.violet, cat: 'Agent',
    status: 'surface', owner: 'hermes', intent: 'agent.skills', page: 'tools',
    blurb: 'Compétences agent',
  },
  {
    id: 'connexions', name: 'Appareils', icon: Link2, color: C.accent, cat: 'Système',
    status: 'soon', owner: 'core', intent: 'devices.list', page: 'entities',
    blurb: 'Device Manager',
  },
  {
    id: 'reseau', name: 'Topologie', icon: Network, color: C.teal, cat: 'Agent',
    status: 'soon', owner: 'device', intent: 'devices.topology', page: 'entities',
    blurb: 'Mesh / satellites',
  },
  {
    id: 'cursor', name: 'Cursor', icon: Code, color: C.success, cat: 'Agent',
    status: 'live', owner: 'core', intent: 'core.cursor', page: 'command',
    blurb: 'IDE projet',
  },
  {
    id: 'mission-control-dev', name: 'Mission Control DEV', icon: Radar, color: C.danger, cat: 'Agent',
    status: 'live', owner: 'core', intent: 'core.mission_dev', page: 'command',
    blurb: 'Orchestration dev',
  },
  {
    id: 'crons', name: 'Crons', icon: Timer, color: C.muted, cat: 'Agent',
    status: 'surface', owner: 'hermes', intent: 'agent.cron', page: 'tools',
    blurb: 'Planifié Hermes',
  },
  {
    id: 'outils', name: 'Outils', icon: Wrench, color: C.warning, cat: 'Agent',
    status: 'surface', owner: 'hermes', intent: 'agent.tools', page: 'tools',
    blurb: 'Tool manager',
  },
  {
    id: 'home', name: 'Maison', icon: Home, color: C.success, cat: 'Maison',
    status: 'surface', owner: 'core', intent: 'home.control', page: 'entities',
    blurb: 'Home Assistant',
  },
  {
    id: 'music', name: 'Musique', icon: Music, color: C.success, cat: 'Médias',
    status: 'surface', owner: 'hermes', intent: 'media.music', page: 'voice',
    blurb: 'Audio / Spotify',
  },
  {
    id: 'video', name: 'Vidéo', icon: Video, color: C.warning, cat: 'Médias',
    status: 'surface', owner: 'core', intent: 'media.video',
    blurb: 'Plex / streaming',
  },
  {
    id: 'mail', name: 'Courrier', icon: Mail, color: C.muted, cat: 'Outils',
    status: 'soon', blurb: 'Bientôt',
  },
  {
    id: 'calendar', name: 'Agenda', icon: Calendar, color: C.muted, cat: 'Outils',
    status: 'soon', blurb: 'Bientôt',
  },
]

export const APP_CATEGORIES: Array<'Tout' | AppCat> = [
  'Tout', 'Surfaces', 'Système', 'Agent', 'Maison', 'Médias', 'Outils',
]

export function statusLabel(s: AppStatus): string {
  if (s === 'live') return 'LIVE'
  if (s === 'surface') return 'SURFACE'
  return 'SOON'
}

export function statusTone(s: AppStatus): 'success' | 'accent' | 'warning' {
  if (s === 'live') return 'success'
  if (s === 'surface') return 'accent'
  return 'warning'
}

export function hudPublicUrl(): string {
  if (typeof window === 'undefined') return '/'
  const env = import.meta.env.VITE_HUD_URL as string | undefined
  if (env) return env
  const { origin, pathname } = window.location
  if (pathname.includes('/dashboard')) {
    const base = pathname.split('/dashboard')[0] || ''
    return `${origin}${base}/`
  }
  if (origin.includes(':5174')) return 'http://127.0.0.1:5173/'
  return `${origin}/`
}

export function getAppById(id: string): DashApp | undefined {
  return DASH_APPS.find(a => a.id === id)
}
