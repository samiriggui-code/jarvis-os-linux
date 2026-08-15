/**
 * Commandes quotidiennes Core → HUD (`hud_command`).
 *
 * Verrouiller, mute, veille, caméra, fermer un *espace* (app JARVIS) —
 * sans Hermes. Le Core a déjà décidé ; ici on applique l'état React.
 */

import { getCoreClient } from './coreClient';
import { captureAndSendPerception } from './perceptionCapture';
import { pauseWakeWord, resumeWakeWord, startAudioBus } from './audioBus';
import { forceReleaseCamera, ensureCamera } from './mediaDevices';

const LS_PREFS = 'jarvis.hud_preferences';

type HudCommandAction =
  | 'lock'
  | 'idle'
  | 'close_spaces'
  | 'close_space'
  | 'open_space'
  | 'toggle_space'
  | 'capture_perception'
  | 'open_external'
  | 'mute'
  | 'unmute'
  | 'camera_on'
  | 'camera_off'
  | 'start_enrollment';

export type HudCommandHandlers = {
  /**
   * soft = maison (LockScene, famille peut changer d’identité).
   * hard = distant / demande explicite (logout complet).
   * défaut = soft si household, hard si remote.
   */
  lockSession: (mode?: 'soft' | 'hard') => void;
  closeApp: (id: string) => void;
  closeAllSpaces: () => void;
  openSpace: (appId: string) => void;
  activeAppId: string | null;
  openAppIds: string[];
  /** Admin distant / voix → ouvre l’UI d’enrôlement sur ce HUD (kiosk). */
  startEnrollment?: (draft?: {
    username?: string;
    display_name?: string;
    role?: string;
  }) => void;
};

function patchKillSwitch(patch: { micMuted?: boolean; cameraOff?: boolean }) {
  try {
    const raw = localStorage.getItem(LS_PREFS);
    const prefs = raw ? JSON.parse(raw) : {};
    const kill = { ...(prefs.killSwitch || {}), ...patch };
    localStorage.setItem(
      LS_PREFS,
      JSON.stringify({ ...prefs, killSwitch: kill }),
    );
  } catch { /* */ }
}

export function applyHudCommand(
  data: Record<string, unknown>,
  handlers: HudCommandHandlers,
): boolean {
  if (data.type !== 'hud_command') return false;
  const action = String(data.action || '') as HudCommandAction;

  switch (action) {
    case 'lock':
      // Toujours soft — LockScene, pas le boot AuthScene.
      handlers.lockSession('soft');
      break;
    case 'idle':
      handlers.closeAllSpaces();
      forceReleaseCamera();
      break;
    case 'open_space': {
      const appId = String(data.app || data.app_id || '').trim();
      if (appId) handlers.openSpace(appId);
      break;
    }
    case 'capture_perception': {
      const requestId = String(data.request_id || '').trim();
      if (requestId) void captureAndSendPerception(requestId);
      break;
    }
    case 'open_external': {
      // Netflix / Disney / Google / etc. — onglet du navigateur kiosk / laptop.
      const url = String(data.url || '').trim();
      if (/^https?:\/\//i.test(url)) {
        try {
          window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err) {
          console.warn('[hud_command] open_external', err);
        }
      }
      break;
    }
    case 'close_spaces':
      if (data.close_all === true) {
        handlers.closeAllSpaces();
      } else if (handlers.activeAppId) {
        handlers.closeApp(handlers.activeAppId);
      } else if (handlers.openAppIds[0]) {
        handlers.closeApp(handlers.openAppIds[0]);
      }
      break;
    case 'close_space': {
      const appId = String(data.app || data.app_id || '').trim();
      if (appId) handlers.closeApp(appId);
      break;
    }
    case 'toggle_space': {
      // Le HUD est la source de vérité pour l'état ouvert/fermé (`openAppIds`) —
      // le Core ne le duplique pas, il délègue le choix open/close ici même,
      // avec les deux primitives déjà existantes (aucun 3e chemin de code).
      const appId = String(data.app || data.app_id || '').trim();
      if (!appId) break;
      if (handlers.openAppIds.includes(appId)) {
        handlers.closeApp(appId);
      } else {
        handlers.openSpace(appId);
      }
      break;
    }
    case 'mute':
      patchKillSwitch({ micMuted: true });
      pauseWakeWord();
      break;
    case 'unmute':
      patchKillSwitch({ micMuted: false });
      void startAudioBus();
      resumeWakeWord();
      break;
    case 'camera_on':
      patchKillSwitch({ cameraOff: false });
      void ensureCamera();
      break;
    case 'camera_off':
      patchKillSwitch({ cameraOff: true });
      forceReleaseCamera();
      break;
    case 'start_enrollment': {
      const draft = {
        username: String(data.username || '').trim() || undefined,
        display_name: String(data.display_name || '').trim() || undefined,
        role: String(data.role || '').trim() || undefined,
      };
      handlers.startEnrollment?.(draft);
      try {
        window.dispatchEvent(new CustomEvent('jarvis:start-enrollment', { detail: draft }));
      } catch { /* */ }
      break;
    }
    default:
      console.warn('[hud_command] action inconnue', action);
      return false;
  }

  console.debug('[hud_command]', action);
  return true;
}

/** Écoute unique — branchée depuis CoreBridge. */
export function bindHudCommands(handlers: HudCommandHandlers): () => void {
  const client = getCoreClient();
  return client.subscribe((data) => {
    applyHudCommand(data as Record<string, unknown>, handlers);
  });
}
