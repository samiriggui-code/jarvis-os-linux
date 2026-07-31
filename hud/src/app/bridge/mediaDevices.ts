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
