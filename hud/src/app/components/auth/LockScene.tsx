/**
 * LockScene — re-auth après soft-lock.
 * Phrase vocale uniquement (plus de face / caméra).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Lock, Mic, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { initTtsDev, stopDev } from '../../bridge/ttsDev';
import {
  ExperienceOrchestrator,
  type OrchestratorState,
} from '../../engine/experienceOrchestrator';
import { authLogin, getLastUsername } from '../../bridge/authClient';
import { runVoiceVerifyLive, VOICE_CHALLENGE, formatVoiceChallenge } from '../../bridge/voiceAuthLive';
import { getCoreClient } from '../../bridge/coreClient';
import { ensureMic, getMediaState, tryPrimeMic } from '../../bridge/mediaDevices';
import { startAudioBus } from '../../bridge/audioBus';
import { isCoreOnline } from '../CoreBridge';
import { AuthVoiceWave } from './AuthVoiceWave';
import { useMicOrbAnalyser } from './useMicOrbAnalyser';
import { OrbSpatial } from './OrbSpatial';
import { GlassButton, GlassPanel } from '../../../components/glass';
import { tokens } from '../../../ui/tokens';
import { AuthCinematicBackdrop } from './AuthCinematicBackdrop';
import { ThemeModeToggle } from '../ThemeModeToggle';
import { visionTitle, visionCaption, visionBody } from '../visionChrome';

const orbF = { fontFamily: tokens.font.display, fontWeight: 600, letterSpacing: '-0.02em' };

const displayStatus = (value: string) =>
  value
    .toLocaleLowerCase('fr-FR')
    .replace(/_/g, ' ')
    .replace(/(^|[\s·-])([\p{L}])/gu, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('fr-FR')}`);

interface Props {
  onUnlock?: () => void;
}

export function LockScene({ onUnlock }: Props) {
  const { unlockSession, coreAuth } = useApp();
  const [progress, setProgress] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [permanentDeny, setPermanentDeny] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const { micAnalyser, micLevel } = useMicOrbAnalyser(micOk);
  const [hint, setHint] = useState('');
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
  const hitRef = useRef<{ user_id?: string; username?: string; confidence?: number } | null>(null);
  const unlockRef = useRef(unlockSession);
  unlockRef.current = unlockSession;

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
    void tryPrimeMic().then((s) => {
      if (s && getMediaState().mic === 'granted') {
        setMicOk(true);
        void startAudioBus();
      }
    });

    const STEPS = [
      {
        id: 'locked',
        hudText: 'SESSION VERROUILLÉE',
        hudSubtext: 'Authentification vocale',
        orbState: 'thinking' as const,
        avatarMode: 'idle' as const,
        minDuration: 400,
        pauseAfter: 200,
      },
      {
        id: 'voice_scan',
        hudText: 'VOICE AUTH',
        hudSubtext: `Dites : « ${VOICE_CHALLENGE} »`,
        orbState: 'listening' as const,
        avatarMode: 'listening' as const,
        waitForAsync: async () => {
          if (!aliveRef.current) return;

          while (aliveRef.current && !denyRef.current) {
            setProgress(5);
            if (!isCoreOnline()) {
              orchRef.current?.patchHud({
                hudText: 'CORE HORS LIGNE',
                hudSubtext: 'Impossible de déverrouiller sans Core',
              });
              await new Promise((r) => setTimeout(r, 2000));
              continue;
            }

            const stream = (await tryPrimeMic()) || (await ensureMic());
            if (!stream || getMediaState().mic !== 'granted') {
              setMicOk(false);
              setHint('Autorisez le micro pour continuer');
              orchRef.current?.patchHud({
                hudText: 'MICRO REQUIS',
                hudSubtext: 'Cliquez AUTORISER MICRO',
              });
              await new Promise((r) => setTimeout(r, 1500));
              continue;
            }
            setMicOk(true);
            setHint('');
            void startAudioBus();

            const usernameHint = getLastUsername();
            const challenge = formatVoiceChallenge();

            const result = await runVoiceVerifyLive({
              isAlive: () => aliveRef.current,
              usernameHint: usernameHint || undefined,
              patchHud: (hudText, hudSubtext) => {
                orchRef.current?.patchHud({ hudText, hudSubtext });
                setProgress((p) => Math.min(90, p + 12));
              },
            });

            if (!aliveRef.current) return;
            if (result.ok) {
              setProgress(100);
              hitRef.current = {
                user_id: result.user_id,
                username: result.username,
                confidence: result.confidence,
              };
              return;
            }

            const next = failRef.current + 1;
            failRef.current = next;
            setFailCount(next);
            if (next >= 5) {
              denyRef.current = true;
              setPermanentDeny(true);
              return;
            }
            orchRef.current?.patchHud({
              hudText: 'IDENTITÉ NON CONFIRMÉE',
              hudSubtext: `Réessayez — ${next}/5 · « ${challenge} »`,
            });
            await new Promise((r) => setTimeout(r, 1000));
          }
        },
      },
      {
        id: 'voice_ok',
        hudText: 'IDENTITÉ CONFIRMÉE',
        hudSubtext: 'Restauration session',
        orbState: 'responding' as const,
        avatarMode: 'ok' as const,
        minDuration: 600,
        pauseAfter: 300,
        onComplete: () => {
          const stash = hitRef.current;
          if (!stash?.user_id && !stash?.username) return;
          void coreUnlock({
            method: 'voice_reauth',
            user_id: stash?.user_id,
            username: stash?.username,
          });
        },
      },
    ];

    const orch = new ExperienceOrchestrator({ ttsEnabled: false, speakFn: async () => {}, stopFn: stopDev });
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
  }, [coreUnlock]);

  const unlockedVisual = progress >= 100 || orchState.currentStep?.id === 'voice_ok';
  const lockColor = unlockedVisual ? tokens.color.success : permanentDeny ? tokens.color.danger : tokens.color.accent;
  const scanning = orchState.currentStep?.id === 'voice_scan';

  return (
    <motion.div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center overflow-hidden px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <AuthCinematicBackdrop />
      <div className="absolute top-3 right-3 z-20">
        <ThemeModeToggle compact />
      </div>

      <GlassPanel level="regular" radius="lg" padding="lg" className="relative z-10 flex flex-col items-center gap-5 w-full max-w-md" style={{ borderRadius: 32 }}>
        <div className="flex items-center gap-2">
          {permanentDeny ? (
            <ShieldAlert className="w-4 h-4" style={{ color: tokens.color.danger }} />
          ) : (
            <Lock className="w-4 h-4" style={{ color: lockColor }} />
          )}
          <span style={{ ...visionTitle, color: lockColor, fontSize: 13 }}>
            {permanentDeny ? 'Accès refusé' : unlockedVisual ? 'Session ouverte' : 'Session verrouillée'}
          </span>
        </div>

        <div className="relative flex items-center justify-center" style={{ width: 200, height: 200 }}>
          <OrbSpatial
            size={168}
            state={unlockedVisual ? 'responding' : 'idle'}
            volume={0.08}
            playbackVolume={0}
          />
        </div>

        {(micOk || scanning) && (
          <AuthVoiceWave
            mode={
              permanentDeny
                ? 'denied'
                : unlockedVisual
                  ? 'ok'
                  : scanning
                    ? 'listening'
                    : 'idle'
            }
            level={micLevel}
          />
        )}

        {!micOk && !unlockedVisual && !permanentDeny && (
          <GlassButton
            tone="accent"
            active
            icon={<Mic className="w-4 h-4" />}
            style={{ ...orbF, fontSize: 13, padding: '12px 16px' }}
            onClick={() => {
              void ensureMic().then((s) => {
                if (s && getMediaState().mic === 'granted') {
                  setMicOk(true);
                  setHint('');
                  void startAudioBus();
                } else {
                  setHint(getMediaState().micError || 'Micro refusé');
                }
              });
            }}
          >
            Autoriser le micro
          </GlassButton>
        )}

        <div className="text-center">
          <p style={{ ...visionTitle, fontSize: 13, color: tokens.color.text }}>
            {displayStatus(orchState.hudText)}
          </p>
          <p style={{ ...visionBody, fontSize: 11, marginTop: 4 }}>
            {displayStatus(orchState.hudSubtext || hint)}
          </p>
          {failCount > 0 && !unlockedVisual && (
            <p style={{ ...visionCaption, color: tokens.color.danger, fontSize: 10, marginTop: 6 }}>
              Tentatives {failCount}/5
            </p>
          )}
        </div>
      </GlassPanel>
    </motion.div>
  );
}
