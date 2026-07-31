/**
 * FirstSetupScene — scène de première configuration (aucun profil existant)
 * Phases : boot → username → face_capture → voice_enroll → complete
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, User, ChevronRight, Check, RotateCcw } from 'lucide-react';
import { FaceCamPanel } from './FaceCamPanel';
import { Orb } from '../orb';
import { speakDev, initTtsDev, stopDev } from '../../bridge/ttsDev';
import {
  ExperienceOrchestrator,
  type OrchestratorState,
  type SceneStep,
} from '../../engine/experienceOrchestrator';
import { commitFaceEnroll } from '../../bridge/faceAuthLive';
import { authEnroll } from '../../bridge/authClient';

/* ─── Fonts ─────────────────────────────────────────────────────────────────── */
const orbF = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };

/* ─── Types ─────────────────────────────────────────────────────────────────── */
type SetupPhase =
  | 'boot'
  | 'username'
  | 'face_capture'
  | 'voice_enroll'
  | 'complete';

interface Props {
  onComplete?: () => void;
}

/* ─── Composant ─────────────────────────────────────────────────────────────── */
export function FirstSetupScene({ onComplete }: Props) {
  const [phase, setPhase]               = useState<SetupPhase>('boot');
  const [username, setUsername]         = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameSubmitting, setUsernameSubmitting] = useState(false);
  const [awaitingNameApproval, setAwaitingNameApproval] = useState(false);
  const [nameRetryHint, setNameRetryHint] = useState(false);
  const [faceProgress, setFaceProgress] = useState(0);
  const [voiceReady, setVoiceReady]     = useState(false);
  const [orchState, setOrchState]       = useState<OrchestratorState>({
    stepIndex: -1,
    currentStep: null,
    isRunning: false,
    isSpeaking: false,
    isWaitingForUser: false,
    hudText: 'JARVIS INITIALIZING',
    hudSubtext: '',
    orbState: 'thinking',
    avatarMode: 'idle',
  });

  const orchRef   = useRef<ExperienceOrchestrator | null>(null);
  const aliveRef  = useRef(true);
  const usernameRef = useRef('');
  const faceEnrollResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const ttsEnabled = import.meta.env.VITE_TTS_STUB === 'true';

  /* ── Montage : boot + steps ──────────────────────────────────────────────── */
  useEffect(() => {
    initTtsDev();
    aliveRef.current = true;
    if (orchRef.current) return;

    const STEPS: SceneStep[] = [
      /* BOOT */
      {
        id: 'boot_0',
        hudText: 'JARVIS INITIALIZING',
        hudSubtext: 'PREMIER DÉMARRAGE',
        orbState: 'thinking' as const,
        avatarMode: 'idle' as const,
        minDuration: 800,
        pauseAfter: 300,
      },
      {
        id: 'boot_1',
        hudText: 'AUCUN PROFIL DÉTECTÉ',
        hudSubtext: 'Protocole d\'enrôlement requis',
        voiceLine: 'Aucun profil détecté. Initialisation du protocole d\'enrôlement.',
        orbState: 'processing' as const,
        avatarMode: 'idle' as const,
        minDuration: 200,
        pauseAfter: 0,
        onComplete: () => setPhase('username'),
      },
      /* USERNAME */
      {
        id: 'username_prompt',
        hudText: 'ENREGISTREMENT IDENTITÉ',
        hudSubtext: 'Saisissez votre identifiant',
        voiceLine: 'Veuillez choisir un nom de profil et le saisir. Ce nom sera associé à votre empreinte biométrique.',
        orbState: 'listening' as const,
        avatarMode: 'listening' as const,
        waitForUser: true,
      },
      /* FACE CAPTURE */
      {
        id: 'face_intro',
        hudText: 'CALIBRATION BIOMÉTRIQUE',
        hudSubtext: 'Activation caméra Holomat',
        voiceLine: 'Positionnez-vous face à la caméra. Calibration biométrique en cours.',
        orbState: 'processing' as const,
        avatarMode: 'scanning' as const,
        pauseAfter: 400,
        onEnter: () => {
          // Allume l’UI caméra tout de suite (preview), avant le scan
          setPhase('face_capture');
          setFaceProgress(0);
          void import('../../bridge/mediaDevices').then(m => m.ensureCamera());
        },
      },
      {
        id: 'face_scan',
        hudText: 'SCAN FACIAL',
        hudSubtext: 'Acquisition des données biométriques',
        orbState: 'processing' as const,
        avatarMode: 'scanning' as const,
        waitForAsync: async () => {
          if (!aliveRef.current) return;
          setPhase('face_capture');
          // FaceCamPanel envoie les frames Holomat
          const ok = await new Promise<boolean>((resolve) => {
            faceEnrollResolveRef.current = resolve;
            setTimeout(() => {
              if (faceEnrollResolveRef.current === resolve) {
                faceEnrollResolveRef.current = null;
                resolve(false);
              }
            }, 50_000);
          });
          if (!aliveRef.current) return;
          if (!ok) throw new Error('face_enroll_failed');
          setFaceProgress(100);
        },
      },
      {
        id: 'face_ok',
        hudText: 'EMPREINTE FACIALE ENREGISTRÉE',
        hudSubtext: 'Données biométriques sécurisées',
        voiceLine: 'Empreinte faciale enregistrée avec succès.',
        orbState: 'responding' as const,
        avatarMode: 'ok' as const,
        minDuration: 1000,
        pauseAfter: 400,
      },
      /* VOICE ENROLL */
      {
        id: 'voice_intro',
        hudText: 'ENRÔLEMENT VOCAL',
        hudSubtext: 'Enregistrement empreinte vocale',
        voiceLine: 'Dites votre phrase d\'activation pour enregistrer votre empreinte vocale.',
        orbState: 'listening' as const,
        avatarMode: 'listening' as const,
        pauseAfter: 300,
        onComplete: () => setPhase('voice_enroll'),
      },
      {
        id: 'voice_wait',
        hudText: 'EN ATTENTE DE VOTRE VOIX',
        hudSubtext: 'Dites : « Jarvis, active-toi »',
        orbState: 'listening' as const,
        avatarMode: 'listening' as const,
        waitForUser: true,
        onComplete: () => setVoiceReady(true),
      },
      {
        id: 'voice_process',
        hudText: 'ANALYSE VOCALE',
        hudSubtext: 'Création empreinte sonore unique',
        voiceLine: 'Empreinte vocale enregistrée. Calibration terminée.',
        orbState: 'processing' as const,
        avatarMode: 'scanning' as const,
        minDuration: 1800,
        pauseAfter: 400,
      },
      /* COMPLETE */
      {
        id: 'complete',
        hudText: 'PROFIL CRÉÉ',
        hudSubtext: '',
        orbState: 'responding' as const,
        avatarMode: 'ok' as const,
        minDuration: 600,
        pauseAfter: 800,
        onEnter: () => setPhase('complete'),
        onComplete: () => {
          const name = usernameRef.current || 'admin';
          void (async () => {
            try {
              const res = await authEnroll({
                username: name,
                display_name: name,
                pin: '0000',
                face: true,
                voice: true,
              });
              if (!res.ok || !res.user?.id) {
                console.warn('[first-setup] enroll failed', res.error);
              } else {
                const committed = await commitFaceEnroll(name, res.user.id);
                console.info('[first-setup] enrolled', res.user, 'face_commit', committed);
              }
            } catch (e) {
              console.warn('[first-setup] Core enroll impossible', e);
            }
            try { localStorage.setItem('jarvis_first_run', '1'); } catch { /* legacy mirror */ }
            onComplete?.();
          })();
        },
      },
    ];

    const orch = new ExperienceOrchestrator({ ttsEnabled, speakFn: speakDev, stopFn: stopDev });
    orchRef.current = orch;
    const unsub = orch.subscribe(s => setOrchState({ ...s }));
    orch.load(STEPS);
    void orch.run().catch(err => console.debug('[first-setup] orchestrator stopped', err));

    return () => {
      aliveRef.current = false;
      unsub();
      orch.stop();
      orchRef.current = null;
      stopDev();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Confirmation username ───────────────────────────────────────────────── */
  const confirmUsername = useCallback(async () => {
    const v = usernameInput.trim();
    if (!v || usernameSubmitting) return;
    setUsernameSubmitting(true);
    setNameRetryHint(false);
    setUsername(v);
    usernameRef.current = v;
    try {
      const ackLine = `Nom de profil choisi : ${v}. Est-ce bien prononcé ?`;
      if (ttsEnabled) {
        await speakDev(ackLine);
      } else {
        await new Promise(r => setTimeout(r, 1600));
      }
      if (aliveRef.current) setAwaitingNameApproval(true);
    } finally {
      if (aliveRef.current) setUsernameSubmitting(false);
    }
  }, [ttsEnabled, usernameInput, usernameSubmitting]);

  const approveUsername = useCallback(async () => {
    if (!usernameRef.current || usernameSubmitting) return;
    setUsernameSubmitting(true);
    try {
      const ackLine = `Profil ${usernameRef.current} validé. Poursuite de la procédure d'enrôlement biométrique.`;
      if (ttsEnabled) {
        await speakDev(ackLine);
      } else {
        await new Promise(r => setTimeout(r, 1400));
      }
      setAwaitingNameApproval(false);
      // Pré-chauffe caméra pendant la voix / transition biométrique
      void import('../../bridge/mediaDevices').then(m => m.ensureCamera()).catch(() => null);
      orchRef.current?.userConfirm();
    } finally {
      if (aliveRef.current) setUsernameSubmitting(false);
    }
  }, [ttsEnabled, usernameSubmitting]);

  const retryUsername = useCallback(async () => {
    setAwaitingNameApproval(false);
    setUsername('');
    usernameRef.current = '';
    setUsernameInput('');
    setNameRetryHint(true);
    if (ttsEnabled) {
      await speakDev('Veuillez parler avec une voix claire pour l’enregistrement du nom de profil.');
    }
  }, [ttsEnabled]);

  /* ── Dérivés visuels ─────────────────────────────────────────────────────── */
  const accentColor = phase === 'complete' ? '#22c55e' : '#00e5ff';

  const displayName = username || usernameRef.current;

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <motion.div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 30%, #071828 0%, #020509 70%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{ background: 'repeating-linear-gradient(0deg,transparent 0 3px,rgba(0,229,255,0.04) 3px 6px)' }}
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
            borderTop:    c.startsWith('t') ? `2px solid ${accentColor}40` : undefined,
            borderBottom: c.startsWith('b') ? `2px solid ${accentColor}40` : undefined,
            borderLeft:   c.endsWith('l')   ? `2px solid ${accentColor}40` : undefined,
            borderRight:  c.endsWith('r')   ? `2px solid ${accentColor}40` : undefined,
          }}
        />
      ))}

      <div className="flex flex-col items-center gap-5 w-full max-w-md px-6">
        {/* Header */}
        <div className="text-center">
          <h1 style={{ ...orbF, color: accentColor, fontSize: 'clamp(18px,3.5vw,28px)', letterSpacing: '0.38em', textShadow: `0 0 30px ${accentColor}66` }}>
            J.A.R.V.I.S
          </h1>
          <p style={{ ...mono, color: 'rgba(0,229,255,0.4)', fontSize: 9, letterSpacing: '0.25em', marginTop: 6 }}>
            PROTOCOLE D'ENRÔLEMENT — PREMIER DÉMARRAGE
          </p>
        </div>

        {/* Phase indicator */}
        <div className="flex gap-2 items-center">
          {(['boot','username','face_capture','voice_enroll','complete'] as SetupPhase[]).map((p, i) => {
            const phases: SetupPhase[] = ['boot','username','face_capture','voice_enroll','complete'];
            const current = phases.indexOf(phase);
            const isCurrent = p === phase;
            const isDone = i < current;
            return (
              <React.Fragment key={p}>
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: isDone ? '#22c55e' : isCurrent ? accentColor : 'rgba(255,255,255,0.15)',
                    boxShadow: isCurrent ? `0 0 8px ${accentColor}` : 'none',
                  }}
                />
                {i < 4 && <div style={{ width: 16, height: 1, background: isDone ? '#22c55e44' : 'rgba(255,255,255,0.1)' }} />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Caméra Holomat uniquement (plus d’hologramme) */}
        <div className="flex flex-col items-center justify-center gap-3 w-full">
          {phase === 'face_capture' && faceProgress < 100 ? (
            <FaceCamPanel
              mode="enroll"
              username={username || usernameRef.current || 'admin'}
              active={orchState.currentStep?.id === 'face_scan'}
              onProgress={(p) => setFaceProgress(p)}
              onHud={(t) => orchRef.current?.patchHud({ hudSubtext: t })}
              onComplete={() => {
                setFaceProgress(100);
                const r = faceEnrollResolveRef.current;
                faceEnrollResolveRef.current = null;
                r?.(true);
              }}
              onFailed={() => {
                const r = faceEnrollResolveRef.current;
                faceEnrollResolveRef.current = null;
                r?.(false);
              }}
            />
          ) : phase === 'face_capture' || phase === 'voice_enroll' || phase === 'complete' || faceProgress >= 100 ? (
            <div
              className="flex items-center justify-center rounded-xl"
              style={{
                width: 'min(92vw, 420px)',
                height: 120,
                border: '1px solid rgba(34,197,94,0.35)',
                background: 'rgba(34,197,94,0.06)',
                fontFamily: 'Share Tech Mono, monospace',
                fontSize: 10,
                letterSpacing: '0.14em',
                color: '#22c55e',
              }}
            >
              {faceProgress >= 100 ? 'EMPREINTE FACIALE ENREGISTRÉE' : 'HOLOMAT · EN ATTENTE'}
            </div>
          ) : (
            <BiometricAwaitPanel accent={accentColor} phase={phase} />
          )}
        </div>

        {/* HUD message */}
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
              <p style={{ ...mono, color: 'rgba(0,229,255,0.45)', fontSize: 9, letterSpacing: '0.1em', marginTop: 3 }}>
                {orchState.hudSubtext}
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        {/* USERNAME INPUT — phase username + orchState.isWaitingForUser */}
        <AnimatePresence>
          {phase === 'username' && orchState.isWaitingForUser && (
            <motion.div
              key="username-input"
              className="w-full max-w-sm flex flex-col gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
            >
              <div className="flex items-center gap-2 px-4 py-3 rounded-2xl"
                style={{ border: '1px solid rgba(0,229,255,0.35)', background: 'rgba(0,229,255,0.05)' }}
              >
                <User className="w-4 h-4 flex-shrink-0" style={{ color: '#00e5ff' }} />
                <input
                  type="text"
                  autoFocus
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmUsername()}
                  placeholder="Votre identifiant…"
                  className="flex-1 bg-transparent outline-none"
                  disabled={usernameSubmitting || awaitingNameApproval}
                  style={{ ...orbF, fontSize: 13, letterSpacing: '0.12em', color: '#cfeefb' }}
                />
                <motion.button
                  type="button"
                  onClick={confirmUsername}
                  whileTap={{ scale: 0.9 }}
                  disabled={!usernameInput.trim() || usernameSubmitting || awaitingNameApproval}
                  className="flex-shrink-0 cursor-pointer"
                  style={{ color: usernameInput.trim() && !usernameSubmitting && !awaitingNameApproval ? '#00e5ff' : 'rgba(0,229,255,0.25)' }}
                >
                  <ChevronRight className="w-5 h-5" />
                </motion.button>
              </div>
              {awaitingNameApproval && (
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => void approveUsername()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer"
                    style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)' }}
                  >
                    <Check className="w-4 h-4" style={{ color: '#22c55e' }} />
                    <span style={{ ...mono, color: '#22c55e', fontSize: 10, letterSpacing: '0.08em' }}>OUI, VALIDER</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void retryUsername()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer"
                    style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)' }}
                  >
                    <RotateCcw className="w-4 h-4" style={{ color: '#f59e0b' }} />
                    <span style={{ ...mono, color: '#f59e0b', fontSize: 10, letterSpacing: '0.08em' }}>REPRENDRE LE NOM</span>
                  </button>
                </div>
              )}
              <p style={{ ...mono, color: 'rgba(0,229,255,0.4)', fontSize: 9, letterSpacing: '0.12em', textAlign: 'center' }}>
                {awaitingNameApproval
                  ? `Nom détecté : ${usernameRef.current}. Confirmez la prononciation.`
                  : usernameSubmitting
                  ? 'Validation identité en cours...'
                  : nameRetryHint
                  ? 'Reprenez le nom de profil avec une diction claire.'
                  : 'Ce nom sera associé à votre empreinte biométrique'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FACE PROGRESS BAR */}
        <AnimatePresence>
          {phase === 'face_capture' && (
            <motion.div
              key="face-progress"
              className="w-full flex flex-col gap-2"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex items-center justify-between">
                <span style={{ ...mono, color: '#00e5ff', fontSize: 9, letterSpacing: '0.18em' }}>ACQUISITION BIOMÉTRIQUE</span>
                <span style={{ ...mono, color: '#00e5ff', fontSize: 9 }}>{faceProgress}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,229,255,0.1)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}` }}
                  animate={{ width: `${faceProgress}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* VOICE BUTTON */}
        <AnimatePresence>
          {phase === 'voice_enroll' && orchState.isWaitingForUser && (
            <motion.div
              key="voice-btn"
              className="flex flex-col items-center gap-3"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.3 }}
            >
              <motion.button
                type="button"
                onClick={() => orchRef.current?.userConfirm()}
                className="flex items-center gap-3 px-6 py-3 rounded-2xl cursor-pointer"
                style={{
                  background: 'rgba(25,240,216,0.1)',
                  border: '2px solid rgba(25,240,216,0.6)',
                  boxShadow: '0 0 24px rgba(25,240,216,0.25)',
                }}
                animate={{ boxShadow: ['0 0 16px rgba(25,240,216,0.2)', '0 0 32px rgba(25,240,216,0.5)', '0 0 16px rgba(25,240,216,0.2)'] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                whileTap={{ scale: 0.95 }}
              >
                <Mic className="w-5 h-5" style={{ color: '#19f0d8' }} />
                <span style={{ ...orbF, color: '#19f0d8', fontSize: 11, letterSpacing: '0.15em' }}>
                  ENREGISTRER MA VOIX
                </span>
              </motion.button>
              <p style={{ ...mono, color: 'rgba(25,240,216,0.55)', fontSize: 10, letterSpacing: '0.12em' }}>
                Dites : « Jarvis, active-toi »
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SUCCESS */}
        <AnimatePresence>
          {phase === 'complete' && (
            <motion.div
              key="success"
              className="text-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <p style={{ ...orbF, color: '#22c55e', fontSize: 14, letterSpacing: '0.2em', textShadow: '0 0 20px #22c55e88' }}>
                PROFIL CRÉÉ
              </p>
              <p style={{ ...mono, color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 6, letterSpacing: '0.08em' }}>
                Bienvenue {displayName}. JARVIS est maintenant à votre service.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div
        className="absolute right-8 bottom-8 flex flex-col items-center gap-1 pointer-events-none"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4 }}
      >
        <div style={{ width: 72, height: 72 }}>
          <Orb state={orchState.orbState} volume={0.1} playbackVolume={0} />
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Placeholder avant le scan : pas de WebGL — évite le carré blanc R3F. */
function BiometricAwaitPanel({ accent, phase }: { accent: string; phase: SetupPhase }) {
  const label =
    phase === 'boot'
      ? 'INITIALISATION…'
      : phase === 'username'
        ? 'EN ATTENTE D’IDENTITÉ'
        : 'PRÊT POUR CALIBRATION';

  return (
    <div
      className="relative overflow-hidden rounded-xl select-none"
      style={{
        width: 'min(92vw, 420px)',
        height: 220,
        background: 'radial-gradient(ellipse at 50% 40%, rgba(0,40,60,0.9) 0%, #020509 70%)',
        border: `1px solid ${accent}55`,
        boxShadow: `0 0 28px ${accent}22`,
      }}
    >
      {/* Anneau pulsant */}
      <motion.div
        className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 120,
          height: 148,
          border: `1px dashed ${accent}66`,
          borderRadius: '50% / 46%',
        }}
        animate={{ opacity: [0.35, 0.85, 0.35], scale: [0.96, 1.04, 0.96] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 72,
          height: 72,
          border: `1px solid ${accent}99`,
          boxShadow: `0 0 24px ${accent}44`,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
      {/* Ligne de scan */}
      <motion.div
        className="absolute left-[18%] right-[18%] h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, top: '28%' }}
        animate={{ top: ['28%', '68%', '28%'] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="absolute bottom-4 left-0 right-0 text-center"
        style={{ ...mono, fontSize: 9, letterSpacing: '0.16em', color: `${accent}cc` }}
      >
        {label}
      </div>
      <div
        className="absolute top-3 left-3 px-1.5 py-0.5 rounded"
        style={{
          ...mono,
          fontSize: 7,
          letterSpacing: '0.14em',
          color: accent,
          background: 'rgba(0,0,0,0.5)',
        }}
      >
        BIOMETRIC SLOT · EMPTY
      </div>
    </div>
  );
}
