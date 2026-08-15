import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Wifi, Cpu, HardDrive, Activity } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { ACCENT, AI_STATE_COLOR, BORDER, MUTED, TEXT, monoFont, orbFont, bodyFont } from './hudTheme';
import { ThemeModeToggle } from './ThemeModeToggle';
import { useSystemMetrics } from '../bridge/systemMetrics';
import { isCoreOnline } from './CoreBridge';

/**
 * Header veille — centré, largeur réduite.
 * Contenu : identité · état · métriques RÉELLES · horloge · switch light/night.
 * Pas de rangée de raccourcis (apps / settings / lock…).
 */
export function TopBar() {
  const [time, setTime] = useState(new Date());
  const [online, setOnline] = useState(() => isCoreOnline());
  const { aiState } = useApp();
  const { metrics, ready } = useSystemMetrics();

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setOnline(isCoreOnline()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const fmtTime = (d: Date) => d.toLocaleTimeString('fr-FR', { hour12: false });
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('fr-FR', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const stateColor = AI_STATE_COLOR[aiState];
  const stateLabel = {
    idle: 'Veille',
    listening: 'Écoute',
    processing: 'Réflexion',
    responding: 'Parole',
  }[aiState];

  const dash = '—';
  const slots = [
    {
      icon: Wifi,
      label: 'Core',
      val: online ? 'En ligne' : 'Hors ligne',
      color: online ? '#34C759' : '#FF453A',
    },
    {
      icon: Cpu,
      label: 'Charge',
      val: ready && metrics ? `${Math.round(metrics.cpu)}%` : dash,
      color: ACCENT,
    },
    {
      icon: Activity,
      label: 'Mémoire',
      val: ready && metrics ? `${Math.round(metrics.ram)}%` : dash,
      color: ACCENT,
    },
    {
      icon: HardDrive,
      label: 'Disque',
      val: ready && metrics ? `${Math.round(metrics.disk)}%` : dash,
      color: ACCENT,
    },
  ];

  return (
    <div className="relative z-[100] flex justify-center px-3 mt-2 mb-1 flex-shrink-0">
      <GlassPanel
        level="regular"
        radius="lg"
        padding="xs"
        className="h-9 flex items-center gap-3 w-full max-w-3xl"
      >
        <div className="flex items-center gap-2.5 flex-shrink-0 pl-1">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
            className="w-7 h-7 rounded-full flex items-center justify-center relative"
            style={{
              border: `1.5px solid rgba(10, 132, 255, 0.45)`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
            }}
          >
            <div className="w-2 h-2 rounded-full" style={{ background: ACCENT }} />
          </motion.div>
          <div>
            <div style={{ ...orbFont, color: TEXT, fontSize: 13 }}>Jarvis</div>
            <div style={{ ...monoFont, color: MUTED, fontSize: 9 }}>OS v3.7.2</div>
          </div>
        </div>

        <div className="w-px h-7 flex-shrink-0" style={{ background: BORDER }} />

        <div className="flex items-center gap-2 flex-shrink-0 pr-1 min-w-[5.5rem]">
          <motion.div
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ duration: aiState === 'idle' ? 3 : 0.6, repeat: Infinity }}
            className="w-2 h-2 rounded-full"
            style={{ background: stateColor }}
          />
          <span style={{ ...orbFont, color: stateColor, fontSize: 12 }}>{stateLabel}</span>
        </div>

        <div className="w-px h-7 flex-shrink-0" style={{ background: BORDER }} />

        <div className="flex-1 min-w-0 flex items-center justify-center gap-3 lg:gap-5 overflow-hidden hud-topbar-metrics pl-1">
          {slots.map(({ icon: Icon, label, val, color }) => (
            <div key={label} className="flex items-center gap-1">
              <Icon className="w-3 h-3" style={{ color }} />
              <span className="hidden md:inline" style={{ ...monoFont, color: MUTED, fontSize: 10 }}>{label}</span>
              <span style={{ ...monoFont, color, fontSize: 10 }}>{val}</span>
            </div>
          ))}
        </div>

        <div className="text-right flex-shrink-0 hidden sm:block">
          <div style={{ ...orbFont, color: TEXT, fontSize: 14 }}>{fmtTime(time)}</div>
          <div className="hud-topbar-date" style={{ ...bodyFont, color: MUTED, fontSize: 9 }}>{fmtDate(time)}</div>
        </div>

        <div className="w-px h-7 flex-shrink-0" style={{ background: BORDER }} />

        <div className="flex-shrink-0 pr-0.5">
          <ThemeModeToggle compact />
        </div>
      </GlassPanel>
    </div>
  );
}
