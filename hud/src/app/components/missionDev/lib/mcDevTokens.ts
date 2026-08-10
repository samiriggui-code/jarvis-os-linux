/** Tokens / types partagés Mission Control DEV */
export const MC_ACCENT = '#f43f5e';
export const MC_CYAN = '#0A84FF';

export const mcOrb = { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' } as const;
export const mcMono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } as const;
export const mcRaj = { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' } as const;

export type MissionDevLogTone = 'dim' | 'live' | 'ok' | 'sys';
export type MissionDevLogLine = { id: string; text: string; tone: MissionDevLogTone };
