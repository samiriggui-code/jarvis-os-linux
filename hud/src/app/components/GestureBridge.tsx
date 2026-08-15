/**
 * Pont gestuel — MediaPipe + actions HUD.
 *
 * Caméra : uniquement si panneau gestes ouvert (ou policy sans sleep).
 * Ne plus allumer la webcam au unlock — auth = voix, cameraSleepByDefault.
 */
import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { getCoreClient } from '../bridge/coreClient';
import { gesturesPolicyEnabled, getDevicePolicy } from '../../ui/core/devicePolicy';
import { startGestureBridge, stopGestureBridge } from '../bridge/gestureLive';
import { clickAtCursor, disposeCursor, moveCursor } from '../bridge/gestureCursor';
import { pauseWakeWord } from '../bridge/audioBus';

const RIGHT_PANELS = ['console', 'search'] as const;
const LS_PREFS = 'jarvis.hud_preferences';

function patchMicMuted(muted: boolean) {
  try {
    const raw = localStorage.getItem(LS_PREFS);
    const prefs = raw ? JSON.parse(raw) : {};
    const kill = { ...(prefs.killSwitch || {}), micMuted: muted };
    localStorage.setItem(LS_PREFS, JSON.stringify({ ...prefs, killSwitch: kill }));
  } catch { /* */ }
}

export function GestureBridge() {
  const {
    sessionUnlocked,
    appGridOpen,
    setAppGridOpen,
    rightPanel,
    setRightPanel,
    openApps,
    activeAppId,
    focusApp,
    addNotification,
    gestureOpen,
  } = useApp();

  const latest = useRef({ appGridOpen, rightPanel, openApps, activeAppId });
  latest.current = { appGridOpen, rightPanel, openApps, activeAppId };

  useEffect(() => {
    if (!sessionUnlocked) return;
    if (!gesturesPolicyEnabled()) return;
    if (getDevicePolicy().cameraSleepByDefault && !gestureOpen) return;

    let alive = true;

    startGestureBridge().then((ok) => {
      if (!alive || ok) return;
      addNotification({
        type: 'warning',
        title: 'Pilotage gestuel indisponible',
        message: 'Caméra refusée ou assets MediaPipe absents (npm run mediapipe).',
      });
    });

    const cycle = <T,>(list: readonly T[], current: T, step: number): T => {
      const i = list.indexOf(current);
      const next = (i + step + list.length) % list.length;
      return list[next];
    };

    const runAction = (action: string) => {
      const now = latest.current;
      switch (action) {
        case 'select_or_close':
          if (!clickAtCursor() && now.appGridOpen) setAppGridOpen(false);
          break;
        case 'open_launcher':
          setAppGridOpen(!now.appGridOpen);
          break;
        case 'next_panel':
          setRightPanel(cycle(RIGHT_PANELS, now.rightPanel, 1));
          break;
        case 'prev_panel':
          setRightPanel(cycle(RIGHT_PANELS, now.rightPanel, -1));
          break;
        case 'stack_next':
        case 'stack_prev': {
          const ids = now.openApps.map((a) => a.id);
          if (ids.length < 2) break;
          const current = now.activeAppId ?? ids[0];
          focusApp(cycle(ids, current, action === 'stack_next' ? 1 : -1));
          break;
        }
        case 'mute':
          patchMicMuted(true);
          pauseWakeWord();
          addNotification({ type: 'info', title: 'Gestes', message: 'Micro coupé.' });
          break;
        case 'activate_voice':
          window.dispatchEvent(new CustomEvent('jarvis:activate-voice'));
          break;
        case 'ack_done':
          addNotification({ type: 'success', title: 'Gestes', message: 'OK.' });
          break;
        default:
          console.debug('[gesture] action sans effet :', action);
      }
    };

    const off = getCoreClient().subscribe((data) => {
      if (data.type === 'HAND_POINT') {
        const x = Number(data.x);
        const y = Number(data.y);
        if (Number.isFinite(x) && Number.isFinite(y)) moveCursor(x, y);
        return;
      }
      if (data.type === 'GESTURE_DETECTED') {
        const action = String(data.action || '');
        if (action) runAction(action);
      }
    });

    return () => {
      alive = false;
      off();
      stopGestureBridge();
      disposeCursor();
    };
  }, [
    sessionUnlocked,
    gestureOpen,
    addNotification,
    setAppGridOpen,
    setRightPanel,
    focusApp,
  ]);

  return null;
}
