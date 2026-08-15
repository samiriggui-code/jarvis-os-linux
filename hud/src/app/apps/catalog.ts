/**
 * Catalogue du lanceur HUD — dock, grille, voix.
 *
 * ⚠ Une entrée n'est PAS une application : c'est une **intention**. Qui l'exécute
 * derrière — le Core, Hermes, un agent d'appareil — ne remonte jamais à
 * l'utilisateur, et peut changer sans que la tuile bouge.
 *
 * status — comment le résultat atteint l'écran :
 *   live    = une page produit React existe déjà (aucune surface composée)
 *   surface = le résultat s'affiche dans une surface (préfabriquée ou composée)
 *   soon    = pas encore
 *
 * `status: 'hermes'` a disparu : il faisait croire que la tuile connaissait son
 * exécutant. Elle ne le connaît pas, et c'est voulu.
 *
 * `intent` est la clé de `core/jarvis_core/capabilities.py` — **source de vérité**
 * du couple intention → exécutant. Ce fichier ne décide de rien : il déclare ce
 * que l'utilisateur peut demander. L'ancien champ `hermesTool` nommait des outils
 * (`home_assistant`, `node_cerveau`, `agent_reach`) dont AUCUN n'existait chez
 * Hermes ; il est remplacé.
 *
 * `owner` n'est là que pour le diagnostic et les libellés — jamais pour router.
 *
 * risk → Policy Engine (info < media < home < admin < vps)
 */
import type { LucideIcon } from 'lucide-react';
import {
  Terminal, Settings, Cpu, Shield, Wifi, Brain, Boxes, Camera,
  BarChart3, Code, HardDrive, Globe, Music, Video, Home, Mail,
  FolderOpen, Box, Calendar, Sparkles, Radar, Link2,
  BrainCog, Coins, Target, Network, Timer, Wrench,
  Lock, Moon, XCircle, MicOff, Mic, CameraOff, UserPlus,
} from 'lucide-react';

export type AppStatus = 'live' | 'surface' | 'soon';
export type AppCat = 'Système' | 'Agent' | 'Maison' | 'Médias' | 'Outils';
export type AppRisk = 'info' | 'media' | 'home' | 'admin' | 'vps';
/** Diagnostic seulement. Le routage se fait côté Core, par `intent`. */
export type AppOwner = 'core' | 'hermes' | 'device';

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
  /** Clé dans `core/jarvis_core/capabilities.py`. Absente = tuile purement locale. */
  intent?: string;
  /** Qui exécute, pour le diagnostic. Jamais montré tel quel à l'utilisateur. */
  owner?: AppOwner;
  /** Réservé ADMIN (dashboard_access) */
  adminOnly?: boolean;
  /** Accès VPS bridé — allowlist + Policy, pas shell root */
  vpsLimited?: boolean;
}

const C = {
  cyan: '#0A84FF',
  blue: '#0ea5e9',
  violet: '#0A84FF',
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
    status: 'live', risk: 'info', pinned: true, owner: 'core',
    blurb: 'Expérience HUD (voix, vision, foyer)',
    voice: ['paramètres', 'settings', 'réglages'],
    intent: 'core.preferences',
  },
  {
    id: 'jarvis', name: 'Noyau', icon: Brain, color: C.violet, cat: 'Système',
    status: 'live', risk: 'info', pinned: true, owner: 'core',
    blurb: 'Carte du système (NeuralMap)',
    voice: ['noyau', 'carte hermes', 'neural'],
    intent: 'core.neural_map',
  },
  {
    id: 'hub', name: 'Dashboard', icon: Boxes, color: C.cyan, cat: 'Système',
    status: 'live', risk: 'admin', pinned: true, adminOnly: true, owner: 'core',
    blurb: 'Admin Core / VPS — ADMIN seul',
    voice: ['dashboard', 'admin', 'cockpit'],
    intent: 'core.dashboard',
  },
  {
    id: 'monitor', name: 'Moniteur', icon: Cpu, color: C.green, cat: 'Système',
    status: 'live', risk: 'info', pinned: true, owner: 'core',
    blurb: 'Charge locale HUD',
    voice: ['moniteur', 'cpu', 'ressources'],
    intent: 'core.monitor',
  },
  {
    id: 'vision', name: 'Holomat', icon: Camera, color: C.violet, cat: 'Système',
    status: 'live', risk: 'info', pinned: true, owner: 'core',
    blurb: 'Caméra / gestes / calib',
    voice: [
      'holomat', 'vision', 'gestes',
      'caméra', 'camera', 'webcam', 'visuel', 'visuels',
      'montre la caméra', 'montre la camera',
      'ce que tu vois', 'flux caméra', 'flux camera',
      'caméra lg', 'camera lg', 'thinq',
      'donne-moi un visuel', 'donne moi un visuel',
    ],
    intent: 'core.holomat',
  },
  // Policy et auth sont des organes du CORE. Cette tuile était marquée « hermes » :
  // demander à l'agent de rapporter ce qu'il a le droit de faire n'a pas de sens.
  {
    id: 'security', name: 'Sécurité', icon: Shield, color: C.rose, cat: 'Système',
    status: 'surface', risk: 'admin', owner: 'core',
    blurb: 'Policy / auth',
    voice: ['sécurité', 'policy', 'auth'],
    intent: 'core.security',
  },
  {
    id: 'network', name: 'Réseau', icon: Wifi, color: C.blue, cat: 'Système',
    status: 'soon', risk: 'info', owner: 'core',
    blurb: 'LAN / agents — BindingResolver pas encore',
    voice: ['réseau', 'wifi', 'lan'],
    intent: 'system.network',
  },

  // —— Agent (délégué) ——
  {
    id: 'terminal', name: 'Terminal', icon: Terminal, color: C.cyan, cat: 'Agent',
    status: 'surface', risk: 'vps', pinned: true, vpsLimited: true, owner: 'hermes',
    blurb: 'Shell allowlist — pas root libre',
    voice: ['terminal', 'shell', 'console ssh'],
    intent: 'system.shell',
  },
  {
    id: 'files', name: 'Fichiers', icon: FolderOpen, color: C.amber, cat: 'Agent',
    status: 'surface', risk: 'admin', pinned: true, owner: 'hermes',
    blurb: 'Fichiers — chemins autorisés',
    voice: ['fichiers', 'dossier', 'explorer'],
    intent: 'files.browse',
  },
  {
    id: 'browser', name: 'Navigateur', icon: Globe, color: C.blue, cat: 'Agent',
    status: 'surface', risk: 'info', pinned: true, owner: 'hermes',
    blurb: 'Navigation pilotée',
    voice: ['navigateur', 'browser', 'holoweb'],
    intent: 'web.browse',
  },
  {
    id: 'reach', name: 'Internet', icon: Globe, color: C.cyan, cat: 'Agent',
    status: 'surface', risk: 'info', pinned: true, owner: 'hermes',
    blurb: 'Recherche et extraction web',
    voice: [
      'internet', 'agent-reach', 'agent reach', 'recherche web',
      'cherche', 'trouve', 'propose', 'recherche',
      'nouvelles', 'actualité', 'actualites', 'actualités',
      'cherche sur internet', 'cherche sur le web', 'cherche sur youtube',
      'cherche sur github', 'github', 'reddit', 'rss', 'openclaw',
      // "youtube" nu retiré (2026-08-15) : appartient déjà à media.streaming
      // (Core, capabilities.py) — le dupliquer ici induisait une incohérence
      // Core↔HUD sans changer le routage réel (streaming gagne déjà la
      // désambiguïsation en cas d'égalité, cf. `_disambiguate_intent`).
    ],
    intent: 'web.search',
  },
  // Aucun toolset docker/stockage chez Hermes : ces deux-là passeraient par
  // `terminal`. Déclarées sans exécutant — l'ouverture le dira, plutôt que d'échouer
  // sans raison. Cf. `capabilities.py`.
  {
    id: 'docker', name: 'Docker', icon: Box, color: C.blue, cat: 'Agent',
    status: 'soon', risk: 'vps', vpsLimited: true, owner: 'hermes',
    blurb: 'Conteneurs — pas de toolset Hermes encore',
    voice: ['docker', 'conteneur', 'containers'],
    intent: 'vps.docker',
  },
  {
    id: 'code', name: 'VS Code', icon: Code, color: C.green, cat: 'Agent',
    status: 'soon', risk: 'vps', vpsLimited: true, owner: 'device',
    blurb: 'Éditeur distant — besoin d’un agent PC (pas encore). Utilisez Cursor HUD.',
    voice: ['code', 'vscode', 'éditeur', 'editeur'],
    intent: 'vps.code',
  },
  {
    id: 'analyze', name: 'Analyse', icon: BarChart3, color: C.cyan, cat: 'Agent',
    status: 'surface', risk: 'admin', owner: 'hermes',
    blurb: 'Exécution de code — analyse de données',
    // "analyse" seul retiré (2026-08-15, P.3) : cf. capabilities.py, même motif.
    voice: ['stats', 'données'],
    intent: 'data.analyze',
  },
  {
    id: 'storage', name: 'Stockage', icon: HardDrive, color: C.amber, cat: 'Agent',
    status: 'soon', risk: 'vps', vpsLimited: true, owner: 'hermes',
    blurb: 'Volumes — pas de toolset encore',
    voice: ['stockage', 'disque', 'volume'],
    intent: 'vps.storage',
  },

  // —— Nœuds NeuralMap (même ids) ——
  //
  // Le routeur de modèles et les quotas sont dans le Core (`providers.py`, route
  // `usage`). Ces deux tuiles étaient marquées « hermes » — mauvais propriétaire.
  {
    id: 'cerveau', name: 'Cerveau', icon: BrainCog, color: C.violet, cat: 'Système',
    status: 'surface', risk: 'info', blurb: 'Routeur de modèles',
    voice: ['cerveau', 'llm'], intent: 'core.providers', owner: 'core',
  },
  {
    id: 'tokens', name: 'Tokens', icon: Coins, color: C.amber, cat: 'Système',
    status: 'surface', risk: 'info', blurb: 'Quotas IA',
    voice: ['tokens', 'quota'], intent: 'core.usage', owner: 'core',
  },
  {
    id: 'objectifs', name: 'Objectifs', icon: Target, color: C.green, cat: 'Agent',
    status: 'soon', risk: 'info', blurb: 'Magasin d’objectifs absent',
    voice: ['objectifs', 'buts', 'objectif', 'goal', 'goals'], intent: 'core.missions', owner: 'core',
  },
  {
    id: 'skills', name: 'Skills', icon: Sparkles, color: C.violet, cat: 'Agent',
    status: 'surface', risk: 'info', blurb: 'Compétences de l’agent',
    voice: ['skills', 'compétences'], intent: 'agent.skills', owner: 'hermes',
  },
  {
    id: 'connexions', name: 'Connexions', icon: Link2, color: C.blue, cat: 'Agent',
    status: 'soon', risk: 'info', blurb: 'Device Manager absent',
    voice: ['connexions', 'entités', 'appareils connectés'], intent: 'devices.list', owner: 'device',
  },
  {
    id: 'reseau', name: 'Topologie', icon: Network, color: C.cyan, cat: 'Agent',
    status: 'soon', risk: 'info', blurb: 'Device Manager absent',
    voice: ['topologie', 'mesh', 'réseau jarvis'], intent: 'devices.topology', owner: 'device',
  },
  {
    id: 'cursor', name: 'Cursor', icon: Code, color: C.green, cat: 'Agent',
    status: 'live', risk: 'info', pinned: true, owner: 'core',
    blurb: 'IDE projet — simulation post Mission Control DEV (§15)',
    voice: ['cursor', 'éditeur cursor', 'ouvre cursor'],
    intent: 'core.cursor',
  },
  {
    id: 'mission-control-dev', name: 'Mission Ctrl DEV', icon: Radar, color: C.rose, cat: 'Agent',
    status: 'live', risk: 'info', pinned: true, owner: 'core',
    blurb: 'Orchestration projet logiciel (ex. scénario Cursor)',
    // Cockpit maison = triggers « mission control home » → home.control.
    // Ici uniquement DEV explicite (évite de voler Home).
    voice: ['mission control dev', 'mission-control-dev', 'mission ctrl dev'],
    intent: 'core.mission_dev',
  },
  {
    id: 'crons', name: 'Crons', icon: Timer, color: C.slate, cat: 'Agent',
    status: 'surface', risk: 'admin', blurb: 'Planifié',
    voice: ['cron', 'planifié', 'schedule'], intent: 'agent.cron', owner: 'hermes',
  },
  {
    id: 'outils', name: 'Outils', icon: Wrench, color: C.amber, cat: 'Agent',
    status: 'surface', risk: 'admin', blurb: 'Compétences — création et édition',
    voice: ['outils', 'tools', 'tool manager'], intent: 'agent.tools', owner: 'hermes',
  },

  // —— Session HUD (voix → Core `hud_*`, pas de tuile dock) ——
  {
    id: 'hud-lock', name: 'Verrouiller', icon: Lock, color: C.rose, cat: 'Système',
    status: 'live', risk: 'info', owner: 'core',
    blurb: 'Verrouille la session HUD',
    // Pas de « verrouillage » / « veille » nus : écho TTS → soft-lock en boucle.
    voice: [
      'verrouille la session', 'verrouille-toi', 'verrouille toi',
      'lock session', 'verrouille le hud',
    ],
    intent: 'hud.lock',
  },
  {
    id: 'hud-idle', name: 'Veille', icon: Moon, color: C.slate, cat: 'Système',
    status: 'live', risk: 'info', owner: 'core',
    blurb: 'Mode veille HUD',
    voice: [
      'mode veille', 'mets-toi en veille', 'met toi en veille',
      'repos', 'standby',
    ],
    intent: 'hud.idle',
  },
  {
    id: 'hud-close', name: 'Fermer espace', icon: XCircle, color: C.amber, cat: 'Système',
    status: 'live', risk: 'info', owner: 'core',
    blurb: 'Ferme l’espace actif',
    voice: [
      'ferme l\'espace', 'ferme les espaces', 'ferme la fenêtre',
      'ferme les fenêtres', 'ferme tout', 'ferme l espace',
      'close space', 'ferme l\'application',
    ],
    intent: 'hud.close_space',
  },
  {
    id: 'hud-mute', name: 'Mute', icon: MicOff, color: C.slate, cat: 'Système',
    status: 'live', risk: 'info', owner: 'core',
    blurb: 'Coupe micro + wake',
    voice: [
      'coupe le son', 'coupe le micro', 'mute', 'mets en sourdine',
      'silence', 'ne m\'écoute plus',
    ],
    intent: 'hud.mute',
  },
  {
    id: 'hud-unmute', name: 'Unmute', icon: Mic, color: C.green, cat: 'Système',
    status: 'live', risk: 'info', owner: 'core',
    blurb: 'Réactive micro + wake',
    voice: [
      'remets le son', 'allume le micro', 'unmute', 'réactive le micro',
      'écoute-moi', 'remets le micro',
    ],
    intent: 'hud.unmute',
  },
  {
    id: 'hud-camera-on', name: 'Caméra on', icon: Camera, color: C.violet, cat: 'Système',
    status: 'live', risk: 'info', owner: 'core',
    blurb: 'Réveille la caméra navigateur',
    voice: [
      'allume la caméra', 'allume la camera', 'ouvre la caméra',
      'active la caméra', 'réveille la caméra',
    ],
    intent: 'hud.camera_on',
  },
  {
    id: 'hud-camera-off', name: 'Caméra off', icon: CameraOff, color: C.slate, cat: 'Système',
    status: 'live', risk: 'info', owner: 'core',
    blurb: 'Coupe la caméra navigateur',
    voice: [
      'coupe la caméra', 'coupe la camera', 'éteins la caméra',
      'ferme la caméra', 'arrête la caméra',
    ],
    intent: 'hud.camera_off',
  },
  {
    id: 'hud-enroll', name: 'Enrôlement', icon: UserPlus, color: C.cyan, cat: 'Système',
    status: 'live', risk: 'admin', adminOnly: true, owner: 'core',
    blurb: 'Ouvre l’enrôlement sur le kiosk maison',
    voice: [
      'enrôle', 'enrole', 'enrôler', 'enroler', 'inscris', 'inscrit',
      'nouvel utilisateur', 'nouveau profil', 'ajoute un profil',
      'enrollment', 'enrôlement', 'enrolement', 'family enroll',
      'inscris ma', 'inscris mon', 'ajoute ma', 'ajoute mon',
    ],
    intent: 'hud.enroll',
  },

  // —— Maison / médias ——
  {
    id: 'home', name: 'Maison', icon: Home, color: C.green, cat: 'Maison',
    status: 'surface', risk: 'home', owner: 'core',
    blurb: 'Lumières, capteurs, ouvrants',
    // "maison" / "domotique" / "home" nus retirés (2026-08-15, chantier
    // Orchestration conversationnelle, P.5) : mots de sujet sans verbe
    // d'action, cf. core/jarvis_core/capabilities.py (même trigger, même
    // motif) — sinon une question d'observation ouvrait une action HOME.
    voice: [
      'lumière', 'lumières', 'lampe', 'home assistant',
      'ouvre home', 'affiche home', 'affiche-moi home',
      'mission control home', 'mission contrôle home', 'mission controle home',
      'ouvre la maison', 'affiche la maison',
      'allume', 'éteint', 'eteint', 'allume le salon', 'éteint le salon',
    ],
    intent: 'home.control',
  },
  {
    id: 'salon-camera', name: 'Caméra salon', icon: Camera, color: C.green, cat: 'Maison',
    status: 'surface', risk: 'info', owner: 'core',
    blurb: 'Flux live LG AN-VC500 (Pi salon)',
    voice: [
      'caméra du salon', 'caméra salon', 'affiche la caméra', 'affiche la caméra du salon',
      'montre la caméra', 'montre-moi le salon', 'regarde ce qui se passe au salon',
      'regarde le salon',
      // "prends une image/photo", "snapshot du salon" : PAS ici, volontairement.
      // Ce sont les déclencheurs de home.camera_snapshot (capabilities.py), pas
      // de home.camera_view (seule intention que cette tuile peut envoyer). Les
      // garder ici forçait le mauvais intent en mode JARVIS BASE dégradé (Core
      // injoignable) — trouvé par le checker Graphify (architecture/build.py).
    ],
    intent: 'home.camera_view',
  },
  {
    id: 'music', name: 'Musique', icon: Music, color: C.green, cat: 'Médias',
    status: 'surface', risk: 'media', pinned: true, owner: 'hermes',
    blurb: 'Audio',
    voice: ['musique', 'spotify', 'plex audio'],
    intent: 'media.music',
  },
  {
    id: 'video', name: 'Vidéo', icon: Video, color: C.amber, cat: 'Médias',
    status: 'surface', risk: 'media', owner: 'core',
    blurb: 'Plex — sans LLM',
    // "regarde" nu retiré (2026-08-15) : même défaut que "maison" (P.5) —
    // mot trop générique, matchait aussi une question d'observation
    // ("regarde si tout va bien à la maison") comme une commande média WRITE.
    voice: ['vidéo', 'video', 'film', 'plex', 'série', 'serie', 'épisode', 'episode', 'mets', 'lance', 'play'],
    intent: 'media.video',
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

export const APP_CATEGORIES: Array<'Tout' | AppCat> = ['Tout', 'Système', 'Agent', 'Maison', 'Médias', 'Outils'];

/**
 * Allowlist VPS — seules ces actions sont proposables (Hermes propose, Policy tranche).
 *
 * ⚠ `dockerServices` nommait `homeassistant` et `plex`. Aucun des deux ne tourne sur le
 * VPS : Home Assistant va sur le **Pi du salon**, Plex sur le **ProLiant sous Windows**
 * (donc ni Docker ni SSH). Une allowlist « VPS » qui autorise des services d'autres
 * machines n'autorise rien de réel — et donne l'illusion inverse.
 *
 * Une allowlist par hôte demanderait un Device Manager, qui n'existe pas. En attendant,
 * celle-ci ne parle que du VPS, et le dit.
 */
export const VPS_ALLOWLIST = {
  shell: ['systemctl status jarvis-*', 'journalctl -u jarvis-* -n 50', 'df -h', 'docker ps', 'docker logs --tail 100'],
  docker: ['ps', 'logs', 'restart:allowlist', 'stats'],
  /** Services réellement hébergés sur le VPS. Pas d'autre hôte ici. */
  dockerServices: ['ollama', 'voicebox', 'caddy'],
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
  if (s === 'surface') return 'Surface';
  return 'Bientôt';
}

export function riskLabel(r: AppRisk): string {
  if (r === 'vps') return 'VPS limité';
  if (r === 'admin') return 'Admin';
  if (r === 'home') return 'Domotique';
  if (r === 'media') return 'Média';
  return 'Info';
}

// `hermesAppsManifest()` a été retiré. Il sérialisait ce catalogue « pour Hermes »
// et **personne ne l'appelait** — le manifeste n'a jamais quitté le HUD. C'était
// exactement le mode de panne du dépôt : déclaré, jamais appelé, rien ne le signale.
//
// Il n'a plus lieu d'être : la correspondance intention → exécutant appartient
// désormais au Core (`core/jarvis_core/capabilities.py`), qui est le seul à pouvoir
// la faire respecter. Le HUD déclare ce qu'on peut demander ; il n'annonce pas à
// l'agent ce qu'il a le droit de faire.
