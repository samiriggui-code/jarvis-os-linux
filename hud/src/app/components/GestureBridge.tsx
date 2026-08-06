/**
 * Pont gestuel — monte le producteur MediaPipe et exécute les actions.
 *
 * Le HUD ne décide de rien : il envoie des confidences (`gestureLive`), et
 * le Core lui renvoie `HAND_POINT` (curseur) et `GESTURE_DETECTED`
 * (action déjà résolue contre le `gesture_profile` de l'utilisateur). Ce
 * composant n'est donc qu'une table d'aiguillage entre un nom d'action et
 * l'état du HUD.
 *
 * Monté seulement session déverrouillée : pendant l'auth faciale la caméra
 * sert déjà, et faire tourner la détection de mains en plus ne coûterait que
 * du CPU pour une interface où il n'y a rien à cliquer.
 */
import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { getCoreClient } from '../bridge/coreClient';
import { gesturesPolicyEnabled } from '../../ui/core/devicePolicy';
import { startGestureBridge, stopGestureBridge } from '../bridge/gestureLive';
import { clickAtCursor, disposeCursor, moveCursor } from '../bridge/gestureCursor';

const RIGHT_PANELS = ['console', 'search'] as const;

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
  } = useApp();

  const latest = useRef({ appGridOpen, rightPanel, openApps, activeAppId });
  latest.current = { appGridOpen, rightPanel, openApps, activeAppId };

  useEffect(() => {
    if (!sessionUnlocked) return;
    if (!gesturesPolicyEnabled()) return;

    let alive = true;

    startGestureBridge().then(ok => {
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
          const ids = now.openApps.map(a => a.id);
          if (ids.length < 2) break;
          const current = now.activeAppId ?? ids[0];
          focusApp(cycle(ids, current, action === 'stack_next' ? 1 : -1));
          break;
        }
        default:
          console.debug('[gesture] action sans effet :', action);
      }
    };

    const off = getCoreClient().subscribe(data => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUnlocked]);

  return null;
}
