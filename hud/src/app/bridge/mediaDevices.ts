/**
 * Accès caméra / micro Windows via getUserMedia (dev HUD).
 * Holomat / Whisper viendront plus tard — ici on active les périphériques.
 */

export type MediaPermissionStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'error';

export interface MediaDevicesState {
  mic: MediaPermissionStatus;
  camera: MediaPermissionStatus;
  micError?: string;
  cameraError?: string;
}

type Listener = (s: MediaDevicesState) => void;

let micStream: MediaStream | null = null;
let cameraStream: MediaStream | null = null;
let state: MediaDevicesState = { mic: 'idle', camera: 'idle' };
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(fn => fn({ ...state }));
}

export function getMediaState(): MediaDevicesState {
  return { ...state };
}

export function subscribeMedia(fn: Listener): () => void {
  listeners.add(fn);
  fn(getMediaState());
  return () => { listeners.delete(fn); };
}

function deviceConstraints(kind: 'audio' | 'video'): MediaTrackConstraints | boolean {
  const micId = import.meta.env.VITE_DEV_MIC_DEVICE_ID as string | undefined;
  const camId = import.meta.env.VITE_DEV_CAMERA_DEVICE_ID as string | undefined;
  if (kind === 'audio') {
    if (micId) return { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true };
    return { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  }
  if (camId) return { deviceId: { exact: camId }, width: { ideal: 1280 }, height: { ideal: 720 } };
  // Pas de facingMode exact : beaucoup de webcams USB Windows le rejettent
  return { width: { ideal: 1280 }, height: { ideal: 720 } };
}

export async function ensureMic(): Promise<MediaStream | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    state = { ...state, mic: 'error', micError: 'mediaDevices indisponible' };
    emit();
    return null;
  }
  if (micStream?.getAudioTracks().some(t => t.readyState === 'live')) {
    state = { ...state, mic: 'granted', micError: undefined };
    emit();
    return micStream;
  }
  state = { ...state, mic: 'requesting', micError: undefined };
  emit();
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: deviceConstraints('audio'), video: false });
    state = { ...state, mic: 'granted', micError: undefined };
    emit();
    console.info('[media] micro OK', micStream.getAudioTracks().map(t => t.label));
    return micStream;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state = { ...state, mic: 'denied', micError: msg };
    emit();
    console.warn('[media] micro refusé', msg);
    return null;
  }
}

export async function ensureCamera(): Promise<MediaStream | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    state = { ...state, camera: 'error', cameraError: 'mediaDevices indisponible' };
    emit();
    return null;
  }
  if (cameraStream?.getVideoTracks().some(t => t.readyState === 'live')) {
    state = { ...state, camera: 'granted', cameraError: undefined };
    emit();
    return cameraStream;
  }
  state = { ...state, camera: 'requesting', cameraError: undefined };
  emit();
  try {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: deviceConstraints('video'),
        audio: false,
      });
    } catch {
      // Fallback ultra-permissif (contraintes idéales refusées)
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    state = { ...state, camera: 'granted', cameraError: undefined };
    emit();
    console.info('[media] caméra OK', cameraStream.getVideoTracks().map(t => t.label));
    return cameraStream;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state = { ...state, camera: 'denied', cameraError: msg };
    emit();
    console.warn('[media] caméra refusée', msg);
    return null;
  }
}

/** Demande caméra + micro (permissions Windows / Chrome). */
export async function ensureCameraAndMic(): Promise<MediaDevicesState> {
  await Promise.all([ensureMic(), ensureCamera()]);
  return getMediaState();
}

export function getMicStream(): MediaStream | null {
  return micStream;
}

export function getCameraStream(): MediaStream | null {
  return cameraStream;
}

export function stopMic(): void {
  micStream?.getTracks().forEach(t => t.stop());
  micStream = null;
  state = { ...state, mic: 'idle' };
  emit();
}

export function stopCamera(): void {
  cameraStream?.getTracks().forEach(t => t.stop());
  cameraStream = null;
  state = { ...state, camera: 'idle' };
  emit();
}

export function stopAllMedia(): void {
  stopMic();
  stopCamera();
}

/* ------------------------------------------------------------------ */
/* Arbitrage caméra — allumée sur besoin, éteinte sinon                */
/* ------------------------------------------------------------------ */

/**
 * Raisons légitimes d'allumer la caméra. La liste est fermée exprès : une
 * caméra qui s'allume doit toujours pouvoir être expliquée à la personne
 * filmée, et un nom libre laisserait passer n'importe quoi.
 */
export type CameraReason =
  | 'auth'          // identification faciale au démarrage
  | 'unlock'        // déverrouillage de session
  | 'enrollment'    // création d'un profil
  | 'holomat'       // analyse d'un objet, à la demande
  | 'gesture'       // calibrage / pilotage gestuel
  | 'preview'       // aperçu dans les réglages
  | 'kiosk';        // TV salon : présence / face / gestes en continu

/**
 * Détenteurs actuels. Un compteur global ne suffit pas : deux composants
 * peuvent demander la caméra pour la MÊME raison (l'aperçu des réglages monté
 * deux fois), et un `Set` de raisons perdrait l'un des deux relâchements.
 */
const cameraHolders = new Map<CameraReason, number>();

/**
 * Extinction différée.
 *
 * ⚠ Sans ce délai, la caméra s'éteint puis se rallume entre deux étapes qui
 * se passent le relais — l'écran d'authentification qui cède la main au
 * panneau de scan, par exemple. Rallumer coûte une à deux secondes sur un
 * portable, fait clignoter la diode de confidentialité, et donne l'impression
 * que le HUD hésite. On laisse donc un battement avant de couper vraiment.
 */
const RELEASE_GRACE_MS = 1_500;
let releaseTimer: number | null = null;

const cancelPendingRelease = () => {
  if (releaseTimer !== null) {
    window.clearTimeout(releaseTimer);
    releaseTimer = null;
  }
};

/** Qui tient la caméra en ce moment — pour l'affichage et le diagnostic. */
export function cameraHoldersList(): CameraReason[] {
  return [...cameraHolders.entries()].filter(([, n]) => n > 0).map(([r]) => r);
}

/**
 * Demande la caméra pour une raison précise.
 *
 * ⚠ Tout `acquireCamera` doit avoir son `releaseCamera` — de préférence dans
 * le nettoyage d'un `useEffect`. C'est ce qui manquait : neuf endroits du HUD
 * appelaient `ensureCamera()` et **aucun** n'appelait `stopCamera()`. La
 * webcam restait donc allumée en permanence dès le premier démarrage, diode
 * comprise, y compris pendant qu'on ne faisait rien d'autre que discuter.
 */
export async function acquireCamera(reason: CameraReason): Promise<MediaStream | null> {
  cancelPendingRelease();
  cameraHolders.set(reason, (cameraHolders.get(reason) ?? 0) + 1);
  // On reste inscrit même si l'accès est refusé : le contrat est symétrique,
  // un `acquire` égale toujours un `release`. Une exception au refus obligerait
  // chaque appelant à distinguer deux cas — et c'est exactement le genre
  // d'asymétrie qui finit par laisser une caméra allumée.
  return ensureCamera();
}

/** Rend la caméra. Elle s'éteint quand le dernier détenteur l'a relâchée. */
export function releaseCamera(reason: CameraReason): void {
  const n = (cameraHolders.get(reason) ?? 0) - 1;
  if (n > 0) cameraHolders.set(reason, n);
  else cameraHolders.delete(reason);

  if (cameraHolders.size > 0) return;

  cancelPendingRelease();
  releaseTimer = window.setTimeout(() => {
    releaseTimer = null;
    // Une demande a pu arriver pendant le battement.
    if (cameraHolders.size === 0) {
      console.info('[media] caméra éteinte — plus aucun besoin');
      stopCamera();
    }
  }, RELEASE_GRACE_MS);
}

/**
 * Tient la caméra le temps d'une opération, et la rend quoi qu'il arrive.
 *
 * À préférer au couple `acquireCamera` / `releaseCamera` dès qu'il y a
 * plusieurs sorties possibles : le `finally` couvre le retour normal, le
 * retour anticipé ET l'exception. Un scan facial qui échoue ne doit pas
 * laisser la webcam allumée derrière lui.
 */
export async function withCamera<T>(
  reason: CameraReason,
  fn: (stream: MediaStream | null) => Promise<T>,
): Promise<T> {
  const stream = await acquireCamera(reason);
  try {
    return await fn(stream);
  } finally {
    releaseCamera(reason);
  }
}

/**
 * Coupe la caméra sans condition, détenteurs compris.
 *
 * Réservé au verrouillage de session et au bouton de confidentialité : là,
 * couper est un ordre, pas une optimisation.
 */
export function forceReleaseCamera(): void {
  cancelPendingRelease();
  cameraHolders.clear();
  stopCamera();
}

/*
 * Le MICRO ne suit pas cette discipline, et c'est voulu : JARVIS doit pouvoir
 * être appelé à la voix à tout moment, ce qui suppose d'écouter en
 * permanence. La caméra, elle, n'a aucune raison de filmer entre deux
 * demandes. Les deux périphériques n'ont pas le même contrat, ils n'ont donc
 * pas la même gestion.
 */


/** Liste caméras après permission (labels vides sinon). */
export async function listVideoInputs(): Promise<{ id: string; name: string }[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
  // Débloque les labels
  if (!cameraStream) {
    await ensureCamera().catch(() => null);
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter(d => d.kind === 'videoinput')
    .map((d, i) => ({ id: d.deviceId, name: d.label || `Caméra ${i + 1}` }));
}

/** Liste micros. */
export async function listAudioInputs(): Promise<{ id: string; name: string }[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
  if (!micStream) await ensureMic().catch(() => null);
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter(d => d.kind === 'audioinput')
    .map((d, i) => ({ id: d.deviceId, name: d.label || `Micro ${i + 1}` }));
}

/** Niveau RMS micro 0..1 (pour VoiceBar). */
export function createMicLevelMeter(stream: MediaStream): {
  getLevel: () => number;
  dispose: () => void;
} {
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  return {
    getLevel: () => {
      if (ctx.state === 'suspended') void ctx.resume();
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / data.length) * 4);
    },
    dispose: () => {
      try { src.disconnect(); } catch { /* */ }
      void ctx.close();
    },
  };
}
