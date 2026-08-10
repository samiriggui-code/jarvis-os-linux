import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Terminal, Search, Activity } from 'lucide-react';

import { AppProvider, useApp } from './context/AppContext';
import { Background } from './components/Background';
import { TopBar } from './components/TopBar';
import { AICore } from './components/AICore';
import { AppStage, MockAppContent } from './components/AppStage';
import { InteractionLock } from './components/InteractionLock';
import { Figma2Stage } from './components/Figma2Stage';
import { MiniOrb } from './components/MiniOrb';
import { SystemMonitor } from './components/SystemMonitor';
import { MemoryPanel } from './components/MemoryPanel';
import { CommandConsole } from './components/CommandConsole';
import { SearchPanel } from './components/SearchPanel';
import { VoiceBar } from './components/VoiceBar';
import { ScanningPanel } from './components/ScanningPanel';
import { AppGrid } from './components/AppGrid';
import { SettingsPanel } from './components/SettingsPanel';
import { GesturePanel } from './components/GesturePanel';
import { NotificationSystem } from './components/NotificationSystem';
import { TtsTestButton } from './components/TtsTestButton';
import { HudAuthGate } from './components/auth/HudAuthGate';
import { FirstSetupScene } from './components/auth/FirstSetupScene';
import { LockScene } from './components/auth/LockScene';
import { AdminAuthScene } from './components/auth/AdminAuthScene';
import { CoreBridge } from './components/CoreBridge';
import { GestureBridge } from './components/GestureBridge';
import { VoiceChatBridge } from './components/VoiceChatBridge';
import { SessionLifecycle } from './components/SessionLifecycle';
import { KioskMediaWarmup } from './components/KioskMediaWarmup';
import { BootScene } from '../ui/boot/BootScene';
import { tokens } from '../ui/tokens';
import { glassLevel } from '../ui/tokens';

/** Panneaux / boutons démo — visibles uniquement en Vite DEV */
const IS_DEV = import.meta.env.DEV;

const orb = { fontFamily: tokens.font.display };
const mono = { fontFamily: tokens.font.mono };

const glassPanel = () => {
  const spec = glassLevel.regular;
  return {
    background: spec.background,
    backdropFilter: spec.backdropFilter,
    WebkitBackdropFilter: spec.backdropFilter,
    border: spec.border,
    borderRadius: '20px',
    boxShadow: spec.boxShadow,
  };
};

/** Scale children to fit parent; layout box matches visual size (unlike CSS transform alone). */
function FitScale({
  baseWidth,
  baseHeight,
  children,
}: {
  baseWidth: number;
  baseHeight: number;
  children: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 8 || height < 8) return;
      setScale(Math.min(width / baseWidth, height / baseHeight, 1));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseWidth, baseHeight]);

  return (
    <div ref={hostRef} className="w-full h-full min-h-0 flex items-center justify-center overflow-visible">
      <div style={{ width: baseWidth * scale, height: baseHeight * scale, position: 'relative' }}>
        <div
          style={{
            width: baseWidth,
            height: baseHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function PanelTab({
  id, label, icon: Icon, active, color, onClick,
}: {
  id: string; label: string; icon: React.ElementType;
  active: boolean; color: string; onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer"
      style={{
        background: active ? `${color}12` : 'rgba(255,255,255,0.02)',
        border: `1px solid ${active ? `${color}35` : 'rgba(255,255,255,0.06)'}`,
        transition: 'all 0.2s',
      }}
    >
      <Icon className="w-3.5 h-3.5" style={{ color: active ? color : 'rgba(255,255,255,0.3)' }} />
      <span style={{ ...mono, color: active ? color : tokens.color.textMuted, fontSize: '10px' }}>
        {label}
      </span>
    </motion.button>
  );
}

function MainLayout() {
  const {
    leftPanel, setLeftPanel, rightPanel, setRightPanel,
    openApps, dashboardOpen, sessionUnlocked, micTestActive,
    welcomeCinematic, completeWelcomeCinematic,
  } = useApp();
  // Admin distant → overlay enrôlement sur kiosk déjà déverrouillé.
  const [remoteEnroll, setRemoteEnroll] = useState(false);
  const [enrollPreset, setEnrollPreset] = useState<string | undefined>();
  useEffect(() => {
    const onEnroll = (ev: Event) => {
      const detail = (ev as CustomEvent<{ display_name?: string; username?: string }>).detail;
      setEnrollPreset((detail?.display_name || detail?.username || '').trim() || undefined);
      setRemoteEnroll(true);
    };
    window.addEventListener('jarvis:start-enrollment', onEnroll as EventListener);
    return () => window.removeEventListener('jarvis:start-enrollment', onEnroll as EventListener);
  }, []);
  // Trois états du HUD normal :
  // - « veille » : orbe centrale, rien d'ouvert.
  // - « surface » : UNE surface agentic occupe tout l'écran (G1a) — c'est le flux
  //   principal désormais : JARVIS répond, la réponse prend la scène, l'orbe se
  //   réduit et se pose en bas-centre (MiniOrb position="bottom-center").
  // - « apps » : PLUSIEURS fenêtres ouvertes simultanément → on retombe sur le
  //   système de fenêtres AppStage (usage multi-fenêtres explicite, ex. Terminal +
  //   Settings ouverts ensemble). Panneau gauche + barre voix s'effacent dans les
  //   deux cas non-veille — le panneau droit (console / chat) reste toujours.
  //
  // L'icône déportée du TopBar (dashboardOpen) est un quatrième état, distinct et
  // spécial : tout le HUD se retire pour laisser Dashboard Core RÉEL (figma2) occuper
  // tout l'espace, orbe réduite posée en bas à gauche — voir Figma2Stage. Accès via
  // AdminAuthScene (auth intermédiaire SF).
  const visibleApps = openApps.filter(a => !a.minimized);
  const hudMode: 'veille' | 'surface' | 'apps' =
    visibleApps.length === 1 ? 'surface' : visibleApps.length > 1 ? 'apps' : 'veille';

  // Post-auth / post-enrôlement uniquement — pas au verrouillage ni au refresh.
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

      <TopBar />

      <div className="relative flex-1 min-h-0 overflow-hidden">
      <AnimatePresence mode="wait">
        {dashboardOpen ? (
          /* Le HUD entier se retire vers l'intérieur ; Dashboard Core (figma2)
             prend le relais en s'ouvrant depuis un état légèrement réduit —
             jamais de coupure brutale, toujours une relocalisation. */
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
        ) : hudMode === 'surface' ? (
          /* G1a — canevas agentic plein écran : une seule surface prend TOUT
             l'écran (plus une petite fenêtre AppStage parmi d'autres). Le
             protocole/registre ne changent pas (mêmes composants), seul le
             conteneur devient l'écran entier. L'orbe se réduit — voir le
             MiniOrb position="bottom-center" plus bas. */
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
        ) : (
      <motion.div
        key="hud"
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0 flex gap-2 px-2 hud-chrome-row"
      >
        {/* LEFT PANEL (groupe 2) — s'efface en mode apps, la fenêtre prend la place */}
        <AnimatePresence initial={false}>
          {hudMode === 'veille' && (
            <motion.div
              key="left-panel"
              initial={{ x: -280, opacity: 0, width: 0 }}
              animate={{ x: 0, opacity: 1, width: 'auto' }}
              exit={{ x: -280, opacity: 0, width: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex-shrink-0 overflow-hidden hud-side-left"
            >
              <div className="w-48 lg:w-56 xl:w-64 h-full flex flex-col gap-1.5 overflow-hidden pt-1 pb-0.5">
                <div className="flex gap-2 flex-shrink-0">
                  <PanelTab
                    id="monitor" label="Moniteur" icon={Activity}
                    active={leftPanel === 'monitor'} color="#0A84FF"
                    onClick={() => setLeftPanel('monitor')}
                  />
                  <PanelTab
                    id="memory" label="Mémoire" icon={Brain}
                    active={leftPanel === 'memory'} color="#0A84FF"
                    onClick={() => setLeftPanel('memory')}
                  />
                </div>

                <div
                  className="flex-1 min-h-0 p-3 overflow-y-auto"
                  style={glassPanel()}
                >
                  <AnimatePresence mode="wait">
                    {leftPanel === 'monitor' ? (
                      <motion.div key="monitor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                        <SystemMonitor />
                      </motion.div>
                    ) : (
                      <motion.div key="memory" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                        <MemoryPanel />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CENTER — relative z-10 : sinon le Background (fixed z-0) passe devant
            dès que Framer Motion retire ses transforms en fin d'animation */}
        <div className="relative z-10 flex-1 min-w-0 min-h-0 flex flex-col items-center justify-center gap-1 overflow-visible hud-center-col">
          <AnimatePresence initial={false}>
            {hudMode === 'veille' && (
              <motion.div
                key="stats"
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                transition={{ duration: 0.3 }}
                className="hidden min-[700px]:flex w-full max-w-xs items-center justify-between px-3 py-1 rounded-xl flex-shrink-0"
                style={{
                  background: glassLevel.subtle.background,
                  border: glassLevel.subtle.border,
                  backdropFilter: glassLevel.subtle.backdropFilter,
                }}
              >
                {[
                  { label: 'Opérations', value: '1,2 T', color: '#0A84FF' },
                  { label: 'Contexte', value: '128 K', color: '#0A84FF' },
                  { label: 'Précision', value: '98,7 %', color: '#22c55e' },
                  { label: 'Latence', value: '42 ms', color: '#f59e0b' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col items-center">
                    <span style={{ ...orb, color, fontSize: '11px' }}>{value}</span>
                    <span style={{ ...mono, color: tokens.color.textMuted, fontSize: '8px' }}>{label}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-visible px-2 py-2">
            <AnimatePresence mode="wait">
              {hudMode === 'veille' ? (
                <motion.div
                  key="veille"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  className="w-full h-full max-w-[min(100%,480px)] max-h-full flex items-center justify-center"
                >
                  <AICore />
                </motion.div>
              ) : (
                <motion.div
                  key="apps"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.3 }}
                  className="w-full h-full min-h-0 min-w-0 overflow-hidden"
                >
                  <AppStage />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Groupe 1 : barre voix + actions rapides — s'efface en mode apps,
              l'orbe réduite (AppStage) prend le relais du contact vocal */}
          <AnimatePresence initial={false}>
            {hudMode === 'veille' && (
              <motion.div
                key="voice-actions"
                initial={{ opacity: 0, y: 60, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: 60, height: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-sm flex flex-col gap-1.5 flex-shrink-0 pb-0.5 hud-voice-wrap"
              >
                <VoiceBar />
                <div className="flex items-center justify-center gap-1.5 flex-wrap hud-quick-actions">
                  {[
                    { label: 'Scanner', color: '#0A84FF', action: 'scan' },
                    { label: 'Analyser', color: '#0A84FF', action: 'analyze' },
                    { label: 'Déployer', color: '#22c55e', action: 'deploy' },
                    { label: 'Sécuriser', color: '#f59e0b', action: 'encrypt' },
                  ].map(({ label, color, action }) => (
                    <QuickActionButton key={label} label={label} color={color} action={action} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT PANEL — console / chat : reste visible en mode apps */}
        <div className="w-48 lg:w-56 xl:w-64 flex-shrink-0 flex flex-col gap-1.5 overflow-hidden pt-1 pb-0.5 hud-side-right">
          <div className="flex gap-2 flex-shrink-0">
            <PanelTab
              id="console" label="Console" icon={Terminal}
              active={rightPanel === 'console'} color="#0A84FF"
              onClick={() => setRightPanel('console')}
            />
            <PanelTab
              id="search" label="Recherche" icon={Search}
              active={rightPanel === 'search'} color="#0A84FF"
              onClick={() => setRightPanel('search')}
            />
          </div>

          <div
            className="flex-1 min-h-0 p-3 overflow-y-auto"
            style={glassPanel()}
          >
            <AnimatePresence mode="wait">
              {rightPanel === 'console' ? (
                <motion.div key="console" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <CommandConsole />
                </motion.div>
              ) : (
                <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <SearchPanel />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
        )}
      </AnimatePresence>

      {/* Dashboard actif : l'orbe rapetisse et se pose en bas à gauche. Surface
          plein écran (G1b) : elle se pose en bas-centre — même mécanique, un
          troisième point d'ancrage. Jamais de remount de JarvisOrb/OrbLite,
          seule la position change (P6 : le rendu de l'orbe reste intact). */}
      <AnimatePresence>
        {(dashboardOpen || micTestActive || hudMode === 'surface') && (
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

function QuickActionButton({ label, color, action }: { label: string; color: string; action: string }) {
  const { addMessage, setAiState, setScanningActive, addNotification } = useApp();

  const handleClick = () => {
    addMessage({ type: 'user', text: label.toLowerCase() });
    setAiState('processing');
    if (action === 'scan') {
      setTimeout(() => {
        setScanningActive(true);
        setAiState('responding');
        addMessage({ type: 'ai', text: 'Scan lancé. Activation de l\'affichage holographique…' });
        setTimeout(() => setAiState('idle'), 2000);
      }, 600);
    } else {
      setTimeout(() => {
        setAiState('responding');
        const resp = action === 'analyze'
          ? 'Analyse neuronale profonde en cours… Reconnaissance de motifs : confiance de 99,2 %. Aucune anomalie trouvée.'
          : action === 'deploy'
          ? 'Déploiement lancé. Conteneur Docker construit. Déploiement en production : réussi. Aucune interruption.'
          : 'Protocole de chiffrement activé. AES-256 + RSA-4096 engagés. Tous les canaux sécurisés.';
        addMessage({ type: 'ai', text: resp });
        addNotification({ type: 'success', title: `${label} : terminé`, message: resp.slice(0, 60) + '…' });
        setTimeout(() => setAiState('idle'), 2000);
      }, 1000);
    }
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      className="px-2.5 py-1 rounded-lg cursor-pointer"
      style={{
        background: `${color}14`,
        border: `1px solid ${color}28`,
      }}
    >
      <span style={{ ...mono, color, fontSize: '10px' }}>{label}</span>
    </motion.button>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
