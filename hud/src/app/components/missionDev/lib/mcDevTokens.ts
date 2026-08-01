/** Tokens / types partagés Mission Control DEV */
export const MC_ACCENT = '#f43f5e';
export const MC_CYAN = '#00f5ff';

export const mcOrb = { fontFamily: 'Orbitron, sans-serif' } as const;
export const mcMono = { fontFamily: 'Share Tech Mono, monospace' } as const;
export const mcRaj = { fontFamily: 'Rajdhani, sans-serif' } as const;

export type MissionDevLogTone = 'dim' | 'live' | 'ok' | 'sys';
export type MissionDevLogLine = { id: string; text: string; tone: MissionDevLogTone };
