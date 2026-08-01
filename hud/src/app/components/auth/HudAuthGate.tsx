/**
 * HudAuthGate — routeur auth (§10.1)
 * Source de vérité : Core auth_status.first_run (User Manager SQLite).
 */
import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FirstSetupScene } from './FirstSetupScene';
import { LockScene } from './LockScene';
import { AuthScene } from './AuthScene';
import { getCoreClient } from '../../bridge/coreClient';
import { DEV_BUILD } from '../../bridge/devAuthBypass';

type AuthRoute = 'waiting' | 'offline' | 'first_setup' | 'lock' | 'auth';

export function HudAuthGate() {
  const { sessionUnlocked, sessionWasUnlocked, coreAuth, setCoreAuth, addNotification } = useApp();
  const [route, setRoute] = useState<AuthRoute>('waiting');
  const [waitMs, setWaitMs] = useState(0);

  useEffect(() => {
    if (sessionUnlocked) return;

    if (coreAuth.ready && coreAuth.firstRun !== null) {
      if (coreAuth.firstRun) setRoute('first_setup');
      else if (sessionWasUnlocked) setRoute('lock');
      else setRoute('auth');
      return;
    }

    setRoute('waiting');
    const t0 = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - t0;
      setWaitMs(elapsed);
      if (getCoreClient().connected) {
        getCoreClient().sendAuth('status');
      }
      // Après 6s sans Core → message clair (pas de fake first_run local)
      if (elapsed > 6000 && !coreAuth.ready) {
        setRoute('offline');
        setCoreAuth({ ready: false, online: false });
      }
    }, 800);
    return () => clearInterval(id);
  }, [sessionUnlocked, sessionWasUnlocked, coreAuth.ready, coreAuth.firstRun, setCoreAuth]);

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
        <p style={{ fontFamily: 'Share Tech Mono, monospace', color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>
          python -m jarvis_core · ws://127.0.0.1:8765
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
          Le User Manager est dans le Core. Sans WS, pas d’enrôlement / login réel.
          Lance <code style={{ color: '#00f5ff' }}>cd core && python -m jarvis_core</code> puis recharge.
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
            setRoute('waiting');
            setWaitMs(0);
            getCoreClient().connect();
            getCoreClient().sendAuth('status');
            addNotification({ type: 'info', title: 'Core', message: 'Nouvelle tentative de connexion…' });
          }}
        >
          RÉESSAYER
        </button>
        {/* Le lien s'annonçait « dev only » sans que rien ne le fasse
            respecter — affiché sur l'écran « Core injoignable », donc
            précisément quand il fallait le moins. */}
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

  if (route === 'first_setup') {
    return (
      <FirstSetupScene
        onComplete={() => {
          setCoreAuth({ firstRun: false, userCount: Math.max(coreAuth.userCount, 1) });
          setRoute('auth');
        }}
      />
    );
  }
  if (route === 'lock') return <LockScene />;
  return <AuthScene />;
}
