/**
 * AuthScene — scène d'authentification SF complète
 * Phases : boot → identification → face_auth → voice_auth → authenticated
 * Cahier §10.1 / §13.10 — piloté par ExperienceOrchestrator (§3.5)
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { SkipForward, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FaceCamView } from './FaceCamView';
import { AuthVoiceWave } from './AuthVoiceWave';
import { OrbSpatial } from './OrbSpatial';
import { useMicOrbAnalyser } from './useMicOrbAnalyser';
import { speakDev, initTtsDev, stopDev } from '../../bridge/ttsDev';
import { runFaceAuthFlow } from '../../engine/faceAuthSimulator';
import { runFaceVerifyLive } from '../../bridge/faceAuthLive';
import {
  formatVoiceChallenge,
  runVoiceVerifyLive,
} from '../../bridge/voiceAuthLive';
import { subscribeTtsSpeaking } from '../../bridge/ttsCore';
import type { FaceHologramState } from '../../engine/faceHologramTypes';
import {
  ExperienceOrchestrator,
  type OrchestratorState,
  type SceneStep,
} from '../../engine/experienceOrchestrator';
import { authLogin, getLastUsername } from '../../bridge/authClient';
import { getCoreClient } from '../../bridge/coreClient';
import {
  ensureCameraAndMic,
  ensureMic,
  getCameraStream,
  getMediaState,
  tryPrimeCamera,
  tryPrimeMic,
} from '../../bridge/mediaDevices';
import { isCoreOnline } from '../CoreBridge';
import { DEV_BUILD, isAuthBypassEnabled } from '../../bridge/devAuthBypass';
import { isBootAlreadyOk, markBootOk } from './SystemBootGate';
import { AuthCinematicBackdrop } from './AuthCinematicBackdrop';
import { ThemeModeToggle } from '../ThemeModeToggle';
import { GlassButton, GlassCard, GlassPanel } from '../../../components/glass';
import { tokens } from '../../../ui/tokens';
import { ACCENT, DANGER, MUTED, SUCCESS, TEXT, WARNING, orbFont } from '../hudTheme';
import { visionTitle, visionCaption, visionBody } from '../visionChrome';

const orbF = orbFont;

const BOOT_LABELS: Record<string, string> = {
  hermes: 'Noyau Hermes',
  voice: 'Système vocal',
  face: 'Reconnaissance faciale',
  holomat: 'Vision Holomat',
  users: 'Base utilisateurs',
  agents: 'Réseau d’agents',
};

const displayStatus = (value: string) =>
  value
    .toLocaleLowerCase('fr-FR')
    .replace(/_/g, ' ')
    .replace(/(^|[\s·-])([\p{L}])/gu, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('fr-FR')}`);

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
 * face only. Pas de PIN (kiosk TV / Linux sans apps natives).
 *
 * Généreux exprès : le Core accepte les connexions immédiatement mais il y a
 * une reconnexion WS toutes les 2,5 s derrière (`coreClient`).
 *
 * ⚠ DOIT rester au-dessus du garde-fou côté Core. `speak_boot_sequence`
 * attend `_components_ready` jusqu'à 10 s AVANT d'envoyer `boot_state: start`.
 * À 8 s, le HUD abandonnait deux secondes trop tôt et affichait « NOYAU
 * COGNITIF INJOIGNABLE » sur un Core parfaitement vivant — d'autant plus
 * probable au démarrage à froid du kiosque, où le HUD se connecte pendant que
 * le Core enregistre encore ses sondes.
 */
const CORE_HANDSHAKE_MS = 90_000;

/* ─── Composant ─────────────────────────────────────────────────────────────── */
interface Props {
  onRequestEnroll?: () => void;
}

export function AuthScene({ onRequestEnroll }: Props) {
  const { unlockSession, coreAuth } = useApp();

  /* — States UI — */
  const [checks, setChecks]         = useState<BootCheck[]>(BOOT_CHECKS_INIT.map(c => ({ ...c })));
  const [scanProgress, setScanProgress] = useState(0);
  const [factors, setFactors]       = useState({ face: false, voice: false });
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
  /** Permissions caméra + micro obtenues (gesture utilisateur ou auto). */
  const [mediaArmed, setMediaArmed] = useState(false);
  /** Caméra live — le bouton « Autoriser » reste tant que faux (micro seul ne suffit pas). */
  const [cameraGranted, setCameraGranted] = useState(false);
  /** Remonte FaceCamView après grant (réattache le flux). */
  const [camEpoch, setCamEpoch] = useState(0);
  const [mediaHint, setMediaHint] = useState('');
  const [offerEnroll, setOfferEnroll] = useState(false);
  const [enrollHint, setEnrollHint] = useState('');
  const [enrollGateBusy, setEnrollGateBusy] = useState(false);
  const [enrollGateError, setEnrollGateError] = useState('');

  /* — Refs pour accès dans callbacks onEnter/onComplete — */
  const orchRef          = useRef<ExperienceOrchestrator | null>(null);
  const aliveRef         = useRef(true);
  const checksRef        = useRef<BootCheck[]>(BOOT_CHECKS_INIT.map(c => ({ ...c })));
  const scanIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const factorsRef       = useRef({ face: false, voice: false });
  const faceUserRef      = useRef<{ user_id?: string; username?: string; confidence: number } | null>(null);
  const unlockRef        = useRef(unlockSession);
  const coreAuthRef      = useRef(coreAuth);
  /** Attentes `no_camera` — résolues au grant (évite de marteler getUserMedia). */
  const camWaitersRef    = useRef<Array<(ok: boolean) => void>>([]);
  unlockRef.current      = unlockSession;
  coreAuthRef.current    = coreAuth;

  const resolveCamWaiters = useCallback((ok: boolean) => {
    const waiters = camWaitersRef.current.splice(0, camWaitersRef.current.length);
    waiters.forEach((w) => w(ok));
  }, []);

  const waitForCameraGrant = useCallback((): Promise<boolean> => {
    const live = getCameraStream()?.getVideoTracks().some((t) => t.readyState === 'live');
    if (getMediaState().camera === 'granted' && live) return Promise.resolve(true);
    return new Promise((resolve) => {
      camWaitersRef.current.push(resolve);
    });
  }, []);

  /** Login User Manager puis unlock HUD — plus de unlock local seul. */
  const armMedia = useCallback(async () => {
    // Doit être appelé depuis un geste utilisateur (clic) si perm === prompt.
    setMediaHint('Demande caméra + micro…');
    const s = await ensureCameraAndMic();
    const camOk = s.camera === 'granted'
      && Boolean(getCameraStream()?.getVideoTracks().some((t) => t.readyState === 'live'));
    const micOk = s.mic === 'granted';
    setMediaArmed(camOk || micOk);
    setCameraGranted(camOk);
    if (camOk) {
      setCamEpoch((e) => e + 1);
      resolveCamWaiters(true);
    }
    if (camOk && micOk) setMediaHint('');
    else if (!camOk && !micOk) setMediaHint('Caméra et micro refusés — autorisez les permissions');
    else if (!camOk) setMediaHint('Caméra refusée — autorisez-la puis réessayez');
    else setMediaHint('Micro refusé — caméra OK');
    return s;
  }, [resolveCamWaiters]);

  /** Arme sans prompt navigateur — si besoin d’un clic, attend AUTORISER CAMÉRA. */
  const ensureCameraReady = useCallback(async (): Promise<boolean> => {
    const primed = await tryPrimeCamera();
    void tryPrimeMic().catch(() => null);
    const live = Boolean(
      primed?.getVideoTracks().some((t) => t.readyState === 'live')
      || getCameraStream()?.getVideoTracks().some((t) => t.readyState === 'live'),
    );
    if (live) {
      setCameraGranted(true);
      setMediaArmed(true);
      setCamEpoch((e) => e + 1);
      setMediaHint('');
      resolveCamWaiters(true);
      return true;
    }
    setCameraGranted(false);
    setMediaHint('Cliquez AUTORISER CAMÉRA pour activer le capteur');
    return waitForCameraGrant();
  }, [resolveCamWaiters, waitForCameraGrant]);

  const coreUnlock = useCallback(async (meta: { method: string; confidence?: number; user_id?: string; username?: string }) => {
    try {
      // Coupe le monologue AVANT le round-trip login — sinon WAV continue.
      try {
        getCoreClient().send({ type: 'auth', action: 'sequence_stop' });
        getCoreClient().send({ type: 'voice', action: 'cancel' });
      } catch { /* */ }
      const res = await authLogin({
        username: meta.username || getLastUsername() || undefined,
        user_id: meta.user_id,
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

  /** Orbe = bouche : pulse pendant TTS Core, idle sinon. */
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [speakPulse, setSpeakPulse] = useState(0);
  const [voiceHeard, setVoiceHeard] = useState('');
  const [voiceListening, setVoiceListening] = useState(false);
  const { micLevel } = useMicOrbAnalyser(cameraGranted || mediaArmed);
  useEffect(() => subscribeTtsSpeaking(setTtsSpeaking), []);
  useEffect(() => {
    if (!ttsSpeaking) {
      setSpeakPulse(0);
      return;
    }
    const id = window.setInterval(() => {
      const t = Date.now() / 1000;
      setSpeakPulse(0.35 + Math.abs(Math.sin(t * 9)) * 0.5);
    }, 50);
    return () => window.clearInterval(id);
  }, [ttsSpeaking]);

  /**
   * 2ᵉ facteur : capture micro → Core `verify_phrase` (comme LockScene).
   * `sequence_start` seul attend `voice.matched` sans audio HUD → timeout.
   */
  const confirmVoicePassphrase = useCallback(async (): Promise<boolean> => {
    const challenge = formatVoiceChallenge();
    setVoiceListening(true);
    setVoiceHeard('');
    orchRef.current?.patchHud({
      hudText: "PHRASE D'ACCÈS",
      hudSubtext: `Dites : « ${challenge} »`,
      orbState: 'listening',
      avatarMode: 'listening',
      isSpeaking: false,
    });
    const stream = (await tryPrimeMic()) || (await ensureMic());
    if (!stream || getMediaState().mic !== 'granted') {
      setVoiceListening(false);
      orchRef.current?.patchHud({
        hudText: 'MICRO REQUIS',
        hudSubtext: 'Autorisez le microphone pour confirmer',
        orbState: 'listening',
      });
      setMediaHint('Autorisez le micro, puis réessayez');
      return false;
    }
    const hint = faceUserRef.current?.username || getLastUsername() || undefined;
    const result = await runVoiceVerifyLive({
      isAlive: () => aliveRef.current,
      usernameHint: hint || undefined,
      attempts: 4,
      durationMs: 5_500,
      patchHud: (hudText, hudSubtext) => {
        orchRef.current?.patchHud({
          hudText,
          hudSubtext,
          orbState: 'listening',
          avatarMode: 'listening',
        });
      },
      onHeard: (text) => {
        const t = text.replace(/[«»"']/g, '').trim();
        if (!t || /^[.\s…·•\-–—]+$/.test(t) || /^\.{1,6}$/.test(t) || t.length < 2) {
          setVoiceHeard('');
          return;
        }
        setVoiceHeard(t);
      },
    });
    setVoiceListening(false);
    if (result.text) setVoiceHeard(result.text);
    if (result.ok) {
      factorsRef.current = { ...factorsRef.current, voice: true };
      setFactors({ ...factorsRef.current });
      return true;
    }
    if (result.reason === 'no_profiles') {
      setOfferEnroll(true);
      setEnrollHint('Aucun profil vocal — enrôlez la phrase d’accès (3 prises)');
      orchRef.current?.patchHud({
        hudText: 'PROFIL VOCAL ABSENT',
        hudSubtext: result.hudSubtext || 'Enrôlez votre voix, puis réessayez',
      });
    }
    return false;
  }, []);

  /**
   * Bouton enroll après `no_profile` : ouvrir FirstSetup directement.
   * Ne PAS exiger un visage admin — aucun profil facial n'existe encore
   * (sinon boucle : « admin non reconnu » pour créer le premier admin).
   * Gate admin réelle = session déjà ouverte / skill family-enroll.
   */
  const requestEnroll = useCallback(async () => {
    if (enrollGateBusy) return;
    setEnrollGateBusy(true);
    setEnrollGateError('');
    try {
      if (!isCoreOnline()) {
        setEnrollGateError('Core hors ligne');
        return;
      }
      onRequestEnroll?.();
    } catch (e) {
      setEnrollGateError(e instanceof Error ? e.message : 'Échec enrôlement');
    } finally {
      setEnrollGateBusy(false);
    }
  }, [enrollGateBusy, onRequestEnroll]);


  /* — Skip dev — */
  const skipDev = isAuthBypassEnabled();
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
      // Soft-lock → LockScene ; si on retombe ici, ne pas refiger le boot.
      if (isBootAlreadyOk()) {
        setChecks(prev => prev.map(c => ({ ...c, status: 'ok' as const })));
        resolve();
        return;
      }
      const client = getCoreClient();
      let settled = false;
      const finish = (blocked: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(handshake);
        unsubscribe();
        if (blocked) {
          setBootBlocked(blocked);
          orchRef.current?.stop();
        } else {
          markBootOk();
        }
        resolve();
      };

      // Core absent ou trop lent. Si le WS est UP mais boot_state perdu
      // (reconnect 1001 pendant le boot), on NE bloque PAS la caméra.
      const handshake = setTimeout(() => {
        if (client.connected) {
          console.warn('[boot] timeout mais Core connecté — skip checklist → face');
          checksRef.current.forEach(c => {
            if (c.status === 'pending' || c.status === 'loading') {
              setCheckStatus(c.component, 'skipped');
            }
          });
          try { client.send({ type: 'boot', action: 'skip' }); } catch { /* */ }
          finish(null);
          return;
        }
        console.warn('[boot] aucun boot_state — Core injoignable');
        setCheckStatus('hermes', 'failed');
        finish('Noyau cognitif injoignable');
      }, 15_000);

      // La cinématique ne précède plus le check : c'est AuthScene qui
      // demande l'annonce boot (comme SystemBootGate / FirstSetup).
      try {
        client.connect();
        client.send({ type: 'boot', action: 'announce' });
      } catch { /* */ }

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

          // Le boot est fini. On N'envoie PAS encore `sequence_start` auth :
          // la caméra HUD ne s'ouvre qu'à `face_auth_flow`. Lancer la séquence
          // ici faisait attendre `face.presence` 45 s à vide, tuait la branche
          // face, puis annonçait « Je n'ai personne devant le capteur » alors
          // que le scan n'avait même pas commencé.
          finish(data.ok === false ? 'Démarrage interrompu' : null);
        }
      });

      // HOLOMAT : ne PAS ouvrir getUserMedia au boot (withCamera puis release).
      // Sur Windows ça timeout 10 s, laisse Chrome « en cours d'utilisation »,
      // puis coupe → le vrai scan face_auth échoue ensuite.
      // Présence caméra = enumerateDevices uniquement ; ouverture = geste /
      // face_auth_flow (ensureCameraReady / AUTORISER CAMÉRA).
      void navigator.mediaDevices?.enumerateDevices?.()
        .then((devs) => {
          const hasCam = devs.some((d) => d.kind === 'videoinput');
          try {
            client.send({
              type: 'holomat',
              action: 'camera',
              ok: hasCam,
              error: hasCam ? undefined : 'no_videoinput',
            });
          } catch { /* */ }
        })
        .catch(() => {
          try {
            client.send({ type: 'holomat', action: 'camera', ok: false, error: 'enumerate_failed' });
          } catch { /* */ }
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

      /* ── IDENTIFICATION — pas de voiceLine HUD : le Core parle via sequences ─ */
      {
        id: 'identification_0',
        hudText: 'AUTHENTIFICATION BIOMÉTRIQUE',
        hudSubtext: 'Restez face à la caméra',
        orbState: 'listening' as const,
        avatarMode: 'idle' as const,
        pauseAfter: 80,
      },
      {
        id: 'identification_1',
        hudText: 'IDENTIFICATION BIOMÉTRIQUE',
        hudSubtext: 'Veuillez rester immobile',
        orbState: 'processing' as const,
        avatarMode: 'idle' as const,
        pauseAfter: 80,
      },

      /* ── FACE AUTH (events + jauge — §10.1) ───────────────────────────────── */
      {
        id: 'face_auth_flow',
        hudText: 'FACE AUTH',
        hudSubtext: 'Initialisation capteurs',
        orbState: 'processing' as const,
        avatarMode: 'scanning' as const,
        // Ne PAS appeler ensureCamera() ici sans geste : Chrome refuse / pend
        // (OPTICAL SENSOR… + inflight partagé avec le bouton Autoriser).
        waitForAsync: async () => {
          const orch = orchRef.current;
          if (!orch) return;
          setOfferEnroll(false);
          setEnrollHint('');
          setEnrollGateError('');
          // Reset offre enroll seulement (offerEnroll). L’ancienne gate PIN
          // (enrollGateOpen / enrollAdminPin) n’existe plus — ne pas la rappeler.

          orch.patchHud({
            hudText: 'FACE AUTH',
            hudSubtext: 'Préparation capteur optique',
            orbState: 'processing',
            avatarMode: 'scanning',
          });
          const camReady = await ensureCameraReady();
          if (!aliveRef.current) return;
          if (!camReady) {
            orch.patchHud({
              hudText: 'CAMÉRA REQUISE',
              hudSubtext: getMediaState().cameraError || 'Autorisez la caméra dans le navigateur',
              orbState: 'listening',
              avatarMode: 'listening',
            });
            return;
          }

          // Pas de `sequence_start` ici — la phrase d'accès vocale ne se
          // déclenche plus qu'APRÈS un visage reconnu (deuxième facteur),
          // jamais en parallèle du scan facial. Voir `confirmVoicePassphrase`.
          const useLive = isCoreOnline() && !faceFailDemo;
          let ok = false;
          let failReason = '';
          let failHudSubtext = '';

          // Soft-fail (pas de caméra / pas de visage / timeout) → réessai,
          // comme LockScene. Un seul échec ne doit pas coller l'écran sur
          // AUTH LOCK tant que l'utilisateur peut encore s'approcher.
          while (aliveRef.current && !ok) {
            if (useLive) {
              const result = await runFaceVerifyLive({
                // Pas de filtre last-username : un mauvais souvenir localStorage
                // montrait « no_profile » alors qu'un autre visage était enrôlé.
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
              if (result.ok) {
                faceUserRef.current = {
                  user_id: result.user_id,
                  username: result.username,
                  confidence: result.confidence,
                };
                orch.patchHud({
                  hudText: 'PHRASE D\'ACCÈS',
                  hudSubtext: 'Visage reconnu — dites la phrase pour confirmer',
                  orbState: 'listening',
                  avatarMode: 'listening',
                });
                const voiceOk = await confirmVoicePassphrase();
                if (!aliveRef.current) return;
                if (voiceOk) {
                  ok = true;
                  break;
                }
                // Visage reconnu mais pas de confirmation vocale : on ne
                // déverrouille pas — deux facteurs requis, on retente.
                faceUserRef.current = null;
                orch.patchHud({
                  hudText: 'PHRASE NON RECONNUE',
                  hudSubtext: 'Visage reconnu, confirmez avec la phrase d\'accès',
                  orbState: 'listening',
                  avatarMode: 'listening',
                });
                await new Promise(r => setTimeout(r, 1200));
                if (!aliveRef.current) return;
                continue;
              }
              failReason = result.reason || '';
              failHudSubtext = result.hudSubtext || '';
              const soft =
                failReason === 'no_face' ||
                failReason === 'timeout' ||
                failReason === 'no_camera';
              if (soft) {
                // Textes Core en priorité (FACE_* hudText/hudSubtext).
                orch.patchHud({
                  hudText: result.hudText
                    || (failReason === 'no_camera' ? 'CAMÉRA REQUISE' : 'SCAN FACIAL'),
                  hudSubtext: failHudSubtext
                    || (failReason === 'no_camera'
                      ? (getMediaState().cameraError || 'Autorisez la caméra dans le navigateur')
                      : 'Placez votre visage face à la caméra'),
                  orbState: 'listening',
                  avatarMode: 'listening',
                });
                if (failReason === 'no_camera') {
                  // Ne pas marteler getUserMedia (bloque le re-prompt Chrome).
                  // Attendre le clic « Autoriser » / grant réel.
                  setMediaHint('Autorisez la caméra, puis cliquez le bouton');
                  setCameraGranted(false);
                  const granted = await waitForCameraGrant();
                  if (!aliveRef.current || !granted) break;
                  continue;
                }
                await new Promise(r => setTimeout(r, 900));
                continue;
              }
              // Échec dur (inconnu / no_profile) : sortir de la boucle.
              break;
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
              break;
            }
          }

          if (!ok) {
            const canOfferEnroll = failReason === 'no_profile';
            if (canOfferEnroll) {
              setOfferEnroll(true);
              setEnrollHint(
                coreAuthRef.current.userCount > 0
                  ? 'Aucun visage enregistré sur ce Core. Créez le premier profil (admin).'
                  : 'Premier démarrage — créez le profil administrateur.',
              );
            }
            // Pas de throw : on reste sur face — pas de PIN de secours.
            orch.patchHud({
              hudText: canOfferEnroll ? 'PROFIL INCONNU' : 'AUTH LOCK TEMPORARY',
              hudSubtext: canOfferEnroll
                ? (failHudSubtext || 'Profil absent sur ce Core — enrôlement proposé')
                : 'Visage inconnu — placez-vous face à la caméra',
              avatarMode: 'denied',
            });
            setFaceHologram(prev => ({ ...prev, phase: 'locked' }));
            setDenied(true);
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
          factorsRef.current = { ...factorsRef.current, face: true };
          setFactors(f => ({ ...f, face: true }));
          setScanProgress(100);
          setFaceHologram(prev => ({ ...prev, phase: 'success', progress: 100, confidence: faceUserRef.current?.confidence ?? 1 }));
          // Unlock IMMÉDIAT — ne pas attendre profile_load / complete ni
          // laisser le Core réciter systems_ready pendant 30 s.
          const fu = faceUserRef.current;
          void coreUnlock({
            method: fu?.user_id ? 'face' : 'face',
            confidence: fu?.confidence ?? 0.98,
            user_id: fu?.user_id,
            username: fu?.username,
          });
          orch.stop();
        },
      },

      /* ── ACCESS GRANTED (filet si unlock async encore en cours) ───────────── */
      {
        id: 'access_granted',
        hudText: 'IDENTITÉ RECONNUE',
        hudSubtext: 'Empreinte faciale confirmée',
        orbState: 'responding' as const,
        avatarMode: 'ok' as const,
        minDuration: 200,
        pauseAfter: 0,
        onEnter: () => {
          void ensureMic().then((stream) => {
            if (stream) setMediaArmed(true);
          });
        },
      },
      {
        id: 'complete',
        hudText: 'ACCÈS HUD AUTORISÉ',
        hudSubtext: '',
        orbState: 'idle' as const,
        avatarMode: 'ok' as const,
        pauseAfter: 0,
        onComplete: () => {
          if (!faceUserRef.current) return;
          const fu = faceUserRef.current;
          void coreUnlock({
            method: fu?.user_id ? 'face' : 'face',
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
      resolveCamWaiters(false);
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

  /* ── Plus de PIN session — visage uniquement ─────────────────────────────── */

  /* ── Dérivés visuels ─────────────────────────────────────────────────────── */
  // Boot bloqué : l'overlay RESTE, avec ses lignes rouges. L'orchestrateur est
  // arrêté (`isRunning` faux), donc sans ce premier terme l'écran d'échec
  // s'effacerait aussitôt pour laisser place à la caméra.
  const isBoot      = bootBlocked !== null
    || (!!orchState.currentStep?.id.startsWith('boot_') && orchState.isRunning);
  const isAuth      = !isBoot && orchState.isRunning;
  const isComplete  = !isBoot && (orchState.hudText === 'SYSTÈME PRÊT' || !orchState.isRunning);
  const isVoiceScan = false;

  const accentColor = denied || bootBlocked
    ? DANGER
    : isComplete
      ? SUCCESS
      : orchState.orbState === 'listening'
        ? ACCENT
        : ACCENT;

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
      className="fixed inset-0 z-[300] flex flex-col items-center overscroll-contain overflow-x-hidden"
      style={{
        height: '100dvh',
        maxHeight: '100dvh',
        overflowY: isAuth ? 'hidden' : 'auto',
        paddingTop: 'max(0.35rem, env(safe-area-inset-top))',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <AuthCinematicBackdrop />
      <div className="absolute top-3 right-3 z-20">
        <ThemeModeToggle compact />
      </div>

      {/* Phase BOOT */}
      <AnimatePresence>
        {isBoot && (
          <BootOverlay
            checks={checks}
            msg={bootBlocked ?? orchState.hudText}
            subtext={bootBlocked ? 'Rechargez le kiosk ou vérifiez jarvis-core' : orchState.hudSubtext}
            blocked={bootBlocked !== null}
            footer={
              bootBlocked ? (
                <GlassButton tone="danger" active onClick={() => window.location.reload()} style={{ ...orbFont }}>
                  Recharger
                </GlassButton>
              ) : undefined
            }
          />
        )}
      </AnimatePresence>

      {/* Auth : titre + sections équilibrées, orbe hors transform (bas-droite) */}
      <AnimatePresence>
        {isAuth && (
          <motion.div
            key="main"
            className="relative z-10 flex flex-col items-center w-full flex-1 min-h-0 px-3 sm:px-4 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
            style={{
              paddingBottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))',
              paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
            }}
          >
            <div
              className="flex flex-col w-full h-full min-h-0 mx-auto items-center"
              style={{
                maxWidth: 'min(420px, 100%)',
                justifyContent: 'center',
                gap: 'clamp(10px, 1.8vh, 16px)',
              }}
            >
              {/* Titre de page */}
              <header className="text-center shrink-0">
                <p
                  style={{
                    ...visionCaption,
                    color: ACCENT,
                    fontSize: 11,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    margin: 0,
                  }}
                >
                  Jarvis
                </p>
                <h1
                  style={{
                    ...orbF,
                    color: TEXT,
                    fontSize: 'clamp(20px, 3.6vw, 28px)',
                    margin: '4px 0 0',
                    letterSpacing: '-0.02em',
                    fontWeight: 600,
                  }}
                >
                  Identification
                </h1>
                <p style={{ ...visionBody, marginTop: 4, fontSize: 12, color: MUTED }}>
                  Holomat · authentification faciale
                </p>
              </header>

              {/* Une seule section centrale — card ronde Vision Pro */}
              <GlassPanel
                level="regular"
                radius="lg"
                padding="md"
                className="w-full shrink-0"
                style={{
                  pointerEvents: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 'clamp(10px, 1.4vh, 14px)',
                  borderRadius: 32,
                  maxWidth: 360,
                  padding: '18px 16px 16px',
                }}
              >
                <FactorChip label="Visage" ok={factors.face} />

                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${orchState.hudText}|${orchState.hudSubtext}`}
                    className="text-center w-full"
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <p style={{ ...visionTitle, fontSize: 14, color: TEXT, margin: 0 }}>
                      {displayStatus(orchState.hudText || 'Authentification faciale')}
                    </p>
                    {orchState.hudSubtext ? (
                      <p style={{ ...visionBody, fontSize: 11, color: ACCENT, marginTop: 4, opacity: 0.9 }}>
                        {displayStatus(orchState.hudSubtext)}
                      </p>
                    ) : null}
                  </motion.div>
                </AnimatePresence>

                <FaceCamView
                  key={`face-cam-${camEpoch}`}
                  progress={scanProgress}
                  size="clamp(220px, min(56vw, 42dvh), 300px)"
                  active={cameraGranted}
                  label={factors.face ? 'Holomat · prêt' : inFaceFlow ? 'Analyse…' : 'Holomat · caméra'}
                />

                {(inFaceFlow || mediaArmed || cameraGranted || voiceListening) && (
                  <div className="w-full shrink-0 flex justify-center">
                    <AuthVoiceWave
                      mode={
                        denied
                          ? 'denied'
                          : factors.voice
                            ? 'ok'
                            : orchState.isSpeaking || ttsSpeaking
                              ? 'speaking'
                              : voiceListening
                                ? 'listening'
                                : factors.face
                                  ? 'listening'
                                  : scanProgress > 5
                                    ? 'processing'
                                    : 'idle'
                      }
                      level={micLevel}
                      speakLevel={ttsSpeaking ? Math.max(0.35, speakPulse) : 0.45}
                      heard={voiceHeard}
                      phase={faceHologram?.phase}
                    />
                  </div>
                )}

                {!cameraGranted && (
                  <GlassButton tone="accent" active onClick={() => void armMedia()} style={{ ...orbF, fontSize: 12, padding: '6px 12px' }}>
                    Autoriser la caméra
                  </GlassButton>
                )}
                {mediaHint && (
                  <p style={{ ...visionCaption, color: WARNING, fontSize: 9, margin: 0, textAlign: 'center' }}>
                    {mediaHint}
                  </p>
                )}

                {offerEnroll && (
                  <GlassCard
                    level="subtle"
                    radius="md"
                    padding="xs"
                    eyebrow="Enrôlement"
                    title="Créer le profil admin"
                    subtitle={enrollHint}
                    className="w-full"
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <GlassButton
                        tone="accent"
                        active
                        disabled={enrollGateBusy}
                        icon={<UserPlus className="w-3.5 h-3.5" />}
                        onClick={() => void requestEnroll()}
                        style={{ fontSize: 12, padding: '6px 12px' }}
                      >
                        {enrollGateBusy ? 'Ouverture…' : 'Commencer l’enrôlement'}
                      </GlassButton>
                      {enrollGateError && (
                        <p style={{ ...visionCaption, color: DANGER, fontSize: 9, textAlign: 'center', margin: 0 }}>
                          {enrollGateError}
                        </p>
                      )}
                    </div>
                  </GlassCard>
                )}

                {DEV_BUILD && orchState.isRunning && orchState.hudText !== 'SYSTÈME PRÊT' && (
                  <GlassButton
                    tone="warning"
                    active
                    icon={<SkipForward className="w-3 h-3" />}
                    onClick={() => unlockSession({ method: 'dev_skip' })}
                    style={{ fontSize: 11, padding: '5px 10px' }}
                  >
                    Mode démo — passer
                  </GlassButton>
                )}
              </GlassPanel>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orbe auth — portal body = jamais coupée par overflow/transform parents */}
      {isAuth &&
        createPortal(
          <div
            className="pointer-events-none"
            style={{
              position: 'fixed',
              right: 'max(20px, env(safe-area-inset-right))',
              bottom: 'max(28px, calc(env(safe-area-inset-bottom) + 20px))',
              zIndex: 400,
              width: 96,
              height: 96,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'visible',
            }}
            aria-hidden
          >
            <OrbSpatial
              size={72}
              state={
                ttsSpeaking || orchState.isSpeaking
                  ? 'speaking'
                  : orchState.orbState === 'thinking' || orchState.orbState === 'processing'
                    ? 'thinking'
                    : 'idle'
              }
              volume={
                ttsSpeaking || orchState.isSpeaking
                  ? Math.max(0.4, speakPulse)
                  : 0.1
              }
              playbackVolume={
                ttsSpeaking || orchState.isSpeaking ? Math.max(0.4, speakPulse) : 0
              }
            />
          </div>,
          document.body,
        )}
    </motion.div>
  );
}
/* ─── Boot overlay ───────────────────────────────────────────────────────────── */
const CHECK_COLORS: Record<BootCheck['status'], string> = {
  ok: SUCCESS,
  loading: ACCENT,
  failed: DANGER,
  skipped: MUTED,
  pending: MUTED,
};

function BootOverlay(
  { checks, msg, subtext, blocked, footer }:
  { checks: BootCheck[]; msg: string; subtext: string; blocked: boolean; footer?: React.ReactNode },
) {
  const accent = blocked ? DANGER : ACCENT;
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center px-3 overflow-hidden"
      style={{
        height: '100%',
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        justifyContent: 'space-between',
        gap: 12,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Orbe + titre de page en haut */}
      <header className="flex flex-col items-center shrink-0 pt-3" style={{ gap: 20 }}>
        <div
          className="flex items-center justify-center"
          style={{ width: 104, height: 104, overflow: 'visible', flexShrink: 0 }}
        >
          <OrbSpatial size={80} veille={!blocked} state={blocked ? 'idle' : 'listening'} />
        </div>
        <div className="text-center">
          <p
            style={{
              ...visionCaption,
              color: accent,
              fontSize: 12,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              margin: 0,
              fontWeight: 600,
            }}
          >
            JARVIS
          </p>
          <h1
            style={{
              ...visionTitle,
              color: TEXT,
              fontSize: 'clamp(18px, 3.2vw, 24px)',
              margin: '10px 0 0',
              letterSpacing: '-0.02em',
            }}
          >
            Vérification système
          </h1>
          <motion.p
            style={{ ...visionBody, color: accent, fontSize: 12, marginTop: 8 }}
            animate={blocked ? { opacity: 1 } : { opacity: [0.55, 1, 0.55] }}
            transition={blocked ? { duration: 0 } : { duration: 1.8, repeat: Infinity }}
          >
            {displayStatus(msg)}
          </motion.p>
        </div>
      </header>

      {/* Checklist centrée */}
      <GlassPanel
        level="regular"
        radius="md"
        padding="sm"
        className="w-full"
        style={{ maxWidth: 360, flex: '0 1 auto' }}
      >
        <p style={{ ...visionCaption, color: accent, marginBottom: 6, fontSize: 10 }}>Contrôles</p>

        <div className="flex flex-col gap-1 w-full">
          {checks.map((c) => (
            <div
              key={c.label}
              className="flex items-center gap-2"
              style={{
                padding: '5px 8px',
                borderRadius: tokens.radius.sm,
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${tokens.color.border}`,
              }}
            >
              <div className="w-4 flex items-center justify-center flex-shrink-0">
                {c.status === 'ok' && <span style={{ color: CHECK_COLORS.ok, fontSize: 11 }}>✓</span>}
                {c.status === 'failed' && <span style={{ color: CHECK_COLORS.failed, fontSize: 11 }}>✕</span>}
                {c.status === 'loading' && (
                  <motion.span
                    style={{ color: CHECK_COLORS.loading, fontSize: 11 }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  >
                    ●
                  </motion.span>
                )}
                {c.status === 'skipped' && <span style={{ color: CHECK_COLORS.skipped, fontSize: 11 }}>–</span>}
                {c.status === 'pending' && (
                  <span style={{ color: MUTED, fontSize: 11, opacity: 0.5 }}>·</span>
                )}
              </div>
              <span style={{ ...visionBody, fontSize: 12, color: CHECK_COLORS[c.status], flex: 1 }}>
                {BOOT_LABELS[c.component] ?? displayStatus(c.label)}
              </span>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.p
            key={subtext}
            style={{ ...visionBody, fontSize: 11, textAlign: 'center', marginTop: 8 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {displayStatus(subtext)}
          </motion.p>
        </AnimatePresence>

        {blocked && footer ? <div style={{ marginTop: 8 }}>{footer}</div> : null}
      </GlassPanel>

      {/* spacer bas pour équilibre vertical */}
      <div className="shrink-0" style={{ height: 24 }} aria-hidden />
    </motion.div>
  );
}

/* ─── Factor chip ────────────────────────────────────────────────────────────── */
function FactorChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1 rounded-full"
      style={{
        border: `1px solid ${ok ? tokens.color.success : tokens.color.border}`,
        background: ok ? 'color-mix(in srgb, #34C759 14%, transparent)' : tokens.color.surface,
        backdropFilter: tokens.glass,
      }}
    >
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: ok ? tokens.color.success : tokens.color.textMuted }} />
      <span style={{ ...visionCaption, color: ok ? tokens.color.success : tokens.color.textMuted, fontSize: 10 }}>
        {label}
      </span>
    </div>
  );
}
