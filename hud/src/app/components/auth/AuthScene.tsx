/**
 * AuthScene — scène d'authentification SF complète
 * Phases : boot → identification → face_auth → voice_auth → authenticated
 * Cahier §10.1 / §13.10 — piloté par ExperienceOrchestrator (§3.5)
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SkipForward, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FaceCamView } from './FaceCamView';
import { EmmaHologram3D } from './EmmaHologram3D';
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
import { authLogin, getLastUsername } from '../../bridge/authClient';
import { getCoreClient } from '../../bridge/coreClient';
import {
  ensureCameraAndMic,
  ensureMic,
  getCameraStream,
  getMediaState,
  withCamera,
} from '../../bridge/mediaDevices';
import { isCoreOnline } from '../CoreBridge';
import { DEV_BUILD, isAuthBypassEnabled } from '../../bridge/devAuthBypass';
import { isBootAlreadyOk, markBootOk } from './SystemBootGate';

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
  /** Rampe 0→100 en boucle, uniquement pour le mode démo `?holo=1`. */
  const [holoDemo, setHoloDemo] = useState(0);
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

  /** Enrôlement : visage admin connu — plus de PIN. */
  const requestEnroll = useCallback(async () => {
    if (enrollGateBusy) return;
    setEnrollGateBusy(true);
    setEnrollGateError('');
    try {
      if (!isCoreOnline()) {
        setEnrollGateError('Core hors ligne');
        return;
      }
      const result = await runFaceVerifyLive({
        reason: 'enroll_admin',
        isAlive: () => aliveRef.current,
        patchHud: (hudText, hudSubtext) => {
          orchRef.current?.patchHud({ hudText, hudSubtext });
        },
      });
      if (!result.ok || !result.user_id) {
        setEnrollGateError('Visage admin non reconnu — réessayez');
        return;
      }
      const res = await authLogin({
        user_id: result.user_id,
        username: result.username,
        method: 'face',
        confidence: result.confidence ?? 0.95,
      });
      if (!res.ok) {
        setEnrollGateError(res.error || 'Autorisation admin refusée');
        return;
      }
      const role = String(res.event?.user?.role || '').toUpperCase();
      if (role && role !== 'ADMIN') {
        setEnrollGateError('Seul un administrateur peut enrôler');
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
        finish('NOYAU COGNITIF INJOIGNABLE');
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
          finish(data.ok === false ? 'DÉMARRAGE INTERROMPU' : null);
        }
      });

      // HOLOMAT VISION : le Core ne peut pas sonder une caméra qu'il ne tient
      // pas. On l'ouvre ici et on lui rapporte le résultat — c'est ce qui
      // sépare « moteur de reconnaissance chargé » de « flux caméra ouvert ».
      //
      // ⚠ On REND la caméra aussitôt le résultat rapporté. C'est une sonde,
      // pas un usage : savoir si l'objectif répond ne justifie pas de filmer
      // ensuite. Le battement d'extinction de `withCamera` couvre l'enchaînement
      // immédiat sur le scan facial, qui la redemandera de lui-même.
      void withCamera('auth', async stream => {
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
        // Pas d'armMedia() ici : waitForAsync() l'appelle déjà, attendu, juste
        // en dessous. Un second appel non attendu ici court-circuitait le
        // premier — deux getUserMedia() concurrents sur le même périphérique,
        // cause plausible de « Timeout starting video source ».
        waitForAsync: async () => {
          const orch = orchRef.current;
          if (!orch) return;
          setOfferEnroll(false);
          setEnrollHint('');
          setEnrollGateOpen(false);
          setEnrollGateError('');
          setEnrollAdminPin('');

          await armMedia();

          // Caméra armée (ou refusée) : maintenant seulement on démarre la
          // narration Core. Les frames `face_frame` partent juste après.
          if (isCoreOnline() && !faceFailDemo) {
            try {
              getCoreClient().send({ type: 'auth', action: 'sequence_start', sequence: 'auth' });
            } catch {
              // Core injoignable : le HUD continue, l'écran restera muet.
            }
          }

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
                ok = true;
                faceUserRef.current = {
                  user_id: result.user_id,
                  username: result.username,
                  confidence: result.confidence,
                };
                break;
              }
              failReason = result.reason || '';
              failHudSubtext = result.hudSubtext || '';
              const soft =
                failReason === 'no_face' ||
                failReason === 'timeout' ||
                failReason === 'no_camera';
              if (soft) {
                orch.patchHud({
                  hudText: failReason === 'no_camera' ? 'CAMÉRA REQUISE' : 'PRÉSENCE REQUISE',
                  hudSubtext:
                    failReason === 'no_camera'
                      ? (getMediaState().cameraError || 'Autorisez la caméra dans le navigateur')
                      : 'Placez-vous face à la caméra',
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
                  ? 'Profil facial absent ou non reconnu. Validation admin requise avant enrôlement.'
                  : 'Aucun profil facial sur ce Core — premier enrôlement.',
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

  /** `?holo=1` en dev : force le hologramme pour régler l'effet sans devoir
   *  refaire une authentification faciale complète à chaque retouche. */
  const forceHolo =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('holo');

  useEffect(() => {
    if (!forceHolo) return;
    const id = setInterval(() => setHoloDemo(p => (p >= 100 ? 0 : p + 2)), 120);
    return () => clearInterval(id);
  }, [forceHolo]);

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <motion.div
      className="fixed inset-0 z-[300] flex flex-col items-center overflow-x-hidden overflow-y-auto overscroll-contain"
      style={{
        background: 'radial-gradient(ellipse at 50% 30%, #071828 0%, #020509 70%)',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
      }}
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
            subtext={bootBlocked ? 'Rechargez le kiosk ou vérifiez jarvis-core' : orchState.hudSubtext}
            blocked={bootBlocked !== null}
            footer={
              bootBlocked ? (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-xl px-4 py-2 cursor-pointer"
                  style={{
                    ...orbF,
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    color: '#ef4444',
                    border: '1px solid rgba(239,68,68,0.4)',
                    background: 'rgba(239,68,68,0.08)',
                  }}
                >
                  RECHARGER
                </button>
              ) : undefined
            }
          />
        )}
      </AnimatePresence>

      {/* Contenu principal — visible après boot */}
      <AnimatePresence>
        {isAuth && (
          <motion.div
            key="main"
            className="flex flex-col items-center gap-3 sm:gap-5 w-full max-w-md px-4 sm:px-6 py-4 my-auto min-h-0"
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

            <div className="flex gap-3">
              <FactorChip label="VISAGE" ok={factors.face} />
            </div>

            {/* Caméra Holomat + reconstruction holographique par-dessus.
                Même boîte, aucune modification de la mise en page : le canvas
                d'EmmaHologram3D est transparent (`alpha: true`, clear à 0), il
                se superpose au flux réel. La progression vient de la VRAIE
                confiance biométrique renvoyée par YuNet/SFace — le hologramme
                se construit au rythme de la reconnaissance, il ne joue pas une
                animation décorative dans le vide. */}
            <div className="flex items-end justify-center w-full shrink-0">
              <div className="relative w-full flex justify-center" style={{ maxHeight: '40dvh' }}>
                <FaceCamView
                  key={`face-cam-${camEpoch}`}
                  progress={scanProgress}
                  active={inFaceFlow || scanProgress > 0 || mediaArmed || cameraGranted}
                  label={factors.face ? 'HOLOMAT · OK' : 'HOLOMAT · CAM'}
                />
                {(inFaceFlow || forceHolo) && (
                  <div
                    className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden mx-auto"
                    style={{
                      width: 'min(92vw, 420px)',
                      height: '100%',
                      opacity: Math.min(0.92, 0.25 + faceHologram.progress / 130),
                      transition: 'opacity 400ms linear',
                      mixBlendMode: 'screen',
                    }}
                  >
                    <EmmaHologram3D
                      size={Math.min(280, typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.32) : 280)}
                      progress={forceHolo ? holoDemo : faceHologram.progress}
                      buildPhase={forceHolo ? 'reconstruction' : faceHologram.phase}
                      speaking={orchState.isSpeaking}
                    />
                  </div>
                )}
              </div>
            </div>

            {!cameraGranted && (
              <button
                type="button"
                onClick={() => void armMedia()}
                className="w-full max-w-xs rounded-xl px-4 py-3 cursor-pointer shrink-0"
                style={{
                  ...orbF,
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  color: '#00e5ff',
                  background: 'rgba(0,229,255,0.1)',
                  border: '1px solid rgba(0,229,255,0.45)',
                }}
              >
                AUTORISER CAMÉRA + MICRO
              </button>
            )}
            {mediaHint && (
              <p style={{ ...mono, color: 'rgba(245,158,11,0.85)', fontSize: 9, letterSpacing: '0.08em', textAlign: 'center' }}>
                {mediaHint}
              </p>
            )}
            {offerEnroll && (
              <div className="w-full max-w-sm flex flex-col items-center gap-2 shrink-0">
                <p style={{ ...mono, color: 'rgba(255,255,255,0.72)', fontSize: 10, letterSpacing: '0.08em', textAlign: 'center' }}>
                  {enrollHint}
                </p>
                <button
                  type="button"
                  onClick={() => void requestEnroll()}
                  disabled={enrollGateBusy}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 cursor-pointer"
                  style={{
                    background: 'rgba(25,240,216,0.1)',
                    border: '1px solid rgba(25,240,216,0.45)',
                    opacity: enrollGateBusy ? 0.6 : 1,
                  }}
                >
                  <UserPlus className="w-4 h-4" style={{ color: '#19f0d8' }} />
                  <span style={{ ...orbF, color: '#19f0d8', fontSize: 10, letterSpacing: '0.12em' }}>
                    {enrollGateBusy ? 'VISAGE ADMIN…' : 'ENRÔLER — VISAGE ADMIN'}
                  </span>
                </button>
                {enrollGateError && (
                  <p style={{ ...mono, color: 'rgba(239,68,68,0.85)', fontSize: 9, letterSpacing: '0.08em', textAlign: 'center' }}>
                    {enrollGateError}
                  </p>
                )}
              </div>
            )}

            {/* Message HUD courant */}
            <AnimatePresence mode="wait">
              <motion.div
                key={orchState.hudText}
                className="text-center shrink-0"
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

            {/* Overlay scan barre */}
            <PhaseOverlay
              stepId={orchState.currentStep?.id ?? ''}
              scanProgress={scanProgress}
              accentColor={accentColor}
              hudText={orchState.hudText}
            />

            {/* Dev only — pas de PIN session */}
            {DEV_BUILD && orchState.isRunning && orchState.hudText !== 'SYSTÈME PRÊT' && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => unlockSession({ method: 'dev_skip' })}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2 cursor-pointer shrink-0"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}
              >
                <SkipForward className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
                <span style={{ ...mono, color: '#f59e0b', fontSize: 9, letterSpacing: '0.08em' }}>
                  MODE DÉMO — PASSER L&apos;AUTH
                </span>
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orbe — desktop */}
      {isAuth && (
        <motion.div
          className="hidden md:flex absolute right-6 bottom-6 flex-col items-center gap-1 pointer-events-none"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div style={{ width: 64, height: 64 }}>
            <Orb
              state={orchState.orbState}
              volume={isVoiceScan ? 0.6 : 0.1}
              playbackVolume={0}
            />
          </div>
          <span style={{ ...mono, color: 'rgba(0,229,255,0.4)', fontSize: 7, letterSpacing: '0.1em' }}>
            IDLE
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
      className="absolute inset-0 flex flex-col items-center justify-start gap-3 sm:gap-4 px-4 sm:px-8 overflow-y-auto"
      style={{ background: '#020509', paddingTop: 'min(10vh, 72px)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Orbe haute — tiers supérieur, pas centrée avec la checklist */}
      <div className="shrink-0" style={{ width: 88, height: 88, marginBottom: 8 }}>
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
