/**
 * Module Mission Control (§15)
 *
 * mission/
 *   MissionControl.tsx     → orchestrateur (Core WS)
 *   sections/              → header, progress, stream, recap
 *   ui/                    → primitives
 *   hooks/useMissionRuntime → écoute mission_progress
 *   cursor/CursorSurface
 *   lib/
 */
export { MissionControl } from './MissionControl';
export { CursorSurface } from './cursor/CursorSurface';
export { useMissionRuntime } from './hooks/useMissionRuntime';
