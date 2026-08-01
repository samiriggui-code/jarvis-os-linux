/**
 * Catalogue unique lanceur HUD / dock / voix / Hermes.
 *
 * status:
 *   live   = UI HUD réelle locale
 *   hermes = contenu / actions via Hermes (fenêtre HUD = surface)
 *   soon   = pas encore
 *
 * risk → Policy Engine (info < media < home < admin < vps)
 * VPS limité : terminal / docker / code / storage / deploy — jamais root libre.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Terminal, Settings, Cpu, Shield, Wifi, Brain, Boxes, Camera,
  BarChart3, Code, HardDrive, Globe, Music, Video, Home, Mail,
  FolderOpen, Box, Calendar, Sparkles, Radar, Link2,
  BrainCog, Coins, Target, Network, Timer, Wrench,
} from 'lucide-react';

export type AppStatus = 'live' | 'hermes' | 'soon';
export type AppCat = 'Système' | 'Hermes' | 'Maison' | 'Médias' | 'Outils';
export type AppRisk = 'info' | 'media' | 'home' | 'admin' | 'vps';

export interface HudApp {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
  cat: AppCat;
  status: AppStatus;
  risk: AppRisk;
  pinned?: boolean;
  blurb?: string;
  /** Mots-clés voix / chat pour ouvrir (sans préfixe Jarvis — filtré ailleurs) */
  voice?: string[];
  /** Outil / skill Hermes à invoquer (commande agent) */
  hermesTool?: string;
  /** Réservé ADMIN (dashboard_access) */
  adminOnly?: boolean;
  /** Accès VPS bridé — allowlist + Policy, pas shell root */
  vpsLimited?: boolean;
}

const C = {
  cyan: '#00f5ff',
  blue: '#0ea5e9',
  violet: '#a855f7',
  green: '#22c55e',
  amber: '#f59e0b',
  rose: '#f43f5e',
  slate: '#94a3b8',
} as const;

/**
 * Inventaire revue — une entrée = une app.
 * Hermes commande tout ce qui est status hermes (+ outils à ajouter via skill outils).
 */
export const HUD_APPS: HudApp[] = [
  // —— Système (HUD local) ——
  {
    id: 'settings', name: 'Paramètres', icon: Settings, color: C.blue, cat: 'Système',
    status: 'live', risk: 'info', pinned: true,
    blurb: 'Expérience HUD (voix, vision, foyer)',
    voice: ['paramètres', 'settings', 'réglages'],
  },
  {
    id: 'jarvis', name: 'Noyau', icon: Brain, color: C.violet, cat: 'Système',
    status: 'live', risk: 'info', pinned: true,
    blurb: 'Carte Hermes (NeuralMap)',
    voice: ['noyau', 'carte hermes', 'neural'],
    hermesTool: 'neural_map',
  },
  {
    id: 'hub', name: 'Dashboard', icon: Boxes, color: C.cyan, cat: 'Système',
    status: 'live', risk: 'admin', pinned: true, adminOnly: true,
    blurb: 'Admin Core / VPS — ADMIN seul',
    voice: ['dashboard', 'admin', 'cockpit'],
    hermesTool: 'dashboard_open',
  },
  {
    id: 'monitor', name: 'Moniteur', icon: Cpu, color: C.green, cat: 'Système',
    status: 'live', risk: 'info', pinned: true,
    blurb: 'Charge locale HUD',
    voice: ['moniteur', 'cpu', 'ressources'],
  },
  {
    id: 'vision', name: 'Holomat', icon: Camera, color: C.violet, cat: 'Système',
    status: 'live', risk: 'info', pinned: true,
    blurb: 'Caméra / gestes / calib',
    voice: ['holomat', 'vision', 'gestes', 'caméra'],
  },
  {
    id: 'security', name: 'Sécurité', icon: Shield, color: C.rose, cat: 'Système',
    status: 'hermes', risk: 'admin',
    blurb: 'Policy / auth — via Hermes',
    voice: ['sécurité', 'policy', 'auth'],
    hermesTool: 'security_status',
  },
  {
    id: 'network', name: 'Réseau', icon: Wifi, color: C.blue, cat: 'Système',
    status: 'hermes', risk: 'info',
    blurb: 'LAN / agents — via Hermes',
    voice: ['réseau', 'wifi', 'lan'],
    hermesTool: 'network_status',
  },

  // —— Surfaces Hermes (outils agent) ——
  {
    id: 'terminal', name: 'Terminal', icon: Terminal, color: C.cyan, cat: 'Hermes',
    status: 'hermes', risk: 'vps', pinned: true, vpsLimited: true,
    blurb: 'Shell VPS allowlist — pas root libre',
    voice: ['terminal', 'shell', 'console ssh'],
    hermesTool: 'vps_shell_limited',
  },
  {
    id: 'files', name: 'Fichiers', icon: FolderOpen, color: C.amber, cat: 'Hermes',
    status: 'hermes', risk: 'admin', pinned: true,
    blurb: 'FS via agent (chemins autorisés)',
    voice: ['fichiers', 'dossier', 'explorer'],
    hermesTool: 'files_browse',
  },
  {
    id: 'browser', name: 'Navigateur', icon: Globe, color: C.blue, cat: 'Hermes',
    status: 'hermes', risk: 'info', pinned: true,
    blurb: 'Browsing agent Hermes',
    voice: ['navigateur', 'browser', 'holoweb'],
    hermesTool: 'browser',
  },
  {
    id: 'reach', name: 'Internet', icon: Globe, color: C.cyan, cat: 'Hermes',
    status: 'hermes', risk: 'info', pinned: true,
    blurb: 'Agent-Reach — web / GitHub / YouTube / RSS',
    voice: [
      'internet', 'agent-reach', 'agent reach', 'recherche web', 'cherche',
      'github', 'youtube', 'reddit', 'rss', 'openclaw',
    ],
    hermesTool: 'agent_reach',
  },
  {
    id: 'docker', name: 'Docker', icon: Box, color: C.blue, cat: 'Hermes',
    status: 'hermes', risk: 'vps', vpsLimited: true,
    blurb: 'Conteneurs VPS — status/logs/restart allowlist',
    voice: ['docker', 'conteneur', 'containers'],
    hermesTool: 'vps_docker_limited',
  },
  {
    id: 'code', name: 'VS Code', icon: Code, color: C.green, cat: 'Hermes',
    status: 'hermes', risk: 'vps', vpsLimited: true,
    blurb: 'Éditeur distant — projets allowlist',
    voice: ['code', 'vscode', 'éditeur'],
    hermesTool: 'vps_code_limited',
  },
  {
    id: 'analyze', name: 'Analyse', icon: BarChart3, color: C.cyan, cat: 'Hermes',
    status: 'hermes', risk: 'info',
    blurb: 'Outils data Hermes',
    voice: ['analyse', 'stats', 'données'],
    hermesTool: 'analyze',
  },
  {
    id: 'storage', name: 'Stockage', icon: HardDrive, color: C.amber, cat: 'Hermes',
    status: 'hermes', risk: 'vps', vpsLimited: true,
    blurb: 'Volumes VPS — lecture / quota',
    voice: ['stockage', 'disque', 'volume'],
    hermesTool: 'vps_storage_limited',
  },

  // —— Nœuds NeuralMap (même ids) ——
  {
    id: 'cerveau', name: 'Cerveau', icon: BrainCog, color: C.violet, cat: 'Hermes',
    status: 'hermes', risk: 'info', blurb: 'LLM router',
    voice: ['cerveau', 'llm'], hermesTool: 'node_cerveau',
  },
  {
    id: 'tokens', name: 'Tokens', icon: Coins, color: C.amber, cat: 'Hermes',
    status: 'hermes', risk: 'info', blurb: 'Quotas IA',
    voice: ['tokens', 'quota'], hermesTool: 'node_tokens',
  },
  {
    id: 'objectifs', name: 'Objectifs', icon: Target, color: C.green, cat: 'Hermes',
    status: 'hermes', risk: 'info', blurb: 'Objectifs',
    voice: ['objectifs', 'buts'], hermesTool: 'node_missions',
  },
  {
    id: 'skills', name: 'Skills', icon: Sparkles, color: C.violet, cat: 'Hermes',
    status: 'hermes', risk: 'info', blurb: 'Compétences + outils à ajouter',
    voice: ['skills', 'compétences'], hermesTool: 'node_skills',
  },
  {
    id: 'connexions', name: 'Connexions', icon: Link2, color: C.blue, cat: 'Hermes',
    status: 'hermes', risk: 'info', blurb: 'Entités jumelées',
    voice: ['connexions', 'entités'], hermesTool: 'node_connexions',
  },
  {
    id: 'reseau', name: 'Topologie', icon: Network, color: C.cyan, cat: 'Hermes',
    status: 'hermes', risk: 'info', blurb: 'Mesh agents',
    voice: ['topologie', 'mesh'], hermesTool: 'node_reseau',
  },
  {
    id: 'cursor', name: 'Cursor', icon: Code, color: C.green, cat: 'Hermes',
    status: 'live', risk: 'info', pinned: true,
    blurb: 'IDE projet — simulation post Mission Control DEV (§15)',
    voice: ['cursor', 'éditeur cursor', 'ouvre cursor'],
  },
  {
    id: 'mission-control-dev', name: 'Mission Ctrl DEV', icon: Radar, color: C.rose, cat: 'Hermes',
    status: 'live', risk: 'info', pinned: true,
    blurb: 'Orchestration projet logiciel (ex. scénario Cursor)',
    // « alertes » a été retiré : c'est un mot de la maison, il ouvrait le
    // cockpit de développement. Les alertes relèvent de Mission Control HOME.
    // « mission control » nu reste accepté à l'oral tant que le cockpit maison
    // n'existe pas — le jour où il arrive, ce déclencheur devient ambigu et
    // doit disparaître au profit de « mission control dev ».
    voice: ['mission control dev', 'mission-control-dev', 'mission control'],
    hermesTool: 'node_mission_control_dev',
  },
  {
    id: 'crons', name: 'Crons', icon: Timer, color: C.slate, cat: 'Hermes',
    status: 'hermes', risk: 'admin', blurb: 'Planifié',
    voice: ['cron', 'planifié', 'schedule'], hermesTool: 'node_crons',
  },
  {
    id: 'outils', name: 'Outils', icon: Wrench, color: C.amber, cat: 'Hermes',
    status: 'hermes', risk: 'info', blurb: 'Tool Manager — Hermes ajoute des tools',
    voice: ['outils', 'tools', 'tool manager'], hermesTool: 'tool_manager',
  },

  // —— Maison / médias ——
  {
    id: 'home', name: 'Maison', icon: Home, color: C.green, cat: 'Maison',
    status: 'hermes', risk: 'home',
    blurb: 'Home Assistant via Hermes',
    voice: ['maison', 'domotique', 'lumières', 'home assistant'],
    hermesTool: 'home_assistant',
  },
  {
    id: 'music', name: 'Musique', icon: Music, color: C.green, cat: 'Médias',
    status: 'hermes', risk: 'media', pinned: true,
    blurb: 'Audio / Plex — Hermes',
    voice: ['musique', 'spotify', 'plex audio'],
    hermesTool: 'media_music',
  },
  {
    id: 'video', name: 'Vidéo', icon: Video, color: C.amber, cat: 'Médias',
    status: 'hermes', risk: 'media',
    blurb: 'VLC / stream — Hermes',
    voice: ['vidéo', 'video', 'film', 'plex'],
    hermesTool: 'media_video',
  },

  // —— Futures ——
  {
    id: 'mail', name: 'Courrier', icon: Mail, color: C.slate, cat: 'Outils',
    status: 'soon', risk: 'info', blurb: 'Bientôt',
  },
  {
    id: 'calendar', name: 'Agenda', icon: Calendar, color: C.slate, cat: 'Outils',
    status: 'soon', risk: 'info', blurb: 'Bientôt',
  },
];

export const APP_CATEGORIES: Array<'Tout' | AppCat> = ['Tout', 'Système', 'Hermes', 'Maison', 'Médias', 'Outils'];

/** Allowlist VPS — seules ces actions sont proposables (Hermes + Policy). */
export const VPS_ALLOWLIST = {
  shell: ['systemctl status jarvis-*', 'journalctl -u jarvis-* -n 50', 'df -h', 'docker ps', 'docker logs --tail 100'],
  docker: ['ps', 'logs', 'restart:allowlist', 'stats'],
  dockerServices: ['jarvis-core', 'jarvis-hud', 'ollama', 'homeassistant', 'plex'],
  paths: ['/opt/jarvis', '/storage/jarvis', '/etc/jarvis'],
  denied: ['rm -rf /', 'mkfs', 'shutdown', 'reboot', 'passwd', 'useradd', 'iptables -F', 'curl|bash'],
} as const;

export function getPinnedApps(): HudApp[] {
  return HUD_APPS.filter(a => a.pinned);
}

export function getAppById(id: string): HudApp | undefined {
  return HUD_APPS.find(a => a.id === id);
}

export function findAppByVoice(text: string): HudApp | undefined {
  const lower = text.toLowerCase();
  return HUD_APPS.find(a => a.voice?.some(k => lower.includes(k)));
}

export function statusLabel(s: AppStatus): string {
  if (s === 'live') return 'Prêt';
  if (s === 'hermes') return 'Hermes';
  return 'Bientôt';
}

export function riskLabel(r: AppRisk): string {
  if (r === 'vps') return 'VPS limité';
  if (r === 'admin') return 'Admin';
  if (r === 'home') return 'Domotique';
  if (r === 'media') return 'Média';
  return 'Info';
}

/** Manifeste pour Hermes (skill / mémoire) — sans icônes React. */
export function hermesAppsManifest(): Array<Record<string, unknown>> {
  return HUD_APPS.map(a => ({
    id: a.id,
    name: a.name,
    cat: a.cat,
    status: a.status,
    risk: a.risk,
    hermesTool: a.hermesTool ?? null,
    adminOnly: Boolean(a.adminOnly),
    vpsLimited: Boolean(a.vpsLimited),
    voice: a.voice ?? [],
    blurb: a.blurb ?? '',
  }));
}
