/**
 * LockScene — re-authentification après verrouillage session
 * Phases : locked → face_reauth → success | denied_permanent
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Unlock, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FaceCamView } from './FaceCamView';
import { Orb } from '../orb';
import { speakDev, initTtsDev, stopDev } from '../../bridge/ttsDev';
import {
  ExperienceOrchestrator,
  type OrchestratorState,
  type SceneStep,
} from '../../engine/experienceOrchestrator';
import { authLogin, getEnrollPin } from '../../bridge/authClient';
import { runFaceVerifyLive } from '../../bridge/faceAuthLive';
import { getCoreClient } from '../../bridge/coreClient';
import { isCoreOnline } from '../CoreBridge';

/* ─── Fonts ─────────────────────────────────────────────────────────────────── */
const orbF = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };

interface Props {
  onUnlock?: () => void;
}

export function LockScene({ onUnlock }: Props) {
  const { unlockSession } = useApp();

  const [faceProgress, setFaceProgress] = useState(0);
  const [pinMode, setPinMode]           = useState(false);
  const [pin, setPin]                   = useState('');
  const [pinDenied, setPinDenied]       = useState(false);
  const [failCount, setFailCount]       = useState(0);
  const [permanentDeny, setPermanentDeny] = useState(false);
  const [orchState, setOrchState]       = useState<OrchestratorState>({
    stepIndex: -1,
    currentStep: null,
    isRunning: false,
    isSpeaking: false,
    isWaitingForUser: false,
    hudText: 'SESSION VERROUILLÉE',
    hudSubtext: '',
    orbState: 'thinking',
    avatarMode: 'idle',
  });

  const orchRef   = useRef<ExperienceOrchestrator | null>(null);
  const aliveRef  = useRef(true);
  const failRef   = useRef(0);
  const unlockRef = useRef(unlockSession);
  unlockRef.current = unlockSession;
  const faceHitRef = useRef<{ user_id?: string; username?: string; confidence: number } | null>(null);

  const coreUnlock = useCallback(async (meta: { method: string; pin?: string; user_id?: string; username?: string }) => {
    try {
      const res = await authLogin({
        username: meta.username || undefined,
        user_id: meta.user_id,
        pin: meta.pin,
        method: meta.method,
        confidence: meta.pin ? 1 : 0.95,
      });
      if (!res.ok) return false;
      unlockRef.current({ method: meta.method, user: res.event?.user, cinematic: false });
      // Voix de reprise — APRÈS login, avec le bon profil (monsieur / prénom enfant).
      try {
        getCoreClient().send({ type: 'auth', action: 'sequence_start', sequence: 'unlock' });
      } catch { /* */ }
      onUnlock?.();
      return true;
    } catch {
      return false;
    }
  }, [onUnlock]);

  const ttsEnabled = import.meta.env.VITE_TTS_STUB === 'true';

  useEffect(() => {
    initTtsDev();
    aliveRef.current = true;
    if (orchRef.current) return;

    // Pas de sequence_start ici.
    // · unlock trop tôt → mauvais prénom (Inès) sans session active
    // · lock ici → « à bientôt » rejoué à chaque refresh soft-lock
    // Lock : Core `_execute_hud` / sequence_start depuis lockSession.
    // Unlock : après authLogin réussi (ci-dessous).

    const STEPS: SceneStep[] = [
      {
        id: 'lock_announce',
        hudText: 'VERROUILLAGE EFFECTUÉ',
        hudSubtext: 'Retour à l’écran de verrouillage',
        voiceLine: 'Verrouillage de l’écran principal effectué.',
        orbState: 'thinking' as const,
        avatarMode: 'idle' as const,
        minDuration: 700,
        pauseAfter: 220,
      },
      {
        id: 'face_prompt',
        hudText: 'SESSION VERROUILLÉE',
        hudSubtext: 'Présence famille — reconnaissance',
        voiceLine: 'Session verrouillée. Placez-vous face à la caméra.',
        orbState: 'listening' as const,
        avatarMode: 'listening' as const,
        minDuration: 600,
        pauseAfter: 200,
      },
      {
        id: 'face_scan',
        hudText: 'VÉRIFICATION IDENTITÉ',
        hudSubtext: 'Analyse faciale en cours',
        voiceLine: 'Scan biométrique en cours.',
        orbState: 'processing' as const,
        avatarMode: 'scanning' as const,
        waitForAsync: async () => {
          if (!aliveRef.current) return;
          if (isCoreOnline()) {
            const result = await runFaceVerifyLive({
              // Pas de username : 1:N famille — fille / femme / belle-sœur
              // peuvent reprendre la session au déverrouillage.
              reason: 'unlock',
              isAlive: () => aliveRef.current,
              patchFace: (u) => {
                if (u.progress !== undefined) setFaceProgress(u.progress);
              },
              patchHud: (hudText, hudSubtext) => {
                orchRef.current?.patchHud({ hudText, hudSubtext });
              },
              speak: async (t) => { if (ttsEnabled) await speakDev(t); },
            });
            if (!result.ok) {
              // Pas de throw : PIN reste disponible. Présence absente ≠ échec permanent.
              const noFace = result.reason === 'no_face' || result.reason === 'timeout' || result.reason === 'no_camera';
              orchRef.current?.patchHud({
                hudText: noFace ? 'PRÉSENCE REQUISE' : 'IDENTITÉ NON CONFIRMÉE',
                hudSubtext: noFace
                  ? 'Placez-vous face à la caméra, ou utilisez le PIN'
                  : 'Réessayez ou utilisez le code PIN',
              });
              setPinMode(true);
              await new Promise<void>((resolve) => {
                const id = setInterval(() => {
                  if (!aliveRef.current) {
                    clearInterval(id);
                    resolve();
                  }
                }, 250);
              });
              return;
            }
            setFaceProgress(100);
            faceHitRef.current = {
              user_id: result.user_id,
              username: result.username,
              confidence: result.confidence,
            };
            return;
          }
          for (let i = 0; i <= 100; i += 3) {
            if (!aliveRef.current) return;
            await new Promise(r => setTimeout(r, 40));
            setFaceProgress(i);
          }
        },
      },
      {
        id: 'face_ok',
        hudText: 'IDENTITÉ CONFIRMÉE',
        hudSubtext: 'Restauration session',
        voiceLine: 'Identité confirmée. Session restaurée.',
        orbState: 'responding' as const,
        avatarMode: 'ok' as const,
        minDuration: 600,
        pauseAfter: 300,
        onComplete: () => {
          const stash = faceHitRef.current;
          if (!stash?.user_id && !stash?.username) return;
          void coreUnlock({
            method: 'face_reauth',
            user_id: stash?.user_id,
            username: stash?.username,
          });
        },
      },
    ];

    const orch = new ExperienceOrchestrator({ ttsEnabled, speakFn: speakDev, stopFn: stopDev });
    orchRef.current = orch;
    const unsub = orch.subscribe(s => setOrchState({ ...s }));
    orch.load(STEPS);
    void orch.run().catch(err => console.debug('[lock] orchestrator stopped', err));

    return () => {
      aliveRef.current = false;
      unsub();
      orch.stop();
      orchRef.current = null;
      stopDev();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── PIN backup → Core ───────────────────────────────────────────────────── */
  const tryPin = useCallback(() => {
    if (permanentDeny) return;
    const pinCode = pin.trim().toLowerCase() === 'jarvis' ? getEnrollPin() : pin.trim();
    void (async () => {
      const ok = await coreUnlock({ method: 'pin', pin: pinCode || getEnrollPin() });
      if (!ok) {
        const next = failRef.current + 1;
        failRef.current = next;
        setFailCount(next);
        setPinDenied(true);
        setTimeout(() => setPinDenied(false), 1500);
        if (next >= 3) setPermanentDeny(true);
      }
      setPin('');
    })();
  }, [pin, permanentDeny, coreUnlock]);

  /* ── Dérivés ─────────────────────────────────────────────────────────────── */
  const faceMode = orchState.currentStep?.id === 'face_scan'
    ? 'scanning' as const
    : faceProgress >= 100
      ? 'ok' as const
      : 'denied' as const;
  const unlockedVisual = faceProgress >= 100 || orchState.currentStep?.id === 'face_ok';
  const lockColor = unlockedVisual ? '#22c55e' : '#ef4444';

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <motion.div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: unlockedVisual ? 'radial-gradient(ellipse at 50% 30%, #071a0e 0%, #020509 70%)' : 'radial-gradient(ellipse at 50% 30%, #120707 0%, #020509 70%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{ background: unlockedVisual ? 'repeating-linear-gradient(0deg,transparent 0 3px,rgba(34,197,94,0.04) 3px 6px)' : 'repeating-linear-gradient(0deg,transparent 0 3px,rgba(239,68,68,0.04) 3px 6px)' }}
      />

      {/* Corner brackets */}
      {(['tl','tr','bl','br'] as const).map(c => (
        <div
          key={c}
          className="absolute w-8 h-8 pointer-events-none"
          style={{
            top:    c.startsWith('t') ? 16 : undefined,
            bottom: c.startsWith('b') ? 16 : undefined,
            left:   c.endsWith('l')   ? 16 : undefined,
            right:  c.endsWith('r')   ? 16 : undefined,
            borderTop:    c.startsWith('t') ? `2px solid ${unlockedVisual ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}` : undefined,
            borderBottom: c.startsWith('b') ? `2px solid ${unlockedVisual ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}` : undefined,
            borderLeft:   c.endsWith('l')   ? `2px solid ${unlockedVisual ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}` : undefined,
            borderRight:  c.endsWith('r')   ? `2px solid ${unlockedVisual ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}` : undefined,
          }}
        />
      ))}

      <div className="flex flex-col items-center gap-5 w-full max-w-sm px-6">

        {/* Permanent deny */}
        <AnimatePresence>
          {permanentDeny && (
            <motion.div
              key="perm-deny"
              className="flex flex-col items-center gap-3 text-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <ShieldAlert className="w-12 h-12" style={{ color: '#ef4444' }} />
              <p style={{ ...orbF, color: '#ef4444', fontSize: 13, letterSpacing: '0.25em', textShadow: '0 0 20px #ef444488' }}>
                ACCÈS REFUSÉ
              </p>
              <p style={{ ...mono, color: 'rgba(255,255,255,0.5)', fontSize: 10, letterSpacing: '0.08em' }}>
                Accès définitivement refusé.<br />Contacter l'administrateur.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!permanentDeny && (
            <motion.div
              key="auth-content"
              className="flex flex-col items-center gap-5 w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Header pulsant */}
              <motion.div
                className="flex items-center justify-center"
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                <Lock className="w-7 h-7" style={{ color: lockColor, filter: `drop-shadow(0 0 16px ${lockColor})` }} />
              </motion.div>

              <FaceCamView
                progress={faceProgress}
                active={orchState.currentStep?.id === 'face_scan' || faceProgress < 100}
                label="HOLOMAT · CAM"
              />

              {/* Message HUD */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={orchState.hudText}
                  className="text-center"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <p style={{ ...mono, color: 'rgba(255,255,255,0.75)', fontSize: 12, letterSpacing: '0.06em' }}>
                    {orchState.hudText}
                  </p>
                  {orchState.hudSubtext && (
                    <p style={{ ...mono, color: unlockedVisual ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.5)', fontSize: 9, letterSpacing: '0.1em', marginTop: 3 }}>
                      {orchState.hudSubtext}
                    </p>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Progress barre scan */}
              <AnimatePresence>
                {orchState.currentStep?.id === 'face_scan' && (
                  <motion.div
                    key="face-prog"
                    className="w-full flex flex-col gap-1.5"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="flex items-center justify-between">
                      <span style={{ ...mono, color: lockColor, fontSize: 9, letterSpacing: '0.18em' }}>VÉRIFICATION BIOMÉTRIQUE</span>
                      <span style={{ ...mono, color: lockColor, fontSize: 9 }}>{faceProgress}%</span>
                    </div>
                    <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: unlockedVisual ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: lockColor, boxShadow: `0 0 8px ${lockColor}` }}
                        animate={{ width: `${faceProgress}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Séparateur */}
              <div className="w-full flex items-center gap-3">
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                <span style={{ ...mono, color: 'rgba(255,255,255,0.2)', fontSize: 8, letterSpacing: '0.15em' }}>OU</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
              </div>

              {/* PIN backup */}
              {!pinMode ? (
                <motion.button
                  type="button"
                  onClick={() => setPinMode(true)}
                  whileTap={{ scale: 0.97 }}
                  className="px-4 py-2 rounded-xl cursor-pointer"
                  style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}
                >
                  <span style={{ ...mono, color: 'rgba(239,68,68,0.7)', fontSize: 9, letterSpacing: '0.1em' }}>
                    CODE PIN BACKUP
                  </span>
                </motion.button>
              ) : (
                <motion.div
                  className="w-full flex flex-col gap-2"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex gap-2">
                    {[0,1,2,3].map(i => (
                      <div
                        key={i}
                        className="flex-1 h-10 rounded-xl flex items-center justify-center"
                        style={{
                          border: `1px solid ${pinDenied ? 'rgba(239,68,68,0.6)' : 'rgba(239,68,68,0.25)'}`,
                          background: pinDenied ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0.3)',
                        }}
                      >
                        <span style={{ ...orbF, color: pinDenied ? '#ef4444' : '#cfeefb', fontSize: 18 }}>
                          {pin[i] ? '●' : ''}
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
                          if (k === '⌫') setPin(p => p.slice(0,-1));
                          else if (typeof k === 'number' && pin.length < 4) {
                            const next = pin + k;
                            setPin(next);
                            if (next.length === 4) setTimeout(() => {
                              const isOk = next === '1234';
                              if (isOk) { void coreUnlock({ method: 'face_reauth' }); }
                              else {
                                const nf = failRef.current + 1;
                                failRef.current = nf;
                                setFailCount(nf);
                                setPinDenied(true);
                                setTimeout(() => { setPinDenied(false); setPin(''); }, 1000);
                                if (nf >= 3) setPermanentDeny(true);
                              }
                            }, 200);
                          }
                        }}
                        className="h-10 rounded-xl cursor-pointer flex items-center justify-center"
                        style={{
                          background: k === '' ? 'transparent' : 'rgba(239,68,68,0.06)',
                          border: k === '' ? 'none' : '1px solid rgba(239,68,68,0.2)',
                        }}
                      >
                        <span style={{ ...orbF, color: k === '' ? 'transparent' : '#ef9b9b', fontSize: 14 }}>{k}</span>
                      </motion.button>
                    ))}
                  </div>
                  {failCount > 0 && failCount < 3 && (
                    <p style={{ ...mono, color: 'rgba(239,68,68,0.6)', fontSize: 9, textAlign: 'center', letterSpacing: '0.1em' }}>
                      Tentatives restantes : {3 - failCount}
                    </p>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div
        className="absolute right-8 bottom-8 flex flex-col items-center gap-1 pointer-events-none"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div style={{ width: 72, height: 72 }}>
          <Orb state={orchState.orbState} volume={0.1} playbackVolume={0} />
        </div>
      </motion.div>
    </motion.div>
  );
}
