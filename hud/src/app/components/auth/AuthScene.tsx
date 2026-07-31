/**
 * AuthScene — scène d'authentification SF complète
 * Phases : boot → identification → face_auth → voice_auth → authenticated
 * Cahier §10.1 / §13.10 — piloté par ExperienceOrchestrator (§3.5)
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Unlock, SkipForward, Mic } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FaceCamView } from './FaceCamView';
import { Orb } from '../orb';
import { speakDev, initTtsDev, stopDev } from '../../bridge/ttsDev';
import { runFaceAuthFlow } from '../../engine/faceAuthSimulator';
import { runFaceVerifyLive } from '../../bridge/faceAuthLive';
import type { FaceHologramState } from '../../engine/faceHologramTypes';
import {
  ExperienceOrchestrator,
  type OrchestratorState,
  type SceneStep,
} from '../../engine/experienceOrchestrator';
import { authLogin, getEnrollPin, getLastUsername } from '../../bridge/authClient';
import { getCoreClient } from '../../bridge/coreClient';
import { ensureCamera, getMediaState } from '../../bridge/mediaDevices';
import { isCoreOnline } from '../CoreBridge';

/* ─── Fonts ─────────────────────────────────────────────────────────────────── */
const orbF = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };

/* ─── Types ─────────────────────────────────────────────────────────────────── */
type BootCheck = {
  label: string;
  /** Nom du composant côté Core — c'est la clé de `component_state`. */
  component: string;
  status: 'pending' | 'ok' | 'loading' | 'failed' | 'skipped';
};

/**
 * Les six vérifications de démarrage.
 *
 * ⚠ Aucune de ces lignes ne se coche toute seule. Chacune suit une SONDE du
 * superviseur (`_register_components` dans `core/jarvis_core/__init__.py`), et
 * le Core est seul à décider quand elle passe au vert — cf. `component_state`.
 *
 * Ce fichier faisait exactement l'inverse : six étapes minutées dont le
 * `onComplete` écrivait `'ok'` sans rien avoir vérifié. Avec le Core éteint,
 * l'écran affichait six lignes vertes puis « Tous les systèmes sont
 * opérationnels », et l'échec ne se voyait qu'à la toute fin, sur le login.
 *
 * `component` DOIT correspondre aux noms enregistrés côté Core, et l'ordre à
 * celui de `sequences.BOOT` : la voix annonce ce que l'écran coche.
 */
const BOOT_CHECKS_INIT: BootCheck[] = [
  { label: 'HERMES CORE',      component: 'hermes',  status: 'pending' },
  { label: 'VOICE SYSTEM',     component: 'voice',   status: 'pending' },
  { label: 'FACE RECOGNITION', component: 'face',    status: 'pending' },
  { label: 'HOLOMAT VISION',   component: 'holomat', status: 'pending' },
  { label: 'USER DATABASE',    component: 'users',   status: 'pending' },
  { label: 'AGENT NETWORK',    component: 'agents',  status: 'pending' },
];

/**
 * Délai d'attente du `boot_state` d'ouverture. Passé ce délai, le Core est
 * considéré comme absent : HERMES CORE au rouge, la séquence s'arrête, et on
 * bascule sur le PIN. Pas de caméra, pas de simulateur, pas d'annonce.
 *
 * Généreux exprès : le Core accepte les connexions immédiatement mais il y a
 * une reconnexion WS toutes les 2,5 s derrière (`coreClient`).
 */
const CORE_HANDSHAKE_MS = 8000;

/* ─── Composant ─────────────────────────────────────────────────────────────── */
export function AuthScene() {
  const { unlockSession } = useApp();

  /* — States UI — */
  const [checks, setChecks]         = useState<BootCheck[]>(BOOT_CHECKS_INIT.map(c => ({ ...c })));
  const [scanProgress, setScanProgress] = useState(0);
  const [factors, setFactors]       = useState({ face: false, voice: false });
  const [pin, setPin]               = useState('');
  const [denied, setDenied]         = useState(false);
  const [faceHologram, setFaceHologram] = useState<FaceHologramState>({
    progress: 0,
    confidence: 0,
    phase: 'waiting',
    obstruction: false,
    retry: 0,
  });
  const [orchState, setOrchState]   = useState<OrchestratorState>({
    stepIndex: -1,
    currentStep: null,
    isRunning: false,
    isSpeaking: false,
    isWaitingForUser: false,
    hudText: 'JARVIS CORE INITIALIZING',
    hudSubtext: '',
    orbState: 'thinking',
    avatarMode: 'idle',
  });

  /** Boot bloqué sur une brique vitale : on n'enchaîne pas sur la caméra. */
  const [bootBlocked, setBootBlocked] = useState<string | null>(null);

  /* — Refs pour accès dans callbacks onEnter/onComplete — */
  const orchRef          = useRef<ExperienceOrchestrator | null>(null);
  const aliveRef         = useRef(true);
  const checksRef        = useRef<BootCheck[]>(BOOT_CHECKS_INIT.map(c => ({ ...c })));
  const scanIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const factorsRef       = useRef({ face: false, voice: false });
  const faceUserRef      = useRef<{ user_id?: string; username?: string; confidence: number } | null>(null);
  const unlockRef        = useRef(unlockSession);
  unlockRef.current      = unlockSession;

  /** Login User Manager puis unlock HUD — plus de unlock local seul. */
  const coreUnlock = useCallback(async (meta: { method: string; confidence?: number; pin?: string; user_id?: string; username?: string }) => {
    try {
      const res = await authLogin({
        username: meta.username || getLastUsername() || undefined,
        user_id: meta.user_id,
        pin: meta.pin,
        method: meta.method,
        confidence: meta.confidence ?? 0.95,
      });
      if (!res.ok) {
        console.warn('[auth] login Core refusé', res.error);
        setDenied(true);
        setTimeout(() => setDenied(false), 2000);
        return false;
      }
      unlockRef.current({
        method: meta.method,
        confidence: meta.confidence,
        user: res.event?.user,
      });
      return true;
    } catch (e) {
      console.warn('[auth] Core offline — login impossible', e);
      setDenied(true);
      setTimeout(() => setDenied(false), 2000);
      return false;
    }
  }, []);


  /* — Skip dev — */
  const skipDev = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('skipAuth') === '1';
  const faceFailDemo =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('faceFail') === '1';

  /* — TTS flag — */
  const ttsEnabled = import.meta.env.VITE_TTS_STUB === 'true';

  /* — Helpers checks (via ref pour être accessibles dans les callbacks) — */
  const setCheckStatus = useCallback((component: string, status: BootCheck['status']) => {
    checksRef.current = checksRef.current.map(c =>
      c.component === component ? { ...c, status } : c
    );
    setChecks([...checksRef.current]);
  }, []);

  /** `component_state` du Core → couleur de la ligne. Traduction, rien d'autre. */
  const applyComponentState = useCallback((component: string, state: string) => {
    const status: BootCheck['status'] =
      state === 'ready'    ? 'ok'
      : state === 'degraded' ? 'failed'
      : state === 'loading'  ? 'loading'
      : 'pending';
    setCheckStatus(component, status);
  }, [setCheckStatus]);

  /* ── Montage : init TTS + orchestrateur ──────────────────────────────────── */
  useEffect(() => {
    initTtsDev();
    aliveRef.current = true;

    if (skipDev) {
      unlockRef.current({ method: 'dev_skip' });
      return () => stopDev();
    }

    /* Guard StrictMode */
    if (orchRef.current) return;

    /**
     * Portail de démarrage — le Core mène, l'écran suit.
     *
     * Résout quand le Core annonce la fin de sa séquence de boot. Ne résout
     * JAMAIS sur minuterie : c'est toute la différence avec la version
     * précédente, où six `setTimeout` cochaient six lignes vertes pendant que
     * le Core était éteint.
     *
     * Trois issues, et une seule mène à la caméra :
     *   Core muet         → HERMES CORE au rouge, boot bloqué, PIN
     *   étape fatale      → ligne au rouge, boot bloqué, PIN
     *   boot terminé      → on enchaîne sur l'identification
     */
    const runBootGate = () => new Promise<void>(resolve => {
      const client = getCoreClient();
      let settled = false;
      const finish = (blocked: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(handshake);
        unsubscribe();
        if (blocked) {
          setBootBlocked(blocked);
          // Coupe la suite du scénario. Sans ça l'orchestrateur enchaînerait
          // sur « Authentification biométrique en cours » au-dessus d'un
          // démarrage qui vient d'échouer — la contradiction d'origine.
          orchRef.current?.stop();
        }
        resolve();
      };

      // Core absent ou trop lent : on ne devine pas, on le dit. Les lignes
      // jamais reçues restent grises — « pas de nouvelle » n'est pas « ok ».
      const handshake = setTimeout(() => {
        console.warn('[boot] aucun boot_state — Core injoignable');
        setCheckStatus('hermes', 'failed');
        finish('NOYAU COGNITIF INJOIGNABLE');
      }, CORE_HANDSHAKE_MS);

      const unsubscribe = client.subscribe(data => {
        if (data.type === 'component_state') {
          applyComponentState(String(data.component ?? ''), String(data.state ?? ''));
          return;
        }
        if (data.type !== 'boot_state') return;

        if (data.phase === 'start') {
          // Le Core a pris la main : plus de garde-fou de handshake, les
          // sondes lentes (YuNet + SFace, ~20 s) ont le droit de prendre
          // leur temps. C'est le Core qui borne, avec ses propres timeouts.
          clearTimeout(handshake);
          orchRef.current?.patchHud({ hudSubtext: 'Vérification des systèmes' });
          return;
        }

        if (data.phase === 'end') {
          const degraded = Array.isArray(data.degraded) ? data.degraded as string[] : [];
          // `boot_<x>` → `<x>` : le Core nomme ses étapes, le HUD ses lignes.
          degraded.forEach(ev => setCheckStatus(ev.replace(/^boot_/, ''), 'failed'));
          // Une ligne encore en attente ici n'a pas de sonde côté Core
          // (composant non enregistré). Elle n'est ni verte ni rouge : sautée.
          checksRef.current
            .filter(c => c.status === 'pending')
            .forEach(c => setCheckStatus(c.component, 'skipped'));
          finish(data.ok === false ? 'DÉMARRAGE INTERROMPU' : null);
        }
      });

      // HOLOMAT VISION : le Core ne peut pas sonder une caméra qu'il ne tient
      // pas. On l'ouvre ici et on lui rapporte le résultat — c'est ce qui
      // sépare « moteur de reconnaissance chargé » de « flux caméra ouvert ».
      void ensureCamera().then(stream => {
        client.send({
          type: 'holomat',
          action: 'camera',
          ok: !!stream,
          error: stream ? undefined : getMediaState().cameraError,
        });
      });
    });

    /* — Définition des steps — */
    const AUTH_STEPS: SceneStep[] = [
      /* ── BOOT ──────────────────────────────────────────────────────────────
       * UNE étape, et c'est le Core qui la mène.
       *
       * L'id DOIT commencer par `boot_` : c'est ce préfixe qui déclenche
       * `isBoot` et donc l'affichage de <BootOverlay> — orbe au centre +
       * vérifications qui défilent.
       *
       * `voiceLine` est ABSENT, volontairement. Les six annonces sortent du
       * cache du Core (`dialogues/boot.yaml`), calées sur les sondes. Les
       * remettre ici rejouerait le bug d'origine : deux moteurs qui récitent
       * le même texte à deux rythmes différents, l'un sur des minuteries.
       */
      {
        id: 'boot_core',
        hudText: 'INITIALISATION',
        hudSubtext: 'Vérification des systèmes',
        orbState: 'processing' as const,
        avatarMode: 'idle' as const,
        waitForAsync: () => runBootGate(),
        pauseAfter: 400,
      },

      /* ── IDENTIFICATION ───────────────────────────────────────────────────── */
      {
        id: 'identification_0',
        hudText: 'AUTHENTIFICATION BIOMÉTRIQUE',
        hudSubtext: '',
        voiceLine: 'Authentification biométrique en cours.',
        orbState: 'listening' as const,
        avatarMode: 'idle' as const,
        pauseAfter: 180,
      },
      {
        id: 'identification_1',
        hudText: 'IDENTIFICATION BIOMÉTRIQUE',
        hudSubtext: 'Veuillez rester immobile',
        voiceLine: "Veuillez rester immobile pour l'identification biométrique.",
        orbState: 'processing' as const,
        avatarMode: 'idle' as const,
        pauseAfter: 220,
      },

      /* ── FACE AUTH (events + jauge — §10.1) ───────────────────────────────── */
      {
        id: 'face_auth_flow',
        hudText: 'FACE AUTH',
        hudSubtext: 'Initialisation capteurs',
        orbState: 'processing' as const,
        avatarMode: 'scanning' as const,
        waitForAsync: async () => {
          const orch = orchRef.current;
          if (!orch) return;

          const useLive = isCoreOnline() && !faceFailDemo;
          let ok = false;

          if (useLive) {
            const result = await runFaceVerifyLive({
              username: getLastUsername() || undefined,
              isAlive: () => aliveRef.current,
              speak: async (text) => {
                orch.patchHud({ isSpeaking: true, avatarMode: 'speaking' });
                if (ttsEnabled) await speakDev(text, { rate: 0.92, pitch: 0.85 });
                orch.patchHud({ isSpeaking: false, avatarMode: 'scanning' });
              },
              patchHud: (hudText, hudSubtext) => {
                orch.patchHud({ hudText, hudSubtext, orbState: 'processing', avatarMode: 'scanning' });
              },
              patchFace: (update) => {
                setFaceHologram(prev => {
                  const next = { ...prev, ...update };
                  if (update.progress !== undefined) setScanProgress(update.progress);
                  return next;
                });
              },
            });
            ok = result.ok;
            if (result.ok) {
              faceUserRef.current = {
                user_id: result.user_id,
                username: result.username,
                confidence: result.confidence,
              };
            }
          } else {
            ok = await runFaceAuthFlow({
              ttsEnabled,
              simulateFailOnce: faceFailDemo,
              maxRetries: faceFailDemo ? 2 : 1,
              recoverySeconds: faceFailDemo ? 8 : 0,
              isAlive: () => aliveRef.current,
              speak: async (text) => {
                orch.patchHud({ isSpeaking: true, avatarMode: 'speaking' });
                if (ttsEnabled) await speakDev(text, { rate: 0.92, pitch: 0.85 });
                else await new Promise(r => setTimeout(r, Math.max(700, text.split(' ').length * 110)));
                orch.patchHud({ isSpeaking: false, avatarMode: 'scanning' });
              },
              patchHud: (hudText, hudSubtext, orbState = 'processing') => {
                orch.patchHud({
                  hudText,
                  hudSubtext,
                  orbState,
                  avatarMode: orbState === 'listening' ? 'listening' : 'scanning',
                });
              },
              patchFace: (update) => {
                setFaceHologram(prev => {
                  const next = { ...prev, ...update };
                  if (update.progress !== undefined) setScanProgress(update.progress);
                  return next;
                });
              },
            });
          }

          if (!ok) {
            orch.patchHud({ hudText: 'AUTH LOCK TEMPORARY', hudSubtext: 'Utilisez PIN ou réessayez', avatarMode: 'denied' });
            setFaceHologram(prev => ({ ...prev, phase: 'locked' }));
            throw new Error('face_auth_locked');
          }
          factorsRef.current = { ...factorsRef.current, face: true };
          setFactors(f => ({ ...f, face: true }));
          setScanProgress(100);
          setFaceHologram(prev => ({ ...prev, phase: 'success', progress: 100, confidence: faceUserRef.current?.confidence ?? 1 }));
        },
      },

      /* ── VOICE AUTH ───────────────────────────────────────────────────────── */
      {
        id: 'voice_prompt',
        hudText: 'CANAL VOCAL SÉCURISÉ',
        hudSubtext: 'Activation du protocole vocal',
        voiceLine: "Activation du canal vocal sécurisé. Veuillez dire votre mot d'activation.",
        orbState: 'listening' as const,
        avatarMode: 'listening' as const,
        pauseAfter: 300,
        waitForUser: true,
      },
      {
        id: 'voice_scan',
        hudText: 'ANALYSE VOCALE',
        hudSubtext: 'Analyse spectrale en cours',
        voiceLine: 'Analyse spectrale de votre empreinte sonore.',
        orbState: 'processing' as const,
        avatarMode: 'scanning' as const,
        minDuration: 2000,
        pauseAfter: 300,
      },
      {
        id: 'voice_ok',
        hudText: 'SIGNATURE VALIDÉE',
        hudSubtext: 'Authentification multimodale confirmée',
        voiceLine: 'Signature vocale validée. Authentification confirmée.',
        orbState: 'responding' as const,
        avatarMode: 'ok' as const,
        pauseAfter: 400,
        onEnter: () => {
          factorsRef.current = { ...factorsRef.current, voice: true };
          setFactors(f => ({ ...f, voice: true }));
        },
      },

      /* ── ACCESS GRANTED ───────────────────────────────────────────────────── */
      {
        id: 'access_granted',
        hudText: 'IDENTITÉ RECONNUE',
        hudSubtext: 'Profil existant confirmé',
        voiceLine: 'Identité reconnue.',
        orbState: 'responding' as const,
        avatarMode: 'ok' as const,
        minDuration: 700,
        pauseAfter: 180,
      },
      {
        id: 'profile_load',
        hudText: 'PROFIL DÉVERROUILLÉ',
        hudSubtext: 'Chargement de votre environnement',
        voiceLine: 'Profil déverrouillé. Chargement de votre environnement JARVIS.',
        orbState: 'processing' as const,
        avatarMode: 'idle' as const,
        minDuration: 1000,
        pauseAfter: 220,
      },
      {
        id: 'complete',
        hudText: 'ACCÈS HUD AUTORISÉ',
        hudSubtext: 'Chargement terminé',
        voiceLine: 'Chargement terminé. Accès au HUD autorisé.',
        orbState: 'idle' as const,
        avatarMode: 'ok' as const,
        pauseAfter: 260,
        onComplete: () => {
          const fu = faceUserRef.current;
          void coreUnlock({
            method: fu?.user_id ? 'face' : 'face_voice_stub',
            confidence: fu?.confidence ?? 0.98,
            user_id: fu?.user_id,
            username: fu?.username,
          });
        },
      },
    ];

    /* — Créer et démarrer l'orchestrateur — */
    const orch = new ExperienceOrchestrator({
      ttsEnabled,
      speakFn: speakDev,
      stopFn: stopDev,
    });
    orchRef.current = orch;

    const unsub = orch.subscribe(s => setOrchState({ ...s }));
    orch.load(AUTH_STEPS);
    void orch.run().catch(err => {
      console.debug('[auth] orchestrator stopped', err);
    });

    return () => {
      aliveRef.current = false;
      unsub();
      orch.stop();
      orchRef.current = null;
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      stopDev();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── PIN backup → Core verify ────────────────────────────────────────────── */
  const tryPin = useCallback(() => {
    const v = pin.trim();
    if (!v) return;
    // Ancien magic "jarvis" → mappe sur PIN enrollé (0000 par défaut)
    const pinCode = v.toLowerCase() === 'jarvis' ? getEnrollPin() : v;
    void coreUnlock({ method: 'pin', confidence: 1, pin: pinCode });
  }, [pin, coreUnlock]);

  /* ── Dérivés visuels ─────────────────────────────────────────────────────── */
  // Boot bloqué : l'overlay RESTE, avec ses lignes rouges. L'orchestrateur est
  // arrêté (`isRunning` faux), donc sans ce premier terme l'écran d'échec
  // s'effacerait aussitôt pour laisser place à la caméra.
  const isBoot      = bootBlocked !== null
    || (!!orchState.currentStep?.id.startsWith('boot_') && orchState.isRunning);
  const isAuth      = !isBoot && orchState.isRunning;
  const isComplete  = !isBoot && (orchState.hudText === 'SYSTÈME PRÊT' || !orchState.isRunning);
  const isVoiceScan = orchState.currentStep?.id === 'voice_scan';

  const accentColor = denied || bootBlocked
    ? '#ef4444'
    : isComplete
      ? '#22c55e'
      : orchState.orbState === 'listening'
        ? '#19f0d8'
        : '#00e5ff';

  const faceMode = denied
    ? 'denied' as const
    : faceHologram.phase === 'success'
      ? 'ok' as const
      : orchState.avatarMode;

  const inFaceFlow =
    orchState.currentStep?.id === 'face_auth_flow' ||
    (faceHologram.phase !== 'waiting' && faceHologram.progress > 0 && !factors.face);

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

      {/* Phase BOOT */}
      <AnimatePresence>
        {isBoot && (
          <BootOverlay
            checks={checks}
            msg={bootBlocked ?? orchState.hudText}
            subtext={bootBlocked ? 'Utilisez le code de secours' : orchState.hudSubtext}
            blocked={bootBlocked !== null}
            footer={
              <div className="flex gap-2 w-full max-w-xs">
                <input
                  type="password"
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && tryPin()}
                  placeholder="Code ACCESS"
                  className="flex-1 rounded-xl px-3 py-2 outline-none text-center"
                  style={{
                    ...orbF, fontSize: 11, letterSpacing: '0.15em',
                    color: denied ? '#ef4444' : '#cfeefb',
                    background: '#06101c',
                    border: `1px solid ${denied ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.25)'}`,
                  }}
                />
                <button
                  type="button" onClick={tryPin}
                  className="rounded-xl px-4 cursor-pointer"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  <Unlock className="w-4 h-4" style={{ color: '#ef4444' }} />
                </button>
              </div>
            }
          />
        )}
      </AnimatePresence>

      {/* Contenu principal — visible après boot */}
      <AnimatePresence>
        {isAuth && (
          <motion.div
            key="main"
            className="flex flex-col items-center gap-5 w-full max-w-md px-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Titre */}
            <div className="text-center">
              <h1 style={{ ...orbF, color: accentColor, fontSize: 'clamp(20px,4vw,32px)', letterSpacing: '0.38em', textShadow: `0 0 30px ${accentColor}66` }}>
                J.A.R.V.I.S
              </h1>
              <p style={{ ...mono, color: 'rgba(0,229,255,0.4)', fontSize: 9, letterSpacing: '0.25em', marginTop: 6 }}>
                BOOT AUTHENTICATION SEQUENCE
              </p>
            </div>

            {/* Facteurs MFA */}
            <div className="flex gap-3">
              {[
                { k: 'face' as const, label: 'VISAGE' },
                { k: 'voice' as const, label: 'VOIX' },
              ].map(f => (
                <FactorChip key={f.k} label={f.label} ok={factors[f.k]} />
              ))}
            </div>

            {/* Caméra Holomat */}
            <div className="flex items-end justify-center">
              <FaceCamView
                progress={scanProgress}
                active={inFaceFlow || scanProgress > 0}
                label={factors.face ? 'HOLOMAT · OK' : 'HOLOMAT · CAM'}
              />
            </div>

            {/* Message HUD courant */}
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

            {/* Bouton micro — voice_prompt waitForUser */}
            <AnimatePresence>
              {orchState.isWaitingForUser && (
                <motion.div
                  key="voice-trigger"
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
                      DIRE MON MOT D'ACTIVATION
                    </span>
                  </motion.button>
                  {/* « hey Jarvis » et non « Jarvis » : c'est le modèle
                      hey_jarvis d'openWakeWord qui écoute (core/data/voice/
                      wake.yaml). Le prénom seul ne déclenche pas — afficher
                      la mauvaise formule fait rater une détection valide. */}
                  <p style={{ ...mono, color: 'rgba(25,240,216,0.55)', fontSize: 10, letterSpacing: '0.12em' }}>
                    Dites : « Hey Jarvis »
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Overlay scan barre */}
            <PhaseOverlay
              stepId={orchState.currentStep?.id ?? ''}
              scanProgress={scanProgress}
              accentColor={accentColor}
              hudText={orchState.hudText}
            />

            {/* PIN + skip */}
            {orchState.isRunning && orchState.hudText !== 'SYSTÈME PRÊT' && (
              <div className="w-full flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && tryPin()}
                    placeholder="Code ACCESS (dev: jarvis)"
                    className="flex-1 rounded-xl px-3 py-2 outline-none text-center"
                    style={{
                      ...orbF, fontSize: 11, letterSpacing: '0.15em',
                      color: denied ? '#ef4444' : '#cfeefb',
                      background: '#06101c',
                      border: `1px solid ${denied ? 'rgba(239,68,68,0.5)' : 'rgba(0,229,255,0.2)'}`,
                    }}
                  />
                  <button
                    type="button" onClick={tryPin}
                    className="rounded-xl px-4 cursor-pointer"
                    style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)' }}
                  >
                    <Unlock className="w-4 h-4" style={{ color: '#00e5ff' }} />
                  </button>
                </div>

                <motion.button
                  type="button" whileTap={{ scale: 0.97 }}
                  onClick={() => unlockSession({ method: 'dev_skip' })}
                  className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2 cursor-pointer"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}
                >
                  <SkipForward className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
                  <span style={{ ...mono, color: '#f59e0b', fontSize: 9, letterSpacing: '0.08em' }}>
                    MODE DÉMO — PASSER L'AUTH
                  </span>
                </motion.button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {isAuth && (
        <motion.div
          className="absolute left-8 bottom-8 flex flex-col items-center gap-1 pointer-events-none"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div style={{ width: 72, height: 72 }}>
            <Orb
              state={orchState.orbState}
              volume={isVoiceScan ? 0.6 : 0.1}
              playbackVolume={0}
            />
          </div>
          <span style={{ ...mono, color: isVoiceScan ? '#19f0d8' : 'rgba(0,229,255,0.4)', fontSize: 7, letterSpacing: '0.1em' }}>
            {isVoiceScan ? 'ANALYSE...' : 'VOIX'}
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ─── Boot overlay ───────────────────────────────────────────────────────────── */
const CHECK_COLORS: Record<BootCheck['status'], string> = {
  ok: '#22c55e',
  loading: '#00e5ff',
  failed: '#ef4444',
  // Sondée par personne (composant non enregistré côté Core). Ni verte ni
  // rouge : on n'en sait rien, et prétendre le contraire est le bug d'origine.
  skipped: 'rgba(255,255,255,0.18)',
  pending: 'rgba(255,255,255,0.25)',
};

function BootOverlay(
  { checks, msg, subtext, blocked, footer }:
  { checks: BootCheck[]; msg: string; subtext: string; blocked: boolean; footer?: React.ReactNode },
) {
  const accent = blocked ? '#ef4444' : '#00e5ff';
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8"
      style={{ background: '#020509' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Orbe — fixe, vibre selon la voix */}
      <div style={{ width: 80, height: 80, marginBottom: 10 }}>
        <Orb state={blocked ? 'idle' : 'thinking'} volume={blocked ? 0.05 : 0.4} playbackVolume={0} />
      </div>

      <motion.p
        style={{ ...orbF, color: accent, fontSize: 11, letterSpacing: '0.4em', textShadow: `0 0 16px ${accent}88` }}
        // Un écran d'échec ne clignote pas : il se fige. La pulsation dit
        // « ça travaille », et ça ne travaille plus.
        animate={blocked ? { opacity: 1 } : { opacity: [0.4, 1, 0.4] }}
        transition={blocked ? { duration: 0 } : { duration: 1.4, repeat: Infinity }}
      >
        {msg}
      </motion.p>

      {/* Checks */}
      <div className="flex flex-col gap-1.5 w-full max-w-xs">
        {checks.map(c => (
          <div key={c.label} className="flex items-center gap-2.5">
            <div className="w-4 flex items-center justify-center flex-shrink-0">
              {c.status === 'ok'      && <span style={{ color: CHECK_COLORS.ok, fontSize: 10 }}>✓</span>}
              {c.status === 'failed'  && <span style={{ color: CHECK_COLORS.failed, fontSize: 10 }}>✕</span>}
              {c.status === 'loading' && (
                <motion.span
                  style={{ color: CHECK_COLORS.loading, fontSize: 10 }}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                >▸</motion.span>
              )}
              {c.status === 'skipped' && <span style={{ color: CHECK_COLORS.skipped, fontSize: 10 }}>–</span>}
              {c.status === 'pending' && <span style={{ color: 'rgba(0,229,255,0.2)', fontSize: 10 }}>·</span>}
            </div>
            <span style={{
              ...mono, fontSize: 9, letterSpacing: '0.12em',
              color: CHECK_COLORS[c.status],
            }}>
              {c.label}
            </span>
          </div>
        ))}
      </div>

      {/* Message courant */}
      <AnimatePresence mode="wait">
        <motion.p
          key={subtext}
          style={{ ...mono, color: 'rgba(255,255,255,0.5)', fontSize: 10, textAlign: 'center', letterSpacing: '0.06em' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {subtext}
        </motion.p>
      </AnimatePresence>

      {/* Secours. Une brique vitale est tombée : l'entrée par code reste le
          seul chemin, et elle doit être ici — la scène d'auth, elle, n'est
          jamais atteinte. */}
      {blocked && footer}
    </motion.div>
  );
}

/* ─── Factor chip ────────────────────────────────────────────────────────────── */
function FactorChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1 rounded-full"
      style={{
        border: `1px solid ${ok ? 'rgba(34,197,94,0.5)' : 'rgba(0,229,255,0.2)'}`,
        background: ok ? 'rgba(34,197,94,0.1)' : 'rgba(0,10,25,0.6)',
      }}
    >
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: ok ? '#22c55e' : 'rgba(0,229,255,0.3)' }} />
      <span style={{ ...mono, color: ok ? '#22c55e' : 'rgba(255,255,255,0.35)', fontSize: 8, letterSpacing: '0.1em' }}>
        {label}
      </span>
    </div>
  );
}

/* ─── Phase overlay (barre de scan) ─────────────────────────────────────────── */
function PhaseOverlay({ stepId, scanProgress, accentColor, hudText }: {
  stepId: string; scanProgress: number; accentColor: string; hudText: string;
}) {
  const isFaceScan  = stepId === 'face_auth_flow' || stepId.startsWith('face_scan');
  const isVoiceAuth = stepId === 'voice_prompt' || stepId === 'voice_scan' || stepId === 'voice_ok';

  if (!isFaceScan && !isVoiceAuth) return null;

  const label = isFaceScan ? hudText : 'CANAL VOCAL SÉCURISÉ';

  return (
    <AnimatePresence>
      <motion.div
        key={stepId}
        className="w-full flex flex-col gap-2"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
      >
        <div className="flex items-center gap-2">
          <motion.div
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: accentColor }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
          <span style={{ ...mono, color: accentColor, fontSize: 9, letterSpacing: '0.18em' }}>
            {label}
          </span>
        </div>

        {isFaceScan && (
          <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,229,255,0.1)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ width: `${scanProgress}%`, background: accentColor, boxShadow: `0 0 8px ${accentColor}` }}
            />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
