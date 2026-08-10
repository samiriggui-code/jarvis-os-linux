import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Hand, Camera, Activity, ChevronRight, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { VisionChrome, visionBody, visionCaption, visionMono } from './visionChrome';
import { GlassButton, GlassPanel } from '../../components/glass/';
import { tokens } from '../../ui/tokens';

const GESTURES = [
  { name: 'Balayage à droite', desc: 'Naviguer ou sélectionner', icon: '→', color: tokens.color.accent },
  { name: 'Balayage à gauche', desc: 'Revenir ou fermer', icon: '←', color: tokens.color.accent },
  { name: 'Deux doigts', desc: 'Défiler ou zoomer', icon: '✌', color: tokens.color.accent },
  { name: 'Paume ouverte', desc: 'Mettre l’IA en pause', icon: '✋', color: tokens.color.warning },
  { name: 'Pincement', desc: 'Fermer le panneau', icon: '🤏', color: tokens.color.danger },
  { name: 'Index levé', desc: 'Activer la voix', icon: '☝', color: tokens.color.success },
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
  const isOpenPalm = gesture === 'Paume ouverte';
  const isPinch = gesture === 'Pincement';

  return (
    <svg width="320" height="300" viewBox="0 0 320 300" fill="none">
      <motion.polygon
        points={HAND_POINTS.palm.map(p => `${p.x},${p.y}`).join(' ')}
        fill={tokens.color.accentSoft}
        stroke={tokens.color.borderActive}
        strokeWidth="1"
        animate={{ opacity: isOpenPalm ? [0.5, 1, 0.5] : 1 }}
        transition={{ duration: 1, repeat: Infinity }}
      />

      {[HAND_POINTS.thumb, HAND_POINTS.index, HAND_POINTS.middle, HAND_POINTS.ring, HAND_POINTS.pinky].map((finger, fi) => (
        <g key={fi}>
          <line
            x1={HAND_POINTS.wrist.x} y1={HAND_POINTS.wrist.y}
            x2={finger[0].x} y2={finger[0].y}
            stroke={tokens.color.border} strokeWidth="1" strokeDasharray="2 2"
          />
          {finger.map((pt, si) => si < finger.length - 1 ? (
            <motion.line
              key={si}
              x1={pt.x} y1={pt.y}
              x2={finger[si + 1].x} y2={finger[si + 1].y}
              stroke={tokens.color.accent}
              strokeWidth="2"
              strokeLinecap="round"
              animate={{ opacity: isPinch && (fi === 0 || fi === 1) ? [0.5, 1, 0.5] : [0.65, 1, 0.65] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          ) : null)}
          {finger.map((pt, si) => (
            <motion.circle
              key={si}
              cx={pt.x} cy={pt.y} r={si === finger.length - 1 ? 5 : 3.5}
              fill={tokens.color.accentSoft}
              stroke={tokens.color.accent} strokeWidth="1"
              animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity, delay: si * 0.1 + fi * 0.05 }}
            />
          ))}
        </g>
      ))}

      <circle cx={HAND_POINTS.wrist.x} cy={HAND_POINTS.wrist.y} r={6}
        fill={tokens.color.accentSoft} stroke={tokens.color.accent} strokeWidth="1.5" />
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
          style={{ zIndex: 170, backdropFilter: tokens.glass }}
        >
          <motion.div
            initial={{ scale: 0.92, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 16 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-3xl overflow-hidden flex flex-col"
            style={{ maxHeight: 'calc(100dvh - 1.5rem)' }}
          >
            <VisionChrome
              eyebrow="Système"
              title={<span className="flex items-center gap-2"><Hand className="w-5 h-5" style={{ color: tokens.color.accent }} />Gestes</span>}
              level="floating"
              trailing={<div className="flex items-center gap-2"><GlassButton tone="neutral" onClick={openVisionSettings}>Paramètres Vision</GlassButton><GlassButton tone="danger" aria-label="Fermer les gestes" onClick={() => setGestureOpen(false)} icon={<X className="w-4 h-4" />} /></div>}
            >
              <p style={{ ...visionBody, marginBottom: tokens.space.md }}>Aperçu Holomat · configuration disponible dans Paramètres → Vision.</p>
              <div className="flex flex-1 min-h-0 gap-3 overflow-hidden">
                <GlassPanel level="subtle" padding={0} className="relative overflow-hidden flex-shrink-0" style={{ width: '55%', minHeight: 360 }}>
                  <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(${tokens.color.border} 1px, transparent 1px), linear-gradient(90deg, ${tokens.color.border} 1px, transparent 1px)`, backgroundSize: '24px 24px', opacity: 0.35 }} />
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ border: `1px solid ${tokens.color.border}`, background: tokens.color.surfaceRaised }}>
                    <Camera className="w-3 h-3" style={{ color: tokens.color.accent }} />
                    <span style={visionCaption}>Caméra active · 60 ips</span>
                    <motion.div animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full" style={{ background: tokens.color.success }} />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center"><HandSkeleton gesture={activeGesture} /></div>
                  <GlassPanel level="regular" padding="sm" className="absolute bottom-4 left-1/2 -translate-x-1/2">
                    <span style={{ ...visionMono, color: currentGesture.color }}>{activeGesture}</span>
                  </GlassPanel>
                </GlassPanel>

                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
                  <GlassPanel level="subtle" padding="md">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5" style={{ color: tokens.color.accent }} />
                      <span style={visionCaption}>État de détection</span>
                    </div>
                    <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full" style={{ background: detecting ? tokens.color.success : tokens.color.danger }} />
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <span style={visionCaption}>Confiance</span>
                    <motion.span key={Math.round(confidence)} animate={{ opacity: [0.5, 1] }} style={{ ...visionMono, color: tokens.color.accent }}>{confidence.toFixed(1)}%</motion.span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: tokens.color.surfaceRaised }}><motion.div className="h-full rounded-full" animate={{ width: `${confidence}%` }} transition={{ duration: 0.5 }} style={{ background: tokens.color.accent }} /></div>
                  </GlassPanel>

                  <GlassPanel level="subtle" padding="md">
                  <p style={{ ...visionCaption, marginBottom: 4 }}>Geste actif</p>
                  <p style={{ ...visionMono, color: currentGesture.color, fontSize: 16, margin: 0 }}>{currentGesture.icon} {currentGesture.name}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <ChevronRight className="w-3 h-3" style={{ color: tokens.color.textMuted }} />
                    <span style={visionBody}>{currentGesture.desc}</span>
                  </div>
                  </GlassPanel>

                <GlassPanel level="subtle" padding="md">
                  <p style={{ ...visionCaption, marginBottom: 8 }}>Référence des gestes</p>
                  <div className="flex flex-col gap-1.5">
                    {GESTURES.map(g => (
                      <GlassButton
                        key={g.name}
                        onClick={() => setActiveGesture(g.name)}
                        active={g.name === activeGesture}
                        tone={g.color === tokens.color.danger ? 'danger' : g.color === tokens.color.warning ? 'warning' : g.color === tokens.color.success ? 'success' : 'accent'}
                        className="w-full text-left"
                        style={{
                          justifyContent: 'flex-start',
                        }}
                        icon={<span style={{ fontSize: 14 }}>{g.icon}</span>}
                      >
                        <div className="flex flex-col">
                          <span style={{ ...visionMono, color: g.name === activeGesture ? g.color : tokens.color.text }}>{g.name}</span>
                          <span style={{ ...visionBody, fontSize: 11 }}>{g.desc}</span>
                        </div>
                        <Zap className="w-3 h-3 ml-auto" style={{ color: g.name === activeGesture ? g.color : 'transparent' }} />
                      </GlassButton>
                    ))}
                  </div>
                </GlassPanel>
                </div>
              </div>
            </VisionChrome>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
