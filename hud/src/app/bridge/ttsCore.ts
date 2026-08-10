/**
 * Lecture TTS pilotée par le Core (§3.4).
 *
 * Le Core envoie :
 *   tts_audio     WAV base64 synthétisé par voicebox → on le joue ici
 *   tts_fallback  voicebox indisponible → texte HUD seul (pas de voix OS)
 *   tts_skipped   rien à dire (TTS coupé, phrase vide, barge-in)
 *
 * On rend compte au Core avec `voice/playback` : c'est ce retour qui fait
 * repasser l'orbe en `idle` sur la *vraie* fin du son, au lieu d'un délai fixe.
 *
 * Le son sort d'ici et pas de la machine voicebox : barge-in, périphérique de
 * sortie et synchro de l'orbe restent côté client, et le comportement est
 * identique en dev (Windows) et sur le NUC.
 */
import { stopDev, unlockAudio } from './ttsDev';

type Send = (payload: Record<string, unknown>) => unknown;

export type TtsEventKind = 'tts_audio' | 'tts_fallback' | 'tts_skipped';

let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let currentUtterance: string | null = null;
let outputDeviceId: string | null = null;
let unlocked = false;
let pending: (() => void) | null = null;

/** Chrome bloque la lecture avant le 1er geste — mêmes règles que ttsDev. */
function armGestureUnlock() {
  if (typeof window === 'undefined') return;
  const once = () => {
    unlocked = true;
    unlockAudio();
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
  const run = pending;
  pending = null;
  run?.();
}

export function setTtsOutputDevice(deviceId: string | null): void {
  outputDeviceId = deviceId;
}

function releaseCurrent() {
  if (current) {
    current.onended = null;
    current.onerror = null;
    try { current.pause(); } catch { /* */ }
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  current = null;
  currentUtterance = null;
}

/** Barge-in : coupe le son en cours (WAV Core ou SpeechSynthesis). */
export function stopTtsPlayback(): void {
  releaseCurrent();
  stopDev();
}

export function isTtsPlaying(): boolean {
  return current !== null;
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function applySink(audio: HTMLAudioElement) {
  if (!outputDeviceId) return;
  const withSink = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
  if (typeof withSink.setSinkId !== 'function') return;
  try {
    await withSink.setSinkId(outputDeviceId);
  } catch (err) {
    console.debug('[tts-core] setSinkId refusé', err);
  }
}

async function playWav(payload: Record<string, unknown>, send: Send): Promise<void> {
  const b64 = String(payload.audio_b64 || '');
  const utteranceId = payload.utterance_id ? String(payload.utterance_id) : null;
  if (!b64) return;

  stopTtsPlayback();

  const url = URL.createObjectURL(base64ToBlob(b64, 'audio/wav'));
  const audio = new Audio(url);
  audio.preload = 'auto';
  current = audio;
  currentUrl = url;
  currentUtterance = utteranceId;

  await applySink(audio);

  const finish = () => {
    // Une phrase plus récente a pris la main : ne pas fermer la sienne.
    if (current !== audio) return;
    releaseCurrent();
    send({ type: 'voice', action: 'playback', phase: 'end', utterance_id: utteranceId });
  };

  audio.onended = finish;
  audio.onerror = () => {
    console.warn('[tts-core] lecture WAV impossible — pas de fallback OS');
    if (current === audio) releaseCurrent();
    send({ type: 'voice', action: 'playback', phase: 'end', utterance_id: utteranceId });
  };

  // Autoplay refusé : rejouer au 1er geste plutôt que basculer sur la voix OS.
  try {
    await audio.play();
    send({ type: 'voice', action: 'playback', phase: 'start', utterance_id: utteranceId });
  } catch (err) {
    if (!unlocked) {
      console.warn('[tts-core] audio verrouillé — lecture au 1er clic');
      pending = () => { void playWav(payload, send); };
      return;
    }
    console.warn('[tts-core] play() refusé — pas de fallback SpeechSynthesis', err);
    if (current === audio) releaseCurrent();
    send({ type: 'voice', action: 'playback', phase: 'end', utterance_id: utteranceId });
  }
}

async function speakFallback(payload: Record<string, unknown>, send: Send): Promise<void> {
  const text = String(payload.text || '');
  const utteranceId = payload.utterance_id ? String(payload.utterance_id) : null;
  // Pas de SpeechSynthesis navigateur : sur Windows/téléphone ça mélange une
  // voix OS avec le cache voicebox JARVIS. Le texte reste à l'écran via le HUD.
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
