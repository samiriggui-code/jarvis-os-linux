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
import { authStatus } from '../../bridge/authClient';
import { DEV_BUILD } from '../../bridge/devAuthBypass';
import { resolveProductMode, type InstallRoute, type IdentifyRoute } from '../../auth/productMode';
import { GlassCard, GlassButton } from '../../../components/glass';
import { tokens } from '../../../ui/tokens';
import { Background } from '../Background';
import { ThemeModeToggle } from '../ThemeModeToggle';
import { visionCaption, visionTitle, visionBody } from '../visionChrome';

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
      go({ mode: 'install', step: 'wizard' });
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
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-3">
        <Background />
        <div className="absolute top-3 right-3 z-20">
          <ThemeModeToggle compact />
        </div>
        <GlassCard level="subtle" radius="lg" padding="lg" style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <p style={{ ...visionTitle, color: tokens.color.accent, fontSize: 15, margin: 0 }}>
            Connexion au Core
          </p>
          <p style={{ ...visionBody, fontSize: 11, margin: '10px 0 0' }}>
            Attente auth_status… {Math.round(waitMs / 1000)}s
          </p>
        </GlassCard>
      </div>
    );
  }

  if (route === 'offline') {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <Background />
        <div className="absolute top-3 right-3 z-20">
          <ThemeModeToggle compact />
        </div>
        <GlassCard level="strong" radius="lg" padding="lg" style={{ maxWidth: 460, position: 'relative', zIndex: 1 }}>
          <p style={{ ...visionTitle, color: tokens.color.warning, fontSize: 15, margin: 0 }}>
            Core hors ligne
          </p>
          <p style={{ ...visionBody, fontSize: 12, margin: '14px 0 0', lineHeight: 1.6, color: tokens.color.text }}>
            Sans Core, pas d’utilisateurs ni d’enrôlement. Vérifiez que jarvis-core tourne sur la station.
          </p>
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
            <GlassButton
              tone="accent"
              active
              onClick={() => {
                go('waiting');
                setWaitMs(0);
                getCoreClient().connect();
                getCoreClient().sendAuth('status');
                addNotification({ type: 'info', title: 'Core', message: 'Nouvelle tentative…' });
              }}
            >
              Réessayer
            </GlassButton>
          </div>
          {DEV_BUILD && (
            <a
              href="?skipAuth=1"
              style={{ fontFamily: tokens.font.mono, fontSize: 9, color: tokens.color.textMuted, display: 'block', marginTop: 14 }}
            >
              Dev only — ?skipAuth=1
            </a>
          )}
        </GlassCard>
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
          void authStatus().then((st) => {
            setCoreAuth({
              firstRun: st.first_run,
              userCount: st.user_count,
            });
          });
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
      onRequestEnroll={() => {
        console.info('[AUTH] HudAuthGate → enroll_member');
        go({ mode: 'identify', step: 'enroll_member' });
      }}
    />
  );
}
