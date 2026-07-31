/**
 * AdminAuthScene — élévation des droits vers le Dashboard Admin
 * Overlay modal (pas plein écran), lit adminGateOpen depuis useApp()
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, X, Fingerprint, KeyRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FaceCamView } from './FaceCamView';
import { Orb } from '../orb';
import { speakDev, initTtsDev, stopDev } from '../../bridge/ttsDev';
import { authElevate } from '../../bridge/authClient';
import { isCoreOnline } from '../CoreBridge';
import { runFaceVerifyLive } from '../../bridge/faceAuthLive';
import { runFaceAuthFlow } from '../../engine/faceAuthSimulator';
import type { FaceHologramState } from '../../engine/faceHologramTypes';

/* ─── Fonts ─────────────────────────────────────────────────────────────────── */
const orbF = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };

const ACCENT = '#7c3aed';
const ACCENT_GLOW = 'rgba(124,58,237,0.6)';

type AdminMode = 'choice' | 'biometrie' | 'code' | 'success';

export function AdminAuthScene() {
  const { adminGateOpen, closeAdminGate, grantAdminAccess } = useApp();

  const [mode, setMode]                 = useState<AdminMode>('choice');
  const [faceProgress, setFaceProgress] = useState(0);
  const [faceState, setFaceState]       = useState<FaceHologramState>({
    progress: 0, confidence: 0, phase: 'waiting', obstruction: false, retry: 0,
  });
  const [speaking, setSpeaking]         = useState(false);
  const [hudText, setHudText]           = useState('AUTORISATION NIVEAU ADMIN');
  const [hudSub, setHudSub]             = useState('Authentification élevée requise');
  const [orbState, setOrbState]         = useState<'idle'|'thinking'|'processing'|'responding'>('thinking');
  const [codeInput, setCodeInput]       = useState('');
  const [codeDenied, setCodeDenied]     = useState(false);
  const [error, setError]               = useState('');

  const aliveRef = useRef(true);
  const ttsEnabled = import.meta.env.VITE_TTS_STUB === 'true';

  /* Ouverture : annoncer la gate admin */
  useEffect(() => {
    if (!adminGateOpen) {
      setMode('choice');
      setFaceProgress(0);
      setFaceState({ progress: 0, confidence: 0, phase: 'waiting', obstruction: false, retry: 0 });
      setHudText('AUTORISATION NIVEAU ADMIN');
      setHudSub('Authentification élevée requise');
      setOrbState('thinking');
      setCodeInput('');
      setError('');
      stopDev();
      return;
    }
    initTtsDev();
    aliveRef.current = true;
    if (ttsEnabled) {
      void speakDev('Accès Dashboard restreint. Authentification élevée requise.');
    }
    return () => { aliveRef.current = false; };
  }, [adminGateOpen, ttsEnabled]);

  /* ── Biometric flow ──────────────────────────────────────────────────────── */
  const runBiometrie = useCallback(async () => {
    setMode('biometrie');
    setHudText('SCAN BIOMÉTRIQUE AVANCÉ');
    setHudSub('Vérification élevée en cours');
    setOrbState('processing');

    try {
      const useLive = isCoreOnline();
      let ok = false;

      if (useLive) {
        const result = await runFaceVerifyLive({
          isAlive: () => aliveRef.current,
          speak: async (text) => {
            setSpeaking(true);
            if (ttsEnabled) await speakDev(text, { rate: 0.92, pitch: 0.85 });
            setSpeaking(false);
          },
          patchHud: (ht, hs) => {
            setHudText(ht);
            setHudSub(hs);
            setOrbState('processing');
          },
          patchFace: (update) => {
            setFaceState(prev => {
              const next = { ...prev, ...update };
              if (update.progress !== undefined) setFaceProgress(update.progress);
              return next;
            });
          },
        });
        ok = result.ok;
      } else {
        ok = await runFaceAuthFlow({
          ttsEnabled,
          simulateFailOnce: false,
          maxRetries: 1,
          recoverySeconds: 0,
          isAlive: () => aliveRef.current,
          speak: async (text) => {
            setSpeaking(true);
            if (ttsEnabled) await speakDev(text, { rate: 0.92, pitch: 0.85 });
            else await new Promise(r => setTimeout(r, Math.max(700, text.split(' ').length * 110)));
            setSpeaking(false);
          },
          patchHud: (ht, hs, os = 'processing') => {
            setHudText(ht);
            setHudSub(hs);
            setOrbState(os as 'idle'|'thinking'|'processing'|'responding');
          },
          patchFace: (update) => {
            setFaceState(prev => {
              const next = { ...prev, ...update };
              if (update.progress !== undefined) setFaceProgress(update.progress);
              return next;
            });
          },
        });
      }
      if (!ok) {
        setError('Authentification biométrique échouée.');
        setMode('choice');
        return;
      }
      setHudText('ACCÈS ADMIN ACCORDÉ');
      setHudSub('Chargement Dashboard');
      setOrbState('responding');
      setMode('success');
      const elev = await authElevate('face');
      if (!elev.ok) {
        setError(elev.error || 'Élévation admin refusée (rôle ADMIN requis).');
        setMode('choice');
        return;
      }
      await new Promise(r => setTimeout(r, 400));
      grantAdminAccess({ method: 'face' });
    } catch {
      if (aliveRef.current) {
        setError('Erreur lors de la vérification.');
        setMode('choice');
      }
    }
  }, [ttsEnabled, grantAdminAccess]);

  /* ── Code admin ──────────────────────────────────────────────────────────── */
  const tryCode = useCallback((code: string) => {
    void (async () => {
      // Code UI local encore accepté → elevate Core
      if (code !== '421337' && code !== '0000' && code.toLowerCase() !== 'admin') {
        setCodeDenied(true);
        setError('Code incorrect.');
        setTimeout(() => { setCodeDenied(false); setCodeInput(''); setError(''); }, 1500);
        return;
      }
      try {
        const elev = await authElevate('code');
        if (!elev.ok) {
          setError(elev.error || 'Élévation refusée');
          setCodeDenied(true);
          setTimeout(() => { setCodeDenied(false); setCodeInput(''); setError(''); }, 1500);
          return;
        }
        setHudText('CODE ACCEPTÉ');
        setHudSub('Accès admin accordé');
        setOrbState('responding');
        setMode('success');
        setTimeout(() => grantAdminAccess({ method: 'code' }), 800);
      } catch {
        setError('Core hors ligne');
      }
    })();
  }, [grantAdminAccess]);

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <AnimatePresence>
      {adminGateOpen && (
        <motion.div
          className="fixed inset-0 z-[400] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={e => { if (e.target === e.currentTarget) closeAdminGate(); }}
        >
          <motion.div
            className="relative flex flex-col items-center gap-5 w-full max-w-sm mx-4 p-6 rounded-2xl"
            style={{
              background: 'radial-gradient(ellipse at 50% 20%, #1a0a2e 0%, #020509 80%)',
              border: `1px solid ${ACCENT}40`,
              boxShadow: `0 0 60px ${ACCENT}22, 0 0 120px rgba(0,0,0,0.8)`,
            }}
            initial={{ opacity: 0, scale: 0.88, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Scanlines */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none opacity-10"
              style={{ background: 'repeating-linear-gradient(0deg,transparent 0 3px,rgba(124,58,237,0.08) 3px 6px)' }}
            />

            {/* Close */}
            <motion.button
              type="button"
              onClick={closeAdminGate}
              whileTap={{ scale: 0.9 }}
              className="absolute top-3 right-3 cursor-pointer p-1.5 rounded-lg"
              style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}
            >
              <X className="w-3.5 h-3.5" style={{ color: ACCENT }} />
            </motion.button>

            {/* Header */}
            <div className="flex flex-col items-center gap-2">
              <motion.div
                animate={{ boxShadow: [`0 0 16px ${ACCENT_GLOW}`, `0 0 32px ${ACCENT_GLOW}`, `0 0 16px ${ACCENT_GLOW}`] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}50` }}
              >
                <ShieldCheck className="w-5 h-5" style={{ color: ACCENT }} />
              </motion.div>
              <h2 style={{ ...orbF, color: ACCENT, fontSize: 13, letterSpacing: '0.28em', textShadow: `0 0 20px ${ACCENT_GLOW}` }}>
                AUTORISATION NIVEAU ADMIN
              </h2>
            </div>

            {/* Face (biometrie mode) */}
            <AnimatePresence mode="wait">
              {(mode === 'biometrie' || mode === 'success') && (
                <motion.div
                  key="bio-face"
                  className="relative"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                >
                  <FaceCamView
                    progress={faceProgress}
                    active={mode === 'biometrie'}
                    label={mode === 'success' ? 'HOLOMAT · OK' : 'HOLOMAT · CAM'}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* HUD text */}
            <AnimatePresence mode="wait">
              <motion.div
                key={hudText}
                className="text-center"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <p style={{ ...mono, color: 'rgba(255,255,255,0.75)', fontSize: 11, letterSpacing: '0.06em' }}>
                  {hudText}
                </p>
                <p style={{ ...mono, color: `${ACCENT}99`, fontSize: 9, letterSpacing: '0.1em', marginTop: 3 }}>
                  {hudSub}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  key="err"
                  style={{ ...mono, color: '#ef4444', fontSize: 9, letterSpacing: '0.1em' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Face progress */}
            <AnimatePresence>
              {mode === 'biometrie' && (
                <motion.div
                  key="bio-prog"
                  className="w-full flex flex-col gap-1.5"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex items-center justify-between">
                    <span style={{ ...mono, color: ACCENT, fontSize: 9, letterSpacing: '0.15em' }}>SCAN AVANCÉ</span>
                    <span style={{ ...mono, color: ACCENT, fontSize: 9 }}>{faceProgress}%</span>
                  </div>
                  <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: `${ACCENT}22` }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }}
                      animate={{ width: `${faceProgress}%` }}
                      transition={{ duration: 0.1 }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Code input */}
            <AnimatePresence>
              {mode === 'code' && (
                <motion.div
                  key="code-mode"
                  className="w-full flex flex-col gap-3"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <div className="flex gap-1.5 justify-center">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-8 h-10 rounded-lg flex items-center justify-center"
                        style={{
                          border: `1px solid ${codeDenied ? 'rgba(239,68,68,0.6)' : `${ACCENT}40`}`,
                          background: codeDenied ? 'rgba(239,68,68,0.08)' : `${ACCENT}08`,
                        }}
                      >
                        <span style={{ ...orbF, color: codeDenied ? '#ef4444' : '#d0b4ff', fontSize: 16 }}>
                          {codeInput[i] ? '●' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k, i) => (
                      <motion.button
                        key={i}
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        disabled={k === ''}
                        onClick={() => {
                          if (k === '⌫') setCodeInput(p => p.slice(0,-1));
                          else if (typeof k === 'number' && codeInput.length < 6) {
                            const next = codeInput + k;
                            setCodeInput(next);
                            if (next.length === 6) setTimeout(() => tryCode(next), 150);
                          }
                        }}
                        className="h-9 rounded-xl cursor-pointer flex items-center justify-center"
                        style={{
                          background: k === '' ? 'transparent' : `${ACCENT}08`,
                          border: k === '' ? 'none' : `1px solid ${ACCENT}25`,
                        }}
                      >
                        <span style={{ ...orbF, color: k === '' ? 'transparent' : '#c4a0ff', fontSize: 13 }}>{k}</span>
                      </motion.button>
                    ))}
                  </div>
                  <motion.button
                    type="button"
                    onClick={() => { setMode('choice'); setCodeInput(''); setError(''); }}
                    whileTap={{ scale: 0.97 }}
                    className="py-1.5 rounded-xl cursor-pointer"
                    style={{ border: `1px solid ${ACCENT}20`, background: 'transparent' }}
                  >
                    <span style={{ ...mono, color: `${ACCENT}80`, fontSize: 9, letterSpacing: '0.1em' }}>RETOUR</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Choice buttons */}
            <AnimatePresence>
              {mode === 'choice' && (
                <motion.div
                  key="choice"
                  className="w-full flex flex-col gap-2"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                >
                  <motion.button
                    type="button"
                    onClick={runBiometrie}
                    whileTap={{ scale: 0.97 }}
                    className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl cursor-pointer"
                    style={{ background: `${ACCENT}12`, border: `1px solid ${ACCENT}45` }}
                    whileHover={{ boxShadow: `0 0 16px ${ACCENT}30` }}
                  >
                    <Fingerprint className="w-4 h-4" style={{ color: ACCENT }} />
                    <span style={{ ...orbF, color: ACCENT, fontSize: 10, letterSpacing: '0.15em' }}>BIOMÉTRIE AVANCÉE</span>
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => { setMode('code'); setError(''); }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl cursor-pointer"
                    style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}30` }}
                    whileHover={{ boxShadow: `0 0 12px ${ACCENT}20` }}
                  >
                    <KeyRound className="w-4 h-4" style={{ color: `${ACCENT}cc` }} />
                    <span style={{ ...orbF, color: `${ACCENT}cc`, fontSize: 10, letterSpacing: '0.15em' }}>CODE ADMIN</span>
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={closeAdminGate}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-2 rounded-xl cursor-pointer"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <span style={{ ...mono, color: 'rgba(255,255,255,0.35)', fontSize: 9, letterSpacing: '0.12em' }}>ANNULER</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Orbe — complètement à gauche de l'écran */}
          <div className="absolute left-8 bottom-8 pointer-events-none">
            <div style={{ width: 72, height: 72 }}>
              <Orb state={orbState} volume={0.1} playbackVolume={0} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
