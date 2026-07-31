import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Terminal, Search, Activity } from 'lucide-react';

import { AppProvider, useApp } from './context/AppContext';
import { Background } from './components/Background';
import { TopBar } from './components/TopBar';
import { AICore } from './components/AICore';
import { AppStage } from './components/AppStage';
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
import { VoiceChatBridge } from './components/VoiceChatBridge';

/** Panneaux / boutons démo — visibles uniquement en Vite DEV */
const IS_DEV = import.meta.env.DEV;

const orb = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };

const glassPanel = (accent = '#00f5ff') => ({
  background: 'rgba(0, 10, 28, 0.65)',
  backdropFilter: 'blur(20px)',
  border: `1px solid ${accent}20`,
  borderRadius: '16px',
  boxShadow: `0 0 30px rgba(0,0,0,0.4), inset 0 0 20px rgba(0,0,0,0.3)`,
});

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
      <span style={{ ...mono, color: active ? color : 'rgba(255,255,255,0.35)', fontSize: '9px', letterSpacing: '0.08em' }}>
        {label}
      </span>
    </motion.button>
  );
}

function MainLayout() {
  const { leftPanel, setLeftPanel, rightPanel, setRightPanel, openApps, dashboardOpen, sessionUnlocked, micTestActive } = useApp();
  // Deux états du HUD normal : « veille » (orbe centrale) / « apps » (scène time capsule
  // + mini-orbe). En mode apps : panneau gauche + barre voix s'effacent —
  // le panneau droit (console / chat) reste. Fenêtre dans la colonne centre,
  // orbe réduite en bas à droite de la scène apps.
  //
  // L'icône déportée du TopBar (dashboardOpen) est un troisième état, distinct et
  // spécial : tout le HUD se retire pour laisser Dashboard Core RÉEL (figma2) occuper
  // tout l'espace, orbe réduite au même gabarit qu'en mode apps mais posée en bas
  // à gauche — voir Figma2Stage. Accès via AdminAuthScene (auth intermédiaire SF).
  const hudMode: 'veille' | 'apps' = openApps.some(a => !a.minimized) ? 'apps' : 'veille';

  if (!sessionUnlocked) {
    return (
      <>
        <CoreBridge />
        <HudAuthGate />
        {IS_DEV && <TtsTestButton />}
        <NotificationSystem />
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ fontFamily: 'Rajdhani, sans-serif', height: '100svh', maxHeight: '100svh' }}
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
                    id="monitor" label="MONITEUR" icon={Activity}
                    active={leftPanel === 'monitor'} color="#00f5ff"
                    onClick={() => setLeftPanel('monitor')}
                  />
                  <PanelTab
                    id="memory" label="MÉMOIRE" icon={Brain}
                    active={leftPanel === 'memory'} color="#a855f7"
                    onClick={() => setLeftPanel('memory')}
                  />
                </div>

                <div
                  className="flex-1 min-h-0 p-3 overflow-y-auto"
                  style={glassPanel(leftPanel === 'monitor' ? '#00f5ff' : '#a855f7')}
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
                  background: 'rgba(0,8,22,0.5)',
                  border: '1px solid rgba(0,245,255,0.1)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                {[
                  { label: 'OPS NEURONALES', value: '1,2T', color: '#00f5ff' },
                  { label: 'CONTEXTE', value: '128K', color: '#a855f7' },
                  { label: 'PRÉCISION', value: '98,7%', color: '#22c55e' },
                  { label: 'LATENCE', value: '42ms', color: '#f59e0b' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col items-center">
                    <span style={{ ...orb, color, fontSize: '10px', textShadow: `0 0 8px ${color}` }}>{value}</span>
                    <span style={{ ...mono, color: 'rgba(255,255,255,0.3)', fontSize: '6px' }}>{label}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
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
                    { label: 'SCANNER', color: '#00f5ff', action: 'scan' },
                    { label: 'ANALYSER', color: '#a855f7', action: 'analyze' },
                    { label: 'DÉPLOYER', color: '#22c55e', action: 'deploy' },
                    { label: 'SÉCURISER', color: '#f59e0b', action: 'encrypt' },
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
              id="console" label="CONSOLE" icon={Terminal}
              active={rightPanel === 'console'} color="#00f5ff"
              onClick={() => setRightPanel('console')}
            />
            <PanelTab
              id="search" label="RECHERCHE" icon={Search}
              active={rightPanel === 'search'} color="#0ea5e9"
              onClick={() => setRightPanel('search')}
            />
          </div>

          <div
            className="flex-1 min-h-0 p-3 overflow-y-auto"
            style={glassPanel(rightPanel === 'console' ? '#00f5ff' : '#0ea5e9')}
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

      {/* Dashboard actif : l'orbe rapetisse au même gabarit que l'état fenêtre
          et se pose en bas à gauche, pendant que Dashboard Core occupe la scène */}
      <AnimatePresence>
        {(dashboardOpen || micTestActive) && <MiniOrb corner="left" />}
      </AnimatePresence>
      </div>

      {IS_DEV && <ScanningPanel />}
      <AppGrid />
      <SettingsPanel />
      {IS_DEV && <GesturePanel />}
      <AdminAuthScene />
      <CoreBridge />
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
        background: `${color}0a`,
        border: `1px solid ${color}30`,
        transition: 'box-shadow 0.2s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = `0 0 16px ${color}25`}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = 'none'}
    >
      <span style={{ ...mono, color, fontSize: '9px', letterSpacing: '0.08em' }}>{label}</span>
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
