/**
 * Lecture TTS pilotée par le Core (§3.4).
 *
 * Le Core envoie :
 *   tts_audio     WAV base64 synthétisé (cache / voicebox) → filtre à la lecture
 *   tts_fallback  voicebox indisponible → texte HUD seul (pas de voix OS)
 *   tts_skipped   rien à dire (TTS coupé, phrase vide, barge-in)
 *
 * Filtre lecture : **sec** (pas d’effet). L’hologramme (reverb/echo/chorus)
 * créait un écho micro → fausses commandes STT (2026-08-16).
 *
 * On rend compte au Core avec `voice/playback` : c'est ce retour qui fait
 * repasser l'orbe en `idle` sur la *vraie* fin du son, au lieu d'un délai fixe.
 */
import { stopDev, unlockAudio } from './ttsDev';
import {
  playFilteredAudio,
  resumeVoiceFilterCtx,
  setVoiceFilterPreset,
  setVoiceFilterSink,
  stopVoiceFilter,
} from './voiceFilter';

type Send = (payload: Record<string, unknown>) => unknown;
type SpeakingListener = (speaking: boolean) => void;

export type TtsEventKind = 'tts_audio' | 'tts_fallback' | 'tts_skipped';

let currentUtterance: string | null = null;
let outputDeviceId: string | null = null;
let unlocked = false;
let pending: (() => void) | null = null;
let speaking = false;
let playGen = 0;
const speakingListeners = new Set<SpeakingListener>();

// Sec = WAV brut, zéro post-FX (anti-écho micro).
setVoiceFilterPreset('sec');

function setSpeaking(next: boolean) {
  if (speaking === next) return;
  speaking = next;
  for (const fn of speakingListeners) {
    try {
      fn(speaking);
    } catch {
      /* */
    }
  }
}

/** Orbe = bouche : true pendant la lecture WAV Core. */
export function isTtsSpeaking(): boolean {
  return speaking;
}

export function subscribeTtsSpeaking(fn: SpeakingListener): () => void {
  speakingListeners.add(fn);
  try {
    fn(speaking);
  } catch {
    /* */
  }
  return () => {
    speakingListeners.delete(fn);
  };
}

/** Chrome bloque la lecture avant le 1er geste — mêmes règles que ttsDev. */
function armGestureUnlock() {
  if (typeof window === 'undefined') return;
  const once = () => {
    unlocked = true;
    unlockAudio();
    void resumeVoiceFilterCtx();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
    const run = pending;
    pending = null;
    run?.();
  };
  window.addEventListener('pointerdown', once, { once: true });
  window.addEventListener('keydown', once, { once: true });
}

export function initTtsCore(): void {
  if (typeof window === 'undefined') return;
  armGestureUnlock();
}

/** Déverrouille la lecture WAV (geste utilisateur / clic boot). */
export function unlockTtsPlayback(): void {
  unlocked = true;
  unlockAudio();
  void resumeVoiceFilterCtx();
  const run = pending;
  pending = null;
  run?.();
}

export function setTtsOutputDevice(deviceId: string | null): void {
  outputDeviceId = deviceId;
  void setVoiceFilterSink(deviceId);
}

function releaseCurrent() {
  stopVoiceFilter();
  currentUtterance = null;
  setSpeaking(false);
}

/** Barge-in : coupe le son en cours (WAV Core ou SpeechSynthesis). */
export function stopTtsPlayback(): void {
  playGen += 1;
  releaseCurrent();
  stopDev();
  setSpeaking(false);
}

export function isTtsPlaying(): boolean {
  return speaking;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function playWav(payload: Record<string, unknown>, send: Send): Promise<void> {
  const b64 = String(payload.audio_b64 || '');
  const utteranceId = payload.utterance_id ? String(payload.utterance_id) : null;
  if (!b64) return;

  stopTtsPlayback();
  const gen = playGen;
  currentUtterance = utteranceId;

  const finish = () => {
    if (gen !== playGen) return;
    releaseCurrent();
    send({ type: 'voice', action: 'playback', phase: 'end', utterance_id: utteranceId });
  };

  try {
    await resumeVoiceFilterCtx();
    await playFilteredAudio(base64ToArrayBuffer(b64), finish, {
      sinkId: outputDeviceId,
      preset: 'sec',
    });
    if (gen !== playGen) return;
    setSpeaking(true);
    send({ type: 'voice', action: 'playback', phase: 'start', utterance_id: utteranceId });
  } catch (err) {
    if (!unlocked) {
      console.warn('[tts-core] audio verrouillé — lecture au 1er clic');
      pending = () => {
        void playWav(payload, send);
      };
      return;
    }
    console.warn('[tts-core] lecture filtrée impossible', err);
    if (gen === playGen) releaseCurrent();
    setSpeaking(false);
    send({ type: 'voice', action: 'playback', phase: 'end', utterance_id: utteranceId });
  }
}

async function speakFallback(payload: Record<string, unknown>, send: Send): Promise<void> {
  const text = String(payload.text || '');
  const utteranceId = payload.utterance_id ? String(payload.utterance_id) : null;
  console.warn(
    '[tts-core] fallback navigateur ignoré (voix OS désactivée) ·',
    text.slice(0, 80),
  );
  send({ type: 'voice', action: 'playback', phase: 'end', utterance_id: utteranceId });
}

/**
 * Traite un event TTS du Core. Retourne true si l'event a été consommé —
 * `coreClient` s'en sert pour arrêter de parler tout seul sur
 * `display_notification` dès que le Core pilote la voix.
 */
export function handleTtsEvent(data: Record<string, unknown>, send: Send): boolean {
  const type = String(data.type || '');

  if (type === 'tts_audio') {
    void playWav(data, send);
    return true;
  }

  if (type === 'tts_fallback') {
    console.debug('[tts-core] fallback navigateur ·', data.reason, data.detail ?? '');
    void speakFallback(data, send);
    return true;
  }

  if (type === 'tts_skipped') {
    if (data.reason === 'cancelled') stopTtsPlayback();
    return true;
  }

  if (type === 'tts_cancel') {
    stopTtsPlayback();
    return true;
  }

  return false;
}

export function currentUtteranceId(): string | null {
  return currentUtterance;
}
