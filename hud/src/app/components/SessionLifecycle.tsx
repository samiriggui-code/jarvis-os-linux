/**
 * SessionLifecycle — idle + fermeture selon devicePolicy.sessionSecurity
 *
 * household (kiosk / tablette murale / desktop maison) :
 *   idle → soft lock · fermeture onglet → rien (session soft-locked au refresh)
 *
 * remote (téléphone / laptop / ?remote=1) :
 *   idle → hard logout · fermeture / pagehide → hard logout
 */
import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { getDevicePolicy } from '../../ui/core/devicePolicy';
import { getCoreClient } from '../bridge/coreClient';

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'pointerdown',
  'pointermove',
  'keydown',
  'touchstart',
  'wheel',
  'mousemove',
];

export function SessionLifecycle() {
  const { sessionUnlocked, lockSession } = useApp();
  const lastActiveRef = useRef(Date.now());
  const lockRef = useRef(lockSession);
  lockRef.current = lockSession;

  // Idle timer
  useEffect(() => {
    if (!sessionUnlocked) return;
    const policy = getDevicePolicy();
    const minutes = policy.idleLockMinutes;
    if (!minutes || minutes <= 0) return;

    const mark = () => { lastActiveRef.current = Date.now(); };
    lastActiveRef.current = Date.now();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, mark, { passive: true });
    }

    const id = window.setInterval(() => {
      const idleMs = Date.now() - lastActiveRef.current;
      if (idleMs < minutes * 60_000) return;
      const sec = getDevicePolicy().sessionSecurity;
      console.debug(`[session] idle ${minutes}mn → soft lock`);
      try {
        getCoreClient().send({ type: 'auth', action: 'sequence_start', sequence: 'lock_auto' });
      } catch { /* */ }
      // Soft partout : LockScene + caméra. Hard = fermeture d’onglet distant seulement.
      lockRef.current('soft');
    }, 15_000);

    return () => {
      window.clearInterval(id);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, mark);
      }
    };
  }, [sessionUnlocked]);

  // Fermeture onglet / navigateur — distant uniquement
  useEffect(() => {
    if (!sessionUnlocked) return;
    if (getDevicePolicy().sessionSecurity !== 'remote') return;

    const hardLogout = () => {
      try { lockRef.current('hard'); } catch { /* */ }
    };

    // pagehide : plus fiable que beforeunload sur mobile / bfcache
    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return; // bfcache — pas une vraie fermeture
      hardLogout();
    };
    const onVisibility = () => {
      // Mobile : onglet en arrière-plan longtemps — on ne logout pas ici
      // (idle s’en charge). Fermeture réelle = pagehide.
    };

    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', hardLogout);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', hardLogout);
    };
  }, [sessionUnlocked]);

  return null;
}
