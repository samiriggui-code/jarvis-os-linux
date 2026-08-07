/**
 * HudAuthGate — routeur des 3 modes produit.
 *
 * INSTALL  → welcome → wizard premier profil
 * IDENTIFY → auth / lock / enroll membre (admin)
 * JARVIS   → sessionUnlocked → ce composant rend null
 */
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FirstSetupScene } from './FirstSetupScene';
import { LockScene } from './LockScene';
import { AuthScene } from './AuthScene';
import { InstallWelcome } from './InstallWelcome';
import { getCoreClient } from '../../bridge/coreClient';
import { DEV_BUILD } from '../../bridge/devAuthBypass';
import { resolveProductMode, type InstallRoute, type IdentifyRoute } from '../../auth/productMode';

type GateRoute =
  | 'waiting'
  | 'offline'
  | { mode: 'install'; step: InstallRoute }
  | { mode: 'identify'; step: IdentifyRoute };

function sameRoute(a: GateRoute, b: GateRoute): boolean {
  if (a === b) return true;
  if (typeof a === 'string' || typeof b === 'string') return false;
  return a.mode === b.mode && a.step === b.step;
}

export function HudAuthGate() {
  const { sessionUnlocked, sessionWasUnlocked, coreAuth, setCoreAuth, addNotification } = useApp();
  const [route, setRoute] = useState<GateRoute>('waiting');
  const [waitMs, setWaitMs] = useState(0);
  const [enrollPreset, setEnrollPreset] = useState<string | undefined>();
  const routeRef = useRef(route);
  routeRef.current = route;

  const go = (next: GateRoute) => {
    if (!sameRoute(routeRef.current, next)) setRoute(next);
  };

  // Admin distant → enroll membre (IDENTIFY), jamais confondu avec INSTALL.
  useEffect(() => {
    const onEnroll = (ev: Event) => {
      const detail = (ev as CustomEvent<{ display_name?: string; username?: string }>).detail;
      const preset = (detail?.display_name || detail?.username || '').trim() || undefined;
      setEnrollPreset(preset);
      go({ mode: 'identify', step: 'enroll_member' });
    };
    window.addEventListener('jarvis:start-enrollment', onEnroll as EventListener);
    return () => window.removeEventListener('jarvis:start-enrollment', onEnroll as EventListener);
  }, []);

  useEffect(() => {
    if (sessionUnlocked) return;

    const cur = routeRef.current;
    // Ne pas écraser un wizard / enroll en cours.
    if (typeof cur === 'object' && cur.mode === 'identify' && cur.step === 'enroll_member') return;
    if (typeof cur === 'object' && cur.mode === 'install' && cur.step === 'wizard') return;

    if (!coreAuth.ready) {
      go('waiting');
      const t0 = Date.now();
      const id = setInterval(() => {
        const elapsed = Date.now() - t0;
        setWaitMs(elapsed);
        if (getCoreClient().connected) {
          getCoreClient().sendAuth('status');
        }
        if (elapsed > 6000 && !coreAuth.ready) {
          go('offline');
          setCoreAuth({ ready: false, online: false });
        }
      }, 800);
      return () => clearInterval(id);
    }

    // Core OK mais auth_status pas encore mergé — rester en waiting, pas INSTALL.
    if (coreAuth.firstRun === null) {
      go('waiting');
      if (getCoreClient().connected) getCoreClient().sendAuth('status');
      return;
    }

    const product = resolveProductMode({
      sessionUnlocked: false,
      firstRun: coreAuth.firstRun,
      userCount: coreAuth.userCount,
    });

    if (product === 'install') {
      go({ mode: 'install', step: 'welcome' });
      return;
    }

    if (product === 'identify') {
      go({ mode: 'identify', step: sessionWasUnlocked ? 'lock' : 'auth' });
    }
  }, [
    sessionUnlocked,
    sessionWasUnlocked,
    coreAuth.ready,
    coreAuth.firstRun,
    coreAuth.userCount,
    setCoreAuth,
  ]);

  if (sessionUnlocked) return null;

  if (route === 'waiting') {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black gap-3">
        <p style={{ fontFamily: 'Orbitron, sans-serif', color: '#00f5ff', fontSize: 14, letterSpacing: '0.2em' }}>
          LIEN CORE
        </p>
        <p style={{ fontFamily: 'Share Tech Mono, monospace', color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
          Attente auth_status… {Math.round(waitMs / 1000)}s
        </p>
      </div>
    );
  }

  if (route === 'offline') {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black gap-4 px-6 text-center">
        <p style={{ fontFamily: 'Orbitron, sans-serif', color: '#f59e0b', fontSize: 14, letterSpacing: '0.16em' }}>
          CORE HORS LIGNE
        </p>
        <p style={{ fontFamily: 'Share Tech Mono, monospace', color: 'rgba(255,255,255,0.55)', fontSize: 11, maxWidth: 420 }}>
          Sans Core, pas d’utilisateurs ni d’enrôlement. Vérifiez que jarvis-core tourne sur la station.
        </p>
        <button
          type="button"
          className="px-4 py-2 rounded-lg cursor-pointer"
          style={{
            fontFamily: 'Share Tech Mono, monospace',
            fontSize: 10,
            color: '#00f5ff',
            border: '1px solid rgba(0,245,255,0.4)',
            background: 'rgba(0,20,40,0.9)',
          }}
          onClick={() => {
            go('waiting');
            setWaitMs(0);
            getCoreClient().connect();
            getCoreClient().sendAuth('status');
            addNotification({ type: 'info', title: 'Core', message: 'Nouvelle tentative…' });
          }}
        >
          RÉESSAYER
        </button>
        {DEV_BUILD && (
          <a
            href="?skipAuth=1"
            style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)' }}
          >
            Dev only — ?skipAuth=1
          </a>
        )}
      </div>
    );
  }

  if (route.mode === 'install' && route.step === 'welcome') {
    return <InstallWelcome onStart={() => go({ mode: 'install', step: 'wizard' })} />;
  }
  if (route.mode === 'install' && route.step === 'wizard') {
    return (
      <FirstSetupScene
        mode="first_run"
        onComplete={() => {
          setCoreAuth({ firstRun: false, userCount: Math.max(coreAuth.userCount, 1) });
          go({ mode: 'identify', step: 'auth' });
        }}
      />
    );
  }

  if (route.mode === 'identify' && route.step === 'enroll_member') {
    return (
      <FirstSetupScene
        mode="add_profile"
        presetName={enrollPreset}
        onComplete={() => {
          setCoreAuth({ firstRun: false, userCount: Math.max(coreAuth.userCount, 1) });
          setEnrollPreset(undefined);
          go({ mode: 'identify', step: sessionWasUnlocked ? 'lock' : 'auth' });
        }}
      />
    );
  }
  if (route.mode === 'identify' && route.step === 'lock') {
    return <LockScene />;
  }
  return (
    <AuthScene
      onRequestEnroll={() => go({ mode: 'identify', step: 'enroll_member' })}
    />
  );
}
