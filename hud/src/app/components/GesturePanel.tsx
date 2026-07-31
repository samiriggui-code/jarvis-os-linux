import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Hand, Camera, Activity, ChevronRight, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';

const orb = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };
const raj = { fontFamily: 'Rajdhani, sans-serif' };

const GESTURES = [
  { name: 'BALAYAGE DROITE', desc: 'Naviguer / Sélectionner', icon: '→', color: '#00f5ff' },
  { name: 'BALAYAGE GAUCHE', desc: 'Retour / Fermer', icon: '←', color: '#00f5ff' },
  { name: 'DEUX DOIGTS', desc: 'Défiler / Zoomer', icon: '✌', color: '#a855f7' },
  { name: 'PAUME OUVERTE', desc: 'Pause / Arrêter l\'IA', icon: '✋', color: '#f59e0b' },
  { name: 'PINCEMENT', desc: 'Fermer le panneau', icon: '🤏', color: '#ef4444' },
  { name: 'INDEX LEVÉ', desc: 'Activer la voix', icon: '☝', color: '#22c55e' },
];

// Simplified hand skeleton points
const HAND_POINTS = {
  wrist: { x: 160, y: 240 },
  thumb: [{ x: 120, y: 210 }, { x: 100, y: 185 }, { x: 82, y: 165 }, { x: 68, y: 148 }],
  index: [{ x: 148, y: 175 }, { x: 145, y: 145 }, { x: 143, y: 120 }, { x: 141, y: 100 }],
  middle: [{ x: 165, y: 170 }, { x: 163, y: 138 }, { x: 162, y: 112 }, { x: 161, y: 88 }],
  ring: [{ x: 180, y: 175 }, { x: 181, y: 145 }, { x: 182, y: 120 }, { x: 183, y: 98 }],
  pinky: [{ x: 197, y: 185 }, { x: 201, y: 160 }, { x: 205, y: 138 }, { x: 208, y: 120 }],
  palm: [{ x: 148, y: 175 }, { x: 165, y: 170 }, { x: 180, y: 175 }, { x: 197, y: 185 }, { x: 210, y: 205 }, { x: 205, y: 225 }, { x: 192, y: 240 }, { x: 175, y: 244 }, { x: 160, y: 240 }],
};

function HandSkeleton({ gesture }: { gesture: string }) {
  const isOpenPalm = gesture === 'PAUME OUVERTE';
  const isPinch = gesture === 'PINCEMENT';

  return (
    <svg width="320" height="300" viewBox="0 0 320 300" fill="none">
      {/* Palm outline */}
      <motion.polygon
        points={HAND_POINTS.palm.map(p => `${p.x},${p.y}`).join(' ')}
        fill="rgba(0,245,255,0.04)"
        stroke="rgba(0,245,255,0.25)"
        strokeWidth="1"
        animate={{ opacity: isOpenPalm ? [0.5, 1, 0.5] : 1 }}
        transition={{ duration: 1, repeat: Infinity }}
      />

      {/* Finger connections */}
      {[HAND_POINTS.thumb, HAND_POINTS.index, HAND_POINTS.middle, HAND_POINTS.ring, HAND_POINTS.pinky].map((finger, fi) => (
        <g key={fi}>
          {/* Connection from palm to finger base */}
          <line
            x1={HAND_POINTS.wrist.x} y1={HAND_POINTS.wrist.y}
            x2={finger[0].x} y2={finger[0].y}
            stroke="rgba(0,245,255,0.15)" strokeWidth="1" strokeDasharray="2 2"
          />
          {/* Finger segments */}
          {finger.map((pt, si) => si < finger.length - 1 ? (
            <motion.line
              key={si}
              x1={pt.x} y1={pt.y}
              x2={finger[si + 1].x} y2={finger[si + 1].y}
              stroke={isPinch && (fi === 0 || fi === 1) ? '#a855f7' : '#00f5ff'}
              strokeWidth="2"
              strokeLinecap="round"
              animate={{
                stroke: isPinch && (fi === 0 || fi === 1)
                  ? ['#a855f7', '#00f5ff', '#a855f7']
                  : isOpenPalm
                  ? ['#00f5ff', '#22c55e', '#00f5ff']
                  : ['#00f5ff', 'rgba(0,245,255,0.6)', '#00f5ff'],
              }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          ) : null)}
          {/* Joint dots */}
          {finger.map((pt, si) => (
            <motion.circle
              key={si}
              cx={pt.x} cy={pt.y} r={si === finger.length - 1 ? 5 : 3.5}
              fill={si === finger.length - 1 ? 'rgba(0,245,255,0.6)' : 'rgba(0,245,255,0.4)'}
              stroke="#00f5ff" strokeWidth="1"
              animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity, delay: si * 0.1 + fi * 0.05 }}
            />
          ))}
        </g>
      ))}

      {/* Wrist dot */}
      <circle cx={HAND_POINTS.wrist.x} cy={HAND_POINTS.wrist.y} r={6}
        fill="rgba(0,245,255,0.3)" stroke="#00f5ff" strokeWidth="1.5" />
    </svg>
  );
}

export function GesturePanel() {
  const { gestureOpen, setGestureOpen, openSettings, addNotification } = useApp();
  const [activeGesture, setActiveGesture] = useState(GESTURES[0].name);
  const [confidence, setConfidence] = useState(89.4);
  const [detecting, setDetecting] = useState(true);

  useEffect(() => {
    if (!gestureOpen) return;
    const interval = setInterval(() => {
      setConfidence(75 + Math.random() * 20);
      if (Math.random() > 0.85) {
        const next = GESTURES[Math.floor(Math.random() * GESTURES.length)];
        setActiveGesture(next.name);
        addNotification({ type: 'info', title: 'Geste détecté', message: `${next.name} — ${next.desc}` });
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [gestureOpen]);

  const currentGesture = GESTURES.find(g => g.name === activeGesture) || GESTURES[0];

  const openVisionSettings = () => {
    setGestureOpen(false);
    openSettings('vision');
  };

  return (
    <AnimatePresence>
      {gestureOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-center justify-center overflow-hidden p-3"
          style={{ zIndex: 170, background: 'rgba(0, 4, 12, 0.92)', backdropFilter: 'blur(12px)' }}
        >
          <motion.div
            initial={{ scale: 0.92, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 16 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col"
            style={{
              maxHeight: 'calc(100dvh - 1.5rem)',
              background: 'rgba(0, 10, 25, 0.95)',
              border: '1px solid rgba(0,245,255,0.2)',
              boxShadow: '0 0 60px rgba(0,245,255,0.1)',
            }}
          >
            {/* Header — always visible */}
            <div
              className="flex items-center justify-between px-5 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(0,245,255,0.12)', background: 'rgba(0, 10, 25, 0.98)' }}
            >
              <div className="flex items-center gap-3">
                <Hand className="w-5 h-5" style={{ color: '#00f5ff' }} />
                <div>
                  <h2 style={{ ...orb, color: '#00f5ff', fontSize: '15px', letterSpacing: '0.15em', margin: 0 }}>
                    CONTRÔLE GESTUEL
                  </h2>
                  <p style={{ ...mono, color: 'rgba(0,245,255,0.4)', fontSize: '10px', marginTop: 4 }}>
                    Holomat · preview mock — config dans Paramètres → Vision
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={openVisionSettings}
                  className="px-3 py-2 rounded-xl cursor-pointer"
                  style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.35)' }}
                >
                  <span style={{ ...mono, color: '#a855f7', fontSize: '9px' }}>PARAMÈTRES VISION</span>
                </motion.button>
                <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setGestureOpen(false)}
                className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                <X className="w-5 h-5" style={{ color: '#ef4444' }} />
              </motion.button>
              </div>
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* Camera preview */}
              <div
                className="relative overflow-hidden flex-shrink-0"
                style={{ width: '55%', minHeight: 0, background: 'rgba(0,4,12,0.8)', borderRight: '1px solid rgba(0,245,255,0.1)' }}
              >
                {/* Simulated camera feed */}
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `
                      radial-gradient(ellipse at 50% 50%, rgba(0,245,255,0.03) 0%, transparent 60%),
                      linear-gradient(rgba(0,245,255,0.02) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(0,245,255,0.02) 1px, transparent 1px)
                    `,
                    backgroundSize: '100% 100%, 20px 20px, 20px 20px',
                  }}
                />

                {/* Corner markers */}
                {[
                  { top: 12, left: 12 },
                  { top: 12, right: 12 },
                  { bottom: 12, left: 12 },
                  { bottom: 12, right: 12 },
                ].map((pos, i) => (
                  <div
                    key={i}
                    className="absolute w-5 h-5"
                    style={{
                      ...pos,
                      borderTop: i < 2 ? '1.5px solid rgba(0,245,255,0.5)' : 'none',
                      borderBottom: i >= 2 ? '1.5px solid rgba(0,245,255,0.5)' : 'none',
                      borderLeft: i % 2 === 0 ? '1.5px solid rgba(0,245,255,0.5)' : 'none',
                      borderRight: i % 2 === 1 ? '1.5px solid rgba(0,245,255,0.5)' : 'none',
                    }}
                  />
                ))}

                {/* CAMERA badge */}
                <div
                  className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full"
                  style={{ background: 'rgba(0,5,15,0.8)', border: '1px solid rgba(0,245,255,0.2)' }}
                >
                  <Camera className="w-3 h-3" style={{ color: '#00f5ff' }} />
                  <span style={{ ...mono, color: 'rgba(0,245,255,0.7)', fontSize: '9px' }}>CAMÉRA ACTIVE — 60 ips</span>
                  <motion.div animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
                </div>

                {/* Hand skeleton */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <HandSkeleton gesture={activeGesture} />
                </div>

                {/* Gesture label overlay */}
                <div
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl"
                  style={{
                    background: `${currentGesture.color}12`,
                    border: `1px solid ${currentGesture.color}40`,
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <span style={{ ...orb, color: currentGesture.color, fontSize: '11px', letterSpacing: '0.1em' }}>
                    {activeGesture}
                  </span>
                </div>
              </div>

              {/* Right panel */}
              <div className="flex-1 min-h-0 p-4 overflow-y-auto flex flex-col gap-3">
                {/* Detection status */}
                <div className="rounded-xl p-3" style={{ background: 'rgba(0,8,20,0.5)', border: '1px solid rgba(0,245,255,0.1)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5" style={{ color: '#00f5ff' }} />
                      <span style={{ ...mono, color: 'rgba(0,245,255,0.6)', fontSize: '10px' }}>ÉTAT DE DÉTECTION</span>
                    </div>
                    <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full" style={{ background: detecting ? '#22c55e' : '#ef4444' }} />
                  </div>

                  {/* Confidence meter */}
                  <div className="flex items-center justify-between mb-1">
                    <span style={{ ...mono, color: 'rgba(255,255,255,0.35)', fontSize: '9px' }}>CONFIANCE</span>
                    <motion.span
                      key={Math.round(confidence)}
                      animate={{ opacity: [0.5, 1] }}
                      style={{ ...mono, color: '#00f5ff', fontSize: '12px' }}
                    >
                      {confidence.toFixed(1)}%
                    </motion.span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      animate={{ width: `${confidence}%` }}
                      transition={{ duration: 0.5 }}
                      style={{ background: `linear-gradient(90deg, #00f5ff80, #00f5ff)`, boxShadow: '0 0 6px rgba(0,245,255,0.6)' }}
                    />
                  </div>
                </div>

                {/* Current gesture details */}
                <div className="rounded-xl p-3" style={{ background: `${currentGesture.color}08`, border: `1px solid ${currentGesture.color}25` }}>
                  <p style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: '9px', marginBottom: 4 }}>GESTE ACTIF</p>
                  <p style={{ ...raj, color: currentGesture.color, fontSize: '18px', textShadow: `0 0 10px ${currentGesture.color}` }}>
                    {currentGesture.icon} {currentGesture.name}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <ChevronRight className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
                    <span style={{ ...raj, color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>{currentGesture.desc}</span>
                  </div>
                </div>

                {/* Gesture reference */}
                <div>
                  <p style={{ ...mono, color: 'rgba(255,255,255,0.3)', fontSize: '9px', marginBottom: 8 }}>RÉFÉRENCE DES GESTES</p>
                  <div className="flex flex-col gap-1.5">
                    {GESTURES.map(g => (
                      <motion.button
                        key={g.name}
                        whileHover={{ x: 4 }}
                        onClick={() => setActiveGesture(g.name)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer"
                        style={{
                          background: g.name === activeGesture ? `${g.color}10` : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${g.name === activeGesture ? `${g.color}30` : 'transparent'}`,
                        }}
                      >
                        <span style={{ fontSize: '14px' }}>{g.icon}</span>
                        <div className="flex flex-col">
                          <span style={{ ...mono, color: g.name === activeGesture ? g.color : 'rgba(255,255,255,0.5)', fontSize: '9px' }}>{g.name}</span>
                          <span style={{ ...raj, color: 'rgba(255,255,255,0.3)', fontSize: '10px' }}>{g.desc}</span>
                        </div>
                        <Zap className="w-3 h-3 ml-auto" style={{ color: g.name === activeGesture ? g.color : 'transparent' }} />
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
