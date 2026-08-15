import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

import { AppProvider, useApp } from './context/AppContext';
import { Background } from './components/Background';
import { TopBar } from './components/TopBar';
import { AICore } from './components/AICore';
import { AppStage, MockAppContent } from './components/AppStage';
import { InteractionLock } from './components/InteractionLock';
import { Figma2Stage } from './components/Figma2Stage';
import { MiniOrb } from './components/MiniOrb';
import { VoiceBar } from './components/VoiceBar';
import { ScanningPanel } from './components/ScanningPanel';
import { AppGrid } from './components/AppGrid';
import { SettingsPanel } from './components/SettingsPanel';
import { GesturePanel } from './components/GesturePanel';
import { NotificationSystem } from './components/NotificationSystem';
import { TtsTestButton } from './components/TtsTestButton';
import { HudAuthGate } from './components/auth/HudAuthGate';
import { FirstSetupScene } from './components/auth/FirstSetupScene';
import { AdminAuthScene } from './components/auth/AdminAuthScene';
import { CoreBridge } from './components/CoreBridge';
import { GestureBridge } from './components/GestureBridge';
import { VoiceChatBridge } from './components/VoiceChatBridge';
import { SessionLifecycle } from './components/SessionLifecycle';
import { KioskMediaWarmup } from './components/KioskMediaWarmup';
import { BootScene } from '../ui/boot/BootScene';
import { AgenticDemoStage } from '../agentic/sim/AgenticDemoStage';
import { ChatPeek } from './components/ChatPeek';

/** Panneaux / boutons démo — visibles uniquement en Vite DEV */
const IS_DEV = import.meta.env.DEV;

function readAgenticDemoFlag(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search).get('agenticDemo');
  if (q === '1') return true;
  // Défaut = veille (présence). Démo agentic = ?agenticDemo=1 ou Ctrl+Shift+U.
  return false;
}

function MainLayout() {
  const {
    openApps, dashboardOpen, sessionUnlocked, micTestActive,
    welcomeCinematic, completeWelcomeCinematic,
    setAppGridOpen, setSettingsOpen, setGestureOpen,
    lockSession, requestDashboard,
  } = useApp();

  // Admin distant → overlay enrôlement sur kiosk déjà déverrouillé.
  const [remoteEnroll, setRemoteEnroll] = useState(false);
  const [enrollPreset, setEnrollPreset] = useState<string | undefined>();
  /** DEV : ?agenticDemo=1 — surface agentic plein cadre, orbe dans VoiceBar. */
  const [agenticDemo, setAgenticDemo] = useState(readAgenticDemoFlag);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);

  useEffect(() => {
    const onEnroll = (ev: Event) => {
      const detail = (ev as CustomEvent<{ display_name?: string; username?: string }>).detail;
      setEnrollPreset((detail?.display_name || detail?.username || '').trim() || undefined);
      setRemoteEnroll(true);
    };
    window.addEventListener('jarvis:start-enrollment', onEnroll as EventListener);
    return () => window.removeEventListener('jarvis:start-enrollment', onEnroll as EventListener);
  }, []);

  useEffect(() => {
    if (!IS_DEV) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && agenticDemo) {
        setAgenticDemo(false);
        return;
      }
      if (e.key === 'Escape' && chatDrawerOpen) {
        setChatDrawerOpen(false);
        return;
      }
      if (!(e.ctrlKey && e.shiftKey)) return;
      const k = e.key.toLowerCase();
      // U = agentic demo · A = apps · S = settings · G = gestes · D = dashboard · L = lock · C = chat
      if (k === 'u') {
        e.preventDefault();
        setAgenticDemo((v) => !v);
      } else if (k === 'a') {
        e.preventDefault();
        setAppGridOpen(true);
      } else if (k === 's') {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (k === 'g') {
        e.preventDefault();
        setGestureOpen(true);
      } else if (k === 'd') {
        e.preventDefault();
        requestDashboard();
      } else if (k === 'l') {
        e.preventDefault();
        lockSession('soft');
      } else if (k === 'c') {
        e.preventDefault();
        setChatDrawerOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    agenticDemo,
    chatDrawerOpen,
    setAppGridOpen,
    setSettingsOpen,
    setGestureOpen,
    requestDashboard,
    lockSession,
  ]);

  // Veille = TopBar + orbe + ChatPeek + VoiceBar — sans colonnes latérales.
  const visibleApps = openApps.filter(a => !a.minimized);
  const hudMode: 'veille' | 'surface' | 'apps' | 'agentic' =
    agenticDemo && IS_DEV
      ? 'agentic'
      : visibleApps.length === 1
        ? 'surface'
        : visibleApps.length > 1
          ? 'apps'
          : 'veille';

  if (welcomeCinematic) {
    return (
      <>
        <CoreBridge />
        <SessionLifecycle />
        <BootScene
          onReady={() => completeWelcomeCinematic()}
          captions
        />
        {IS_DEV && <TtsTestButton />}
        <NotificationSystem />
      </>
    );
  }

  if (remoteEnroll && sessionUnlocked) {
    return (
      <>
        <CoreBridge />
        <SessionLifecycle />
        <FirstSetupScene
          mode="add_profile"
          presetName={enrollPreset}
          onComplete={() => {
            setRemoteEnroll(false);
            setEnrollPreset(undefined);
          }}
        />
        <NotificationSystem />
      </>
    );
  }

  if (!sessionUnlocked) {
    return (
      <>
        <CoreBridge />
        <SessionLifecycle />
        <HudAuthGate />
        {IS_DEV && <TtsTestButton />}
        <NotificationSystem />
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif', height: '100svh', maxHeight: '100svh' }}
    >
      <Background />

      <InteractionLock />

      {/* 3 — TopBar intacte (NUC) */}
      <TopBar />

      <div className="relative flex-1 min-h-0 overflow-hidden">
      <AnimatePresence mode="wait">
        {dashboardOpen ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, scale: 0.93 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.93 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 px-2 pb-0.5"
          >
            <Figma2Stage />
          </motion.div>
        ) : hudMode === 'agentic' ? (
          <motion.div
            key="agentic"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex flex-col min-h-0"
          >
            <AgenticDemoStage onExit={() => setAgenticDemo(false)} />
          </motion.div>
        ) : hudMode === 'surface' ? (
          <motion.div
            key="surface"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 px-2 pb-0.5"
          >
            <MockAppContent app={visibleApps[0]} />
          </motion.div>
        ) : hudMode === 'apps' ? (
          <motion.div
            key="apps"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 px-2 pb-0.5 min-h-0 overflow-hidden"
          >
            <AppStage />
          </motion.div>
        ) : (
          /* Veille : orbe + peek chat + VoiceBar — pas de Moniteur / Console / bandeau fake */
          <motion.div
            key="veille"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-3 pb-3 pt-2 hud-center-col"
          >
            <div className="relative z-20 flex-1 min-h-0 w-full max-w-md flex items-center justify-center overflow-visible">
              <AICore />
            </div>

            <div className="relative z-20 w-full flex justify-center flex-shrink-0 px-2">
              <ChatPeek open={chatDrawerOpen} onOpenChange={setChatDrawerOpen} />
            </div>

            <div className="relative z-20 w-full flex justify-center flex-shrink-0 pb-1 hud-voice-wrap">
              <VoiceBar />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(dashboardOpen || micTestActive || hudMode === 'surface') && hudMode !== 'agentic' && (
          <MiniOrb position={dashboardOpen || micTestActive ? 'left' : 'bottom-center'} />
        )}
      </AnimatePresence>
      </div>

      {IS_DEV && <ScanningPanel />}
      <AppGrid />
      <SettingsPanel />
      {IS_DEV && <GesturePanel />}
      <AdminAuthScene />
      <CoreBridge />
      <SessionLifecycle />
      <KioskMediaWarmup />
      <GestureBridge />
      <VoiceChatBridge />
      {IS_DEV && <TtsTestButton />}
      <NotificationSystem />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
