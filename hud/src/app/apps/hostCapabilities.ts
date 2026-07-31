/**
 * Manifeste apps / agents par host — Hermes choisit où exécuter.
 * Pas d’exécution ici : contrat pour Tool Manager + agents §13.
 */

export type HostId = 'vps' | 'nuc' | 'windows' | 'ha' | 'proliant' | 'tv';

export interface HostAppCapability {
  id: string;
  label: string;
  host: HostId;
  /** Binaire / URI / entity HA / store app id */
  launch: string;
  risk: 'info' | 'media' | 'home' | 'admin' | 'vps';
  notes?: string;
}

/** Catalogue initial — enrichi à l’enrollment Discovery */
export const HOST_CAPABILITIES: HostAppCapability[] = [
  // VPS — admin limité
  { id: 'vps-docker', label: 'Docker', host: 'vps', launch: 'vps_docker_limited', risk: 'vps' },
  { id: 'vps-shell', label: 'Shell allowlist', host: 'vps', launch: 'vps_shell_limited', risk: 'vps' },
  { id: 'vps-deploy', label: 'Déploiements', host: 'vps', launch: 'deploy_stack', risk: 'admin' },

  // NUC — kiosk + médias
  { id: 'nuc-plex', label: 'Plex', host: 'nuc', launch: 'plex', risk: 'media', notes: 'Lib ProLiant' },
  { id: 'nuc-vlc', label: 'VLC', host: 'nuc', launch: 'vlc', risk: 'media' },
  { id: 'nuc-code', label: 'VS Code', host: 'nuc', launch: 'code', risk: 'admin' },
  { id: 'nuc-hud', label: 'HUD kiosk', host: 'nuc', launch: 'jarvis-hud', risk: 'info' },

  // Windows agent
  { id: 'win-netflix', label: 'Netflix', host: 'windows', launch: 'shell:AppsFolder\\Netflix*', risk: 'media' },
  { id: 'win-prime', label: 'Prime Video', host: 'windows', launch: 'shell:AppsFolder\\Amazon*', risk: 'media' },
  { id: 'win-explorer', label: 'Explorateur', host: 'windows', launch: 'explorer', risk: 'info' },
  { id: 'win-edge', label: 'Edge', host: 'windows', launch: 'msedge', risk: 'info' },

  // HA / TV / maison
  { id: 'ha-tv', label: 'TV salon', host: 'ha', launch: 'media_player.tv_salon', risk: 'media' },
  { id: 'ha-lights', label: 'Lampes', host: 'ha', launch: 'light.*', risk: 'home', notes: 'plus tard enrollment' },
  { id: 'ha-washer', label: 'Lave-linge', host: 'ha', launch: 'switch.lave_linge', risk: 'home' },
  { id: 'ha-cams', label: 'Caméras', host: 'ha', launch: 'camera.*', risk: 'admin', notes: 'surveillance — consentement' },

  // ProLiant
  { id: 'proliant-media', label: 'Bibliothèque médias', host: 'proliant', launch: 'nfs://proliant/media', risk: 'media' },
  { id: 'proliant-ollama', label: 'Ollama distant', host: 'proliant', launch: 'http://proliant:11434', risk: 'info' },
];

export function capabilitiesForHost(host: HostId): HostAppCapability[] {
  return HOST_CAPABILITIES.filter(c => c.host === host);
}
