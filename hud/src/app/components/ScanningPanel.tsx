import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Scan, Zap, Eye, Activity, CheckCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { VisionChrome, visionBody, visionCaption, visionMono } from './visionChrome';
import { GlassButton, GlassPanel } from '../../components/glass/';
import { tokens } from '../../ui/tokens';

type ScanPhase = 'initializing' | 'scanning' | 'analyzing' | 'complete';

const SCAN_RESULTS = [
  { category: 'Réseau neuronal', value: 'Gemini 2.5 — précision de 98,7 %', status: 'optimal' },
  { category: 'Couche de sécurité', value: 'AES-256 + RSA-4096 — aucune menace', status: 'secure' },
  { category: 'Utilisation mémoire', value: '6,2 Go / 16 Go — 38 % utilisés', status: 'optimal' },
  { category: 'Santé réseau', value: 'Latence de 847 ms — débit de 1,2 Go/s', status: 'good' },
  { category: 'Points d’accès API', value: '4/4 services en ligne — 99,9 % de disponibilité', status: 'optimal' },
  { category: 'Moteur vocal', value: 'Modèle v2.3 — taux de reconnaissance de 94,2 %', status: 'good' },
  { category: 'Module gestuel', value: 'Flux caméra actif — confiance de 89,1 %', status: 'good' },
  { category: 'Intégrité des données', value: 'Toutes les sommes de contrôle vérifiées — zéro corruption', status: 'secure' },
];

const PHASE_LABELS: Record<ScanPhase, string> = {
  initializing: 'Initialisation',
  scanning: 'Scan en cours',
  analyzing: 'Analyse',
  complete: 'Terminé',
};

const STATUS_LABELS: Record<string, string> = {
  optimal: 'Optimal',
  secure: 'Sécurisé',
  good: 'Bon',
};

const DATA_POINTS = Array(40).fill(0).map((_, i) => ({
  x: `${(i % 8) * 12 + Math.random() * 4}%`,
  y: `${Math.floor(i / 8) * 20 + Math.random() * 12}%`,
  delay: i * 0.05,
}));

export function ScanningPanel() {
  const { scanningActive, setScanningActive, addNotification } = useApp();
  const [phase, setPhase] = useState<ScanPhase>('initializing');
  const [progress, setProgress] = useState(0);
  const [visibleResults, setVisibleResults] = useState(0);

  useEffect(() => {
    if (!scanningActive) {
      setPhase('initializing');
      setProgress(0);
      setVisibleResults(0);
      return;
    }

    let prog = 0;
    setPhase('initializing');
    const t1 = setTimeout(() => {
      setPhase('scanning');
      const progInterval = setInterval(() => {
        prog += Math.random() * 3 + 1;
        if (prog >= 100) {
          prog = 100;
          clearInterval(progInterval);
          setPhase('analyzing');
          setTimeout(() => {
            setPhase('complete');
            setVisibleResults(0);
            SCAN_RESULTS.forEach((_, i) => {
              setTimeout(() => setVisibleResults(v => v + 1), i * 200);
            });
            addNotification({ type: 'success', title: 'Scan terminé', message: 'Analyse à spectre complet terminée. Aucune anomalie détectée.' });
          }, 1200);
        }
        setProgress(Math.min(100, prog));
      }, 100);
      return () => clearInterval(progInterval);
    }, 600);

    return () => clearTimeout(t1);
  }, [scanningActive]);

  const statusColor = { optimal: tokens.color.success, secure: tokens.color.accent, good: tokens.color.warning } as const;
  const phaseColor = phase === 'complete' ? tokens.color.success : tokens.color.warning;

  return (
    <AnimatePresence>
      {scanningActive && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 200, backdropFilter: tokens.glass }}>
          <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className="w-full max-w-4xl">
            <VisionChrome
              eyebrow="Système"
              title={<span className="flex items-center gap-2"><motion.span animate={{ rotate: phase === 'scanning' || phase === 'analyzing' ? 360 : 0 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}><Scan className="w-5 h-5" style={{ color: tokens.color.accent }} /></motion.span>Scan</span>}
              level="floating"
              trailing={<div className="flex items-center gap-3"><div className="flex items-center gap-2"><motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="w-2 h-2 rounded-full" style={{ background: phaseColor }} /><span style={{ ...visionMono, color: phaseColor }}>{PHASE_LABELS[phase]}</span></div><span style={{ ...visionMono, color: tokens.color.accent, fontSize: 16 }}>{Math.round(progress)}%</span><GlassButton tone="danger" aria-label="Fermer le scan" onClick={() => setScanningActive(false)} icon={<X className="w-4 h-4" />} /></div>}
            >
              <p style={{ ...visionBody, marginBottom: tokens.space.md }}>Analyse système complète · version 2.4.1</p>
              <div className="flex gap-3" style={{ minHeight: 480 }}>
                <GlassPanel level="subtle" padding="md" className="relative overflow-hidden" style={{ width: '45%' }}>
                  <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(${tokens.color.border} 1px, transparent 1px), linear-gradient(90deg, ${tokens.color.border} 1px, transparent 1px)`, backgroundSize: '30px 30px', opacity: 0.4 }} />
                  <AnimatePresence>{phase === 'scanning' && <motion.div initial={{ top: 0 }} animate={{ top: '100%' }} transition={{ duration: 3, ease: 'linear', repeat: Infinity }} className="absolute left-0 right-0" style={{ height: 3, background: tokens.color.accent }} />}</AnimatePresence>
                  <AnimatePresence>{(phase === 'scanning' || phase === 'analyzing' || phase === 'complete') && DATA_POINTS.map((pt, i) => <motion.div key={i} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: [0, 1, 0.6], scale: 1 }} transition={{ delay: pt.delay, duration: 0.3 }} className="absolute w-1 h-1 rounded-full" style={{ left: pt.x, top: pt.y, background: tokens.color.accent }} />)}</AnimatePresence>
                  <div className="absolute inset-0 flex items-center justify-center"><motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: 'linear' }} className="w-24 h-24 rounded-full flex items-center justify-center" style={{ border: `1px solid ${tokens.color.borderActive}` }}>{phase === 'complete' ? <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}><CheckCircle className="w-8 h-8" style={{ color: tokens.color.success }} /></motion.div> : <Eye className="w-6 h-6" style={{ color: tokens.color.accent }} />}</motion.div></div>
                  <div className="absolute bottom-0 left-0 right-0 p-4"><div className="flex items-center justify-between mb-1.5"><span style={visionCaption}>Progression du scan</span><span style={{ ...visionMono, color: tokens.color.accent }}>{Math.round(progress)}%</span></div><div className="h-1.5 rounded-full overflow-hidden" style={{ background: tokens.color.surfaceRaised }}><motion.div className="h-full rounded-full" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} style={{ background: tokens.color.accent }} /></div></div>
                </GlassPanel>

                <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
                  <div className="flex items-center gap-2"><Activity className="w-4 h-4" style={{ color: tokens.color.accent }} /><span style={visionCaption}>Résultats d’analyse</span></div>
                  {phase !== 'complete' && phase !== 'analyzing' ? (
                    <div className="flex flex-col gap-3">{Array(6).fill(0).map((_, i) => <GlassPanel key={i} level="subtle" padding="md"><motion.div animate={{ opacity: [0.2, 0.55, 0.2] }} transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }}><div className="h-2 rounded mb-2" style={{ background: tokens.color.surfaceRaised, width: '50%' }} /><div className="h-2 rounded" style={{ background: tokens.color.surface, width: '80%' }} /></motion.div></GlassPanel>)}</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {SCAN_RESULTS.slice(0, visibleResults).map((r, i) => <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}><GlassPanel level="subtle" padding="md" className="flex items-center justify-between"><div><span style={visionCaption}>{r.category}</span><p style={{ ...visionBody, color: tokens.color.text, marginTop: 2 }}>{r.value}</p></div><div className="flex items-center gap-1 flex-shrink-0"><Zap className="w-3 h-3" style={{ color: statusColor[r.status as keyof typeof statusColor] }} /><span style={{ ...visionMono, color: statusColor[r.status as keyof typeof statusColor], fontSize: 10 }}>{STATUS_LABELS[r.status] ?? r.status}</span></div></GlassPanel></motion.div>)}
                      {visibleResults >= SCAN_RESULTS.length && <GlassPanel level="regular" padding="md" className="text-center"><CheckCircle className="w-5 h-5 mx-auto mb-1.5" style={{ color: tokens.color.success }} /><p style={{ ...visionMono, color: tokens.color.success, margin: 0 }}>Scan terminé</p><p style={{ ...visionBody, marginTop: 4 }}>Tous les systèmes sont opérationnels. Aucune anomalie détectée.</p></GlassPanel>}
                    </div>
                  )}
                </div>
              </div>
            </VisionChrome>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
