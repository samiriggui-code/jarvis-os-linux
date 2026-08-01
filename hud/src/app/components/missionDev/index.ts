/**
 * Module Mission Control DEV (§15) — cockpit d'orchestration logicielle.
 *
 * Le cockpit de la maison est Mission Control HOME : un module distinct, qui
 * ne partage avec celui-ci que le Core. Rien de domotique, de sécurité ou de
 * caméra n'a sa place ici, et réciproquement.
 *
 * missionDev/
 *   MissionControlDev.tsx      → orchestrateur (Core WS)
 *   sections/                  → header, progress, stream, recap
 *   ui/                        → primitives
 *   hooks/useMissionDevRuntime → écoute mission_dev_progress
 *   cursor/CursorSurface
 *   lib/
 */
export { MissionControlDev } from './MissionControlDev';
export { CursorSurface } from './cursor/CursorSurface';
export { useMissionDevRuntime } from './hooks/useMissionDevRuntime';
