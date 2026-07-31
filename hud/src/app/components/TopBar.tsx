import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Wifi, Shield, Cpu, Settings, Grid, Hand, Bell, Activity, BrainCircuit, Lock } from 'lucide-react';
import { useApp } from '../context/AppContext';

const orb = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };
const raj = { fontFamily: 'Rajdhani, sans-serif' };

export function TopBar() {
  const [time, setTime] = useState(new Date());
  const { setSettingsOpen, setAppGridOpen, setGestureOpen, aiState, addNotification, dashboardOpen, requestDashboard, lockSession } = useApp();

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fmtTime = (d: Date) => d.toLocaleTimeString('fr-FR', { hour12: false });
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('fr-FR', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const stateColor = {
    idle: '#00f5ff',
    listening: '#22c55e',
    processing: '#f59e0b',
    responding: '#a855f7',
  }[aiState];

  const stateLabel = {
    idle: 'VEILLE',
    listening: 'ÉCOUTE',
    processing: 'ANALYSE',
    responding: 'RÉPONSE',
  }[aiState];

  return (
    <div
      className="relative z-[100] h-10 flex-shrink-0 flex items-center px-3 gap-2 mt-2 mx-2 rounded-xl"
      style={{
        background: 'rgba(1, 11, 26, 0.9)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(0, 245, 255, 0.15)',
        boxShadow: '0 0 30px rgba(0, 245, 255, 0.04)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 rounded-full flex items-center justify-center relative"
          style={{
            border: '1.5px solid rgba(0,245,255,0.6)',
            boxShadow: '0 0 12px rgba(0,245,255,0.4), inset 0 0 8px rgba(0,245,255,0.1)',
          }}
        >
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: '#00f5ff', boxShadow: '0 0 8px rgba(0,245,255,0.9)' }}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{ border: '1px dashed rgba(0,245,255,0.2)' }}
          />
        </motion.div>
        <div>
          <div style={{ ...orb, color: '#00f5ff', fontSize: '13px', letterSpacing: '0.15em', textShadow: '0 0 10px rgba(0,245,255,0.6)' }}>
            JARVIS
          </div>
          <div style={{ ...mono, color: 'rgba(0,245,255,0.45)', fontSize: '10px' }}>OS v3.7.2 — ALPHA</div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-8 flex-shrink-0" style={{ background: 'rgba(0,245,255,0.12)' }} />

      {/* AI State */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <motion.div
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: aiState === 'idle' ? 3 : 0.6, repeat: Infinity }}
          className="w-2 h-2 rounded-full"
          style={{ background: stateColor, boxShadow: `0 0 8px ${stateColor}` }}
        />
        <span style={{ ...mono, color: stateColor, fontSize: '11px', letterSpacing: '0.12em' }}>
          {stateLabel}
        </span>
      </div>

      {/* Center status row */}
      <div className="flex-1 min-w-0 flex items-center justify-center gap-3 lg:gap-6 overflow-hidden hud-topbar-metrics">
        {[
          { icon: Wifi, label: 'EN LIGNE', val: '99.9%', color: '#22c55e' },
          { icon: Shield, label: 'SÉCURISÉ', val: 'AES-256', color: '#00f5ff' },
          { icon: Cpu, label: 'CHARGE', val: '42%', color: '#a855f7' },
          { icon: Activity, label: 'RÉSEAU', val: '1.2Go/s', color: '#0ea5e9' },
        ].map(({ icon: Icon, label, val, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <Icon className="w-3 h-3" style={{ color }} />
            <span style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>{label}</span>
            <span style={{ ...mono, color, fontSize: '10px' }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Time */}
      <div className="text-right flex-shrink-0 hidden sm:block">
        <div style={{ ...orb, color: '#00f5ff', fontSize: '15px', textShadow: '0 0 10px rgba(0,245,255,0.5)' }}>
          {fmtTime(time)}
        </div>
        <div className="hud-topbar-date" style={{ ...raj, color: 'rgba(0,245,255,0.5)', fontSize: '10px' }}>{fmtDate(time)}</div>
      </div>

      {/* Divider */}
      <div className="w-px h-8 flex-shrink-0" style={{ background: 'rgba(0,245,255,0.12)' }} />

      {/* Quick actions — groupe lanceur/gestuel + Dashboard Core */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        {[
          {
            icon: Bell,
            action: () =>
              addNotification({ type: 'info', title: 'Alerte système', message: 'Tous les systèmes sont nominaux. Aucune anomalie détectée.' }),
            color: '#f59e0b',
          },
          { icon: Hand, action: () => setGestureOpen(true), color: '#00f5ff' },
          { icon: Grid, action: () => setAppGridOpen(true), color: '#00f5ff' },
        ].map(({ icon: Icon, action, color }, i) => (
          <motion.button
            key={i}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            onClick={action}
            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
            style={{
              background: 'rgba(0,245,255,0.04)',
              border: '1px solid rgba(0,245,255,0.15)',
              transition: 'box-shadow 0.2s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = `0 0 12px ${color}40`;
              (e.currentTarget as HTMLElement).style.borderColor = `${color}60`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,245,255,0.15)';
            }}
          >
            <Icon className="w-4 h-4" style={{ color }} />
          </motion.button>
        ))}

        {/* Accès Dashboard Core — passe par AdminAuthScene si pas encore admin */}
        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => requestDashboard()}
          title="Dashboard Core (auth admin requise)"
          className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer relative"
          style={{
            background: dashboardOpen ? 'rgba(0,245,255,0.14)' : 'rgba(0,245,255,0.04)',
            border: `1px solid ${dashboardOpen ? 'rgba(0,245,255,0.55)' : 'rgba(0,245,255,0.15)'}`,
            boxShadow: dashboardOpen ? '0 0 14px rgba(0,245,255,0.35)' : 'none',
            transition: 'box-shadow 0.2s, background 0.2s, border-color 0.2s',
          }}
        >
          <BrainCircuit className="w-4 h-4" style={{ color: '#00f5ff' }} />
          {dashboardOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute -bottom-1 w-1.5 h-1.5 rounded-full"
              style={{ background: '#00f5ff', boxShadow: '0 0 6px #00f5ff' }}
            />
          )}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            lockSession();
            addNotification({
              type: 'info',
              title: 'Session verrouillée',
              message: 'Auth face / voix → profil foyer (ex. ta fille). Dashboard = admin seulement.',
            });
          }}
          title="Verrouiller la session"
          className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
          style={{
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.25)',
            transition: 'box-shadow 0.2s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.boxShadow = '0 0 12px rgba(239,68,68,0.35)';
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.55)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.25)';
          }}
        >
          <Lock className="w-4 h-4" style={{ color: '#ef4444' }} />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setSettingsOpen(true)}
          title="Paramètres"
          className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
          style={{
            background: 'rgba(0,245,255,0.04)',
            border: '1px solid rgba(0,245,255,0.15)',
            transition: 'box-shadow 0.2s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.boxShadow = '0 0 12px rgba(0,245,255,0.4)';
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,245,255,0.6)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,245,255,0.15)';
          }}
        >
          <Settings className="w-4 h-4" style={{ color: '#00f5ff' }} />
        </motion.button>
      </div>
    </div>
  );
}
