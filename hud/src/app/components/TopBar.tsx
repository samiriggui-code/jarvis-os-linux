import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Wifi, Shield, Cpu, Settings, Grid, Hand, Bell, Activity, BrainCircuit, ExternalLink, Lock, LogOut } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getDevicePolicy } from '../../ui/core/devicePolicy';
import { dashboardPublicUrl, openDashboardPublic } from '../bridge/dashboardUrl';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { GlassButton } from '../../components/glass/GlassButton';
import { ACCENT, AI_STATE_COLOR, BORDER, MUTED, TEXT, monoFont, orbFont, bodyFont } from './hudTheme';
import { ThemeModeToggle } from './ThemeModeToggle';

export function TopBar() {
  const [time, setTime] = useState(new Date());
  const { setSettingsOpen, setAppGridOpen, setGestureOpen, aiState, addNotification, dashboardOpen, requestDashboard, lockSession } = useApp();
  const policy = getDevicePolicy();
  const remoteSession = policy.sessionSecurity === 'remote';

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fmtTime = (d: Date) => d.toLocaleTimeString('fr-FR', { hour12: false });
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('fr-FR', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const stateColor = AI_STATE_COLOR[aiState];
  const stateLabel = {
    idle: 'Veille',
    listening: 'Écoute',
    processing: 'Analyse',
    responding: 'Réponse',
  }[aiState];

  return (
    <GlassPanel
      level="regular"
      radius="lg"
      padding="xs"
      className="relative z-[100] h-10 flex-shrink-0 flex items-center gap-2 mt-2 mx-2"
    >
      <div className="flex items-center gap-3 flex-shrink-0 pl-1">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 rounded-full flex items-center justify-center relative"
          style={{
            border: `1.5px solid rgba(10, 132, 255, 0.45)`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
          }}
        >
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: ACCENT }} />
        </motion.div>
        <div>
          <div style={{ ...orbFont, color: TEXT, fontSize: 13 }}>Jarvis</div>
          <div style={{ ...monoFont, color: MUTED, fontSize: 10 }}>OS v3.7.2</div>
        </div>
      </div>

      <div className="w-px h-8 flex-shrink-0" style={{ background: BORDER }} />

      <div className="flex items-center gap-2 flex-shrink-0">
        <motion.div
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: aiState === 'idle' ? 3 : 0.6, repeat: Infinity }}
          className="w-2 h-2 rounded-full"
          style={{ background: stateColor }}
        />
        <span style={{ ...monoFont, color: stateColor, fontSize: 11 }}>{stateLabel}</span>
      </div>

      <div className="flex-1 min-w-0 flex items-center justify-center gap-3 lg:gap-6 overflow-hidden hud-topbar-metrics">
        {[
          { icon: Wifi, label: 'En ligne', val: '99.9%', color: '#34C759' },
          { icon: Shield, label: 'Sécurisé', val: 'AES-256', color: ACCENT },
          { icon: Cpu, label: 'Charge', val: '42%', color: ACCENT },
          { icon: Activity, label: 'Réseau', val: '1.2Go/s', color: ACCENT },
        ].map(({ icon: Icon, label, val, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <Icon className="w-3 h-3" style={{ color }} />
            <span style={{ ...monoFont, color: MUTED, fontSize: 10 }}>{label}</span>
            <span style={{ ...monoFont, color, fontSize: 10 }}>{val}</span>
          </div>
        ))}
      </div>

      <div className="text-right flex-shrink-0 hidden sm:block">
        <div style={{ ...orbFont, color: TEXT, fontSize: 15 }}>{fmtTime(time)}</div>
        <div className="hud-topbar-date" style={{ ...bodyFont, color: MUTED, fontSize: 10 }}>{fmtDate(time)}</div>
      </div>

      <div className="w-px h-8 flex-shrink-0" style={{ background: BORDER }} />

      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 pr-1">
        <ThemeModeToggle compact />
        <GlassButton
          tone="warning"
          icon={<Bell className="w-4 h-4" />}
          onClick={() =>
            addNotification({ type: 'info', title: 'Alerte système', message: 'Tous les systèmes sont nominaux.' })
          }
          style={{ width: 32, height: 32, padding: 0, placeContent: 'center', borderRadius: 12 }}
        />
        <GlassButton
          tone="accent"
          icon={<Hand className="w-4 h-4" />}
          onClick={() => setGestureOpen(true)}
          style={{ width: 32, height: 32, padding: 0, placeContent: 'center', borderRadius: 12 }}
        />
        <GlassButton
          tone="accent"
          icon={<Grid className="w-4 h-4" />}
          onClick={() => setAppGridOpen(true)}
          style={{ width: 32, height: 32, padding: 0, placeContent: 'center', borderRadius: 12 }}
        />
        <GlassButton
          tone="accent"
          active={dashboardOpen}
          icon={<BrainCircuit className="w-4 h-4" />}
          onClick={() => requestDashboard()}
          title="Dashboard overlay HUD"
          style={{ width: 32, height: 32, padding: 0, placeContent: 'center', borderRadius: 12 }}
        />
        <GlassButton
          tone="accent"
          icon={<ExternalLink className="w-4 h-4" />}
          onClick={() => openDashboardPublic()}
          title={`Dashboard FQDN — ${dashboardPublicUrl()}`}
          style={{ width: 32, height: 32, padding: 0, placeContent: 'center', borderRadius: 12 }}
        />
        <GlassButton
          tone="danger"
          icon={remoteSession ? <LogOut className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          onClick={() => {
            if (remoteSession) {
              lockSession('hard');
              addNotification({ type: 'info', title: 'Déconnecté', message: 'Session fermée — réidentification requise.' });
            } else {
              lockSession('soft');
              addNotification({ type: 'info', title: 'Changer d’utilisateur', message: 'Écran verrouillé.' });
            }
          }}
          title={remoteSession ? 'Se déconnecter' : 'Changer d’utilisateur'}
          style={{ width: 32, height: 32, padding: 0, placeContent: 'center', borderRadius: 12 }}
        />
        <GlassButton
          tone="accent"
          icon={<Settings className="w-4 h-4" />}
          onClick={() => setSettingsOpen(true)}
          title="Paramètres"
          style={{ width: 32, height: 32, padding: 0, placeContent: 'center', borderRadius: 12 }}
        />
      </div>
    </GlassPanel>
  );
}
