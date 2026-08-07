/**
 * LockScene — re-authentification après soft-lock (kiosk / maison).
 * Face only — pas de PIN (TV Linux sans clavier utile ; surfaces = affichage).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FaceCamView } from './FaceCamView';
import { Orb } from '../orb';
import { speakDev, initTtsDev, stopDev } from '../../bridge/ttsDev';
import {
  ExperienceOrchestrator,
  type OrchestratorState,
} from '../../engine/experienceOrchestrator';
import { authLogin } from '../../bridge/authClient';
import { runFaceVerifyLive } from '../../bridge/faceAuthLive';
import { getCoreClient } from '../../bridge/coreClient';
import { isCoreOnline } from '../CoreBridge';

const orbF = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };

interface Props {
  onUnlock?: () => void;
}

export function LockScene({ onUnlock }: Props) {
  const { unlockSession } = useApp();

  const [faceProgress, setFaceProgress] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [permanentDeny, setPermanentDeny] = useState(false);
  const [orchState, setOrchState] = useState<OrchestratorState>({
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

  const orchRef = useRef<ExperienceOrchestrator | null>(null);
  const aliveRef = useRef(true);
  const failRef = useRef(0);
  const denyRef = useRef(false);
  const faceHitRef = useRef<{ user_id?: string; username?: string; confidence?: number } | null>(null);
  const unlockRef = useRef(unlockSession);
  unlockRef.current = unlockSession;

  const ttsEnabled = import.meta.env.VITE_TTS_STUB === 'true';

  const coreUnlock = useCallback(async (meta: { method: string; user_id?: string; username?: string }) => {
    try {
      const res = await authLogin({
        username: meta.username,
        user_id: meta.user_id,
        method: meta.method,
        confidence: 0.95,
      });
      if (!res.ok) return false;
      unlockRef.current({ method: meta.method, user: res.event?.user, cinematic: false });
      try {
        getCoreClient().send({ type: 'auth', action: 'sequence_start', sequence: 'unlock' });
      } catch { /* */ }
      onUnlock?.();
      return true;
    } catch {
      return false;
    }
  }, [onUnlock]);

  useEffect(() => {
    initTtsDev();
    aliveRef.current = true;

    const STEPS = [
      {
        id: 'locked',
        hudText: 'SESSION VERROUILLÉE',
        hudSubtext: 'Présence requise',
        orbState: 'thinking' as const,
        avatarMode: 'idle' as const,
        minDuration: 400,
        pauseAfter: 200,
        onEnter: () => {
          try {
            getCoreClient().send({
              type: 'auth',
              action: 'sequence_start',
              sequence: 'unlock',
              id: 'lock_announce',
            });
          } catch { /* */ }
        },
      },
      {
        id: 'face_scan',
        hudText: 'VÉRIFICATION BIOMÉTRIQUE',
        hudSubtext: 'Placez-vous face à la caméra',
        orbState: 'processing' as const,
        avatarMode: 'scanning' as const,
        waitForAsync: async () => {
          if (!aliveRef.current) return;

          // Boucle face — jamais de PIN. Soft-fail → réessai.
          while (aliveRef.current && !denyRef.current) {
            setFaceProgress(0);
            if (isCoreOnline()) {
              const result = await runFaceVerifyLive({
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
              if (result.ok) {
                setFaceProgress(100);
                faceHitRef.current = {
                  user_id: result.user_id,
                  username: result.username,
                  confidence: result.confidence,
                };
                return;
              }
              const noFace =
                result.reason === 'no_face' ||
                result.reason === 'timeout' ||
                result.reason === 'no_camera';
              const next = failRef.current + (noFace ? 0 : 1);
              if (!noFace) {
                failRef.current = next;
                setFailCount(next);
                if (next >= 5) {
                  denyRef.current = true;
                  setPermanentDeny(true);
                  return;
                }
              }
              orchRef.current?.patchHud({
                hudText: noFace ? 'PRÉSENCE REQUISE' : 'IDENTITÉ NON CONFIRMÉE',
                hudSubtext: noFace
                  ? 'Placez-vous face à la caméra'
                  : `Réessayez — tentatives ${next}/5`,
              });
              await new Promise((r) => setTimeout(r, 1200));
              continue;
            }
            // Core offline : simulation locale courte puis unlock impossible.
            for (let i = 0; i <= 100; i += 3) {
              if (!aliveRef.current) return;
              await new Promise((r) => setTimeout(r, 40));
              setFaceProgress(i);
            }
            orchRef.current?.patchHud({
              hudText: 'CORE HORS LIGNE',
              hudSubtext: 'Impossible de déverrouiller sans Core',
            });
            await new Promise((r) => setTimeout(r, 2000));
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
    const unsub = orch.subscribe((s) => setOrchState({ ...s }));
    orch.load(STEPS);
    void orch.run().catch((err) => console.debug('[lock] orchestrator stopped', err));

    return () => {
      aliveRef.current = false;
      unsub();
      orch.stop();
      orchRef.current = null;
      stopDev();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unlockedVisual = faceProgress >= 100 || orchState.currentStep?.id === 'face_ok';
  const lockColor = unlockedVisual ? '#22c55e' : '#ef4444';

  return (
    <motion.div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: unlockedVisual
          ? 'radial-gradient(ellipse at 50% 30%, #071a0e 0%, #020509 70%)'
          : 'radial-gradient(ellipse at 50% 30%, #120707 0%, #020509 70%)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          background: unlockedVisual
            ? 'repeating-linear-gradient(0deg,transparent 0 3px,rgba(34,197,94,0.04) 3px 6px)'
            : 'repeating-linear-gradient(0deg,transparent 0 3px,rgba(239,68,68,0.04) 3px 6px)',
        }}
      />

      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <div
          key={c}
          className="absolute w-8 h-8 pointer-events-none"
          style={{
            top: c.startsWith('t') ? 16 : undefined,
            bottom: c.startsWith('b') ? 16 : undefined,
            left: c.endsWith('l') ? 16 : undefined,
            right: c.endsWith('r') ? 16 : undefined,
            borderTop: c.startsWith('t') ? `2px solid ${unlockedVisual ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}` : undefined,
            borderBottom: c.startsWith('b') ? `2px solid ${unlockedVisual ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}` : undefined,
            borderLeft: c.endsWith('l') ? `2px solid ${unlockedVisual ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}` : undefined,
            borderRight: c.endsWith('r') ? `2px solid ${unlockedVisual ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}` : undefined,
          }}
        />
      ))}

      <div className="flex flex-col items-center gap-5 w-full max-w-sm px-6">
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
                Trop d&apos;échecs visage.<br />Rechargez le kiosk ou contactez l&apos;admin.
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
                    <p
                      style={{
                        ...mono,
                        color: unlockedVisual ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.5)',
                        fontSize: 9,
                        letterSpacing: '0.1em',
                        marginTop: 3,
                      }}
                    >
                      {orchState.hudSubtext}
                    </p>
                  )}
                </motion.div>
              </AnimatePresence>

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
                      <span style={{ ...mono, color: lockColor, fontSize: 9, letterSpacing: '0.18em' }}>
                        VISAGE UNIQUEMENT
                      </span>
                      <span style={{ ...mono, color: lockColor, fontSize: 9 }}>{faceProgress}%</span>
                    </div>
                    <div
                      className="w-full h-1 rounded-full overflow-hidden"
                      style={{ background: unlockedVisual ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}
                    >
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: lockColor, boxShadow: `0 0 8px ${lockColor}` }}
                        animate={{ width: `${faceProgress}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>
                    {failCount > 0 && (
                      <p style={{ ...mono, color: 'rgba(239,68,68,0.55)', fontSize: 9, textAlign: 'center' }}>
                        Échecs identité : {failCount}/5
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
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
          <Orb state={unlockedVisual ? 'idle' : 'thinking'} volume={0.15} playbackVolume={0} />
        </div>
      </motion.div>
    </motion.div>
  );
}
