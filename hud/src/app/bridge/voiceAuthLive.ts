/**
 * Auth vocale par phrase — HUD → Core `voice/verify_phrase` | `enroll_phrase`.
 * Remplace face auth. Holomat hors de ce chemin.
 */
import { getCoreClient } from './coreClient';
import { ensureMic, getMediaState } from './mediaDevices';
import { recordSegment } from './micRecorder';
import { stopTtsPlayback } from './ttsCore';
import { stopDev } from './ttsDev';
import { listenOnceMs } from './stt';

const REPLY_TIMEOUT_MS = 45_000;
const MIN_BYTES = 2_000;
export const VOICE_CHALLENGE = 'Jarvis, active-toi';

export function formatVoiceChallenge(): string {
  return VOICE_CHALLENGE;
}

export type VoiceVerifyResult =
  | {
      ok: true;
      user_id?: string;
      username?: string;
      confidence?: number;
      text?: string;
    }
  | {
      ok: false;
      reason: string;
      hudSubtext?: string;
      text?: string;
    };

function pickMimeFilename(mime: string): string {
  return mime.includes('ogg') ? 'capture.ogg' : 'capture.webm';
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/** Coupe Jarvis avant d'écouter — sinon le micro capte le TTS boot (« Oh Apple »). */
export async function quietBeforeCapture(): Promise<void> {
  try {
    stopDev();
    stopTtsPlayback();
    const c = getCoreClient();
    c.send({ type: 'auth', action: 'sequence_stop' });
    c.send({ type: 'voice', action: 'cancel' });
  } catch { /* */ }
  await new Promise((r) => window.setTimeout(r, 700));
}

export type PressCaptureSession = {
  release: () => Promise<Blob | null>;
  abort: () => void;
};

/** Enregistre tant que l'utilisateur maintient le bouton. */
export async function beginPressCapture(): Promise<PressCaptureSession | null> {
  await quietBeforeCapture();
  const stream = await ensureMic();
  if (!stream) return null;
  const mime = pickMimeType();
  if (!mime) return null;

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime });
  } catch {
    return null;
  }

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();
  const maxTimer = window.setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, 10_000);

  return {
    release: () =>
      new Promise((resolve) => {
        window.clearTimeout(maxTimer);
        if (recorder.state === 'inactive') {
          resolve(chunks.length ? new Blob(chunks, { type: mime }) : null);
          return;
        }
        recorder.onstop = () =>
          resolve(chunks.length ? new Blob(chunks, { type: mime }) : null);
        recorder.stop();
      }),
    abort: () => {
      window.clearTimeout(maxTimer);
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}

export async function verifyCapturedBlob(
  blob: Blob | null,
  opts?: { usernameHint?: string; roleFilter?: string; browserText?: string },
): Promise<VoiceVerifyResult> {
  if (opts?.browserText?.trim()) {
    const browser = await sendVerifyText(opts.browserText.trim(), opts);
    if (browser.ok) return browser;
  }
  if (!blob || blob.size < MIN_BYTES) {
    const browser = await listenOnceMs(6000);
    if (browser.trim()) {
      const r = await sendVerifyText(browser.trim(), opts);
      if (r.ok) return r;
      return r;
    }
    return { ok: false, reason: 'no_speech', hudSubtext: 'Aucun son — maintenez le bouton en parlant' };
  }
  const audio = await sendVerifyAudio(blob, opts);
  if (audio.ok) return audio;
  if (audio.reason === 'no_match' || audio.reason === 'no_speech') {
    const browser = (opts?.browserText || await listenOnceMs(4000)).trim();
    if (browser) {
      const r = await sendVerifyText(browser, opts);
      if (r.ok) return r;
      return { ...r, text: r.text || browser };
    }
  }
  return audio;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function sendVerifyText(
  text: string,
  opts?: { usernameHint?: string; roleFilter?: string },
): Promise<VoiceVerifyResult> {
  const client = getCoreClient();
  const challenge = formatVoiceChallenge();
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, reason: 'no_speech', hudSubtext: 'Rien entendu' };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: VoiceVerifyResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      off();
      resolve(r);
    };
    const off = client.subscribe((data) => {
      if (data.type === 'VOICE_SUCCESS') {
        finish({
          ok: true,
          user_id: data.user_id ? String(data.user_id) : undefined,
          username: data.username ? String(data.username) : undefined,
          confidence: typeof data.confidence === 'number' ? data.confidence : 0.9,
          text: data.text ? String(data.text) : trimmed,
        });
        return;
      }
      if (data.type === 'VOICE_FAILED') {
        const reason = String(data.reason || 'failed');
        finish({
          ok: false,
          reason,
          text: data.text ? String(data.text) : trimmed,
          hudSubtext:
            reason === 'no_match'
              ? `Entendu « ${trimmed} » — dites « ${challenge} »`
              : `Dites : « ${challenge} »`,
        });
      }
    });
    const timer = window.setTimeout(
      () => finish({ ok: false, reason: 'timeout', hudSubtext: 'Pas de réponse Core' }),
      REPLY_TIMEOUT_MS,
    );
    try {
      client.send({
        type: 'voice',
        action: 'verify_phrase_text',
        text: trimmed,
        ...(opts?.usernameHint ? { username_hint: opts.usernameHint } : {}),
        ...(opts?.roleFilter ? { role_filter: opts.roleFilter } : {}),
      });
    } catch (e) {
      finish({ ok: false, reason: 'send_failed', hudSubtext: String(e) });
    }
  });
}

async function sendVerifyAudio(
  blob: Blob,
  opts?: { usernameHint?: string; roleFilter?: string },
): Promise<VoiceVerifyResult> {
  const client = getCoreClient();
  const audio_b64 = await blobToBase64(blob);
  const filename = pickMimeFilename(blob.type || 'audio/webm');
  const challenge = formatVoiceChallenge();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: VoiceVerifyResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      off();
      resolve(r);
    };
    const off = client.subscribe((data) => {
      if (data.type === 'VOICE_SUCCESS') {
        finish({
          ok: true,
          user_id: data.user_id ? String(data.user_id) : undefined,
          username: data.username ? String(data.username) : undefined,
          confidence: typeof data.confidence === 'number' ? data.confidence : 0.9,
          text: data.text ? String(data.text) : undefined,
        });
        return;
      }
      if (data.type === 'VOICE_FAILED') {
        const reason = String(data.reason || 'failed');
        finish({
          ok: false,
          reason,
          hudSubtext:
            reason === 'no_speech'
              ? 'Je n’ai rien entendu — réessayez'
              : reason === 'no_match'
                ? data.text
                  ? `Entendu « ${String(data.text)} » — dites « ${challenge} »`
                  : `Incorrect — dites « ${challenge} »`
                : `Dites : « ${challenge} »`,
          text: data.text ? String(data.text) : undefined,
        });
      }
    });
    const timer = window.setTimeout(
      () => finish({ ok: false, reason: 'timeout', hudSubtext: 'Pas de réponse Core' }),
      REPLY_TIMEOUT_MS,
    );
    try {
      client.send({
        type: 'voice',
        action: 'verify_phrase',
        audio_b64,
        filename,
        language: 'fr',
        ...(opts?.usernameHint ? { username_hint: opts.usernameHint } : {}),
        ...(opts?.roleFilter ? { role_filter: opts.roleFilter } : {}),
      });
    } catch (e) {
      finish({ ok: false, reason: 'send_failed', hudSubtext: String(e) });
    }
  });
}

export async function runVoiceVerifyLive(opts: {
  isAlive: () => boolean;
  patchHud?: (hudText: string, hudSubtext: string) => void;
  attempts?: number;
  durationMs?: number;
  usernameHint?: string;
  roleFilter?: string;
}): Promise<VoiceVerifyResult> {
  const max = opts.attempts ?? 4;
  const durationMs = opts.durationMs ?? 5_500;
  const challenge = formatVoiceChallenge();

  const stream = await ensureMic();
  if (!stream) {
    const err = getMediaState().micError || 'Micro refusé';
    return { ok: false, reason: 'no_mic', hudSubtext: err };
  }

  for (let i = 0; i < max && opts.isAlive(); i++) {
    opts.patchHud?.(
      'VOICE AUTH',
      i === 0 ? `Dites : « ${challenge} »` : `Réessai ${i + 1}/${max} — « ${challenge} »`,
    );
    await quietBeforeCapture();
    const blob = await recordSegment(durationMs);
    if (!opts.isAlive()) return { ok: false, reason: 'aborted' };
    if (!blob || blob.size < MIN_BYTES) {
      opts.patchHud?.('VOICE AUTH', 'Aucun son — parlez plus fort');
      continue;
    }
    opts.patchHud?.('VOICE AUTH', 'Analyse…');
    const result = await sendVerifyAudio(blob, {
      usernameHint: opts.usernameHint,
      roleFilter: opts.roleFilter,
    });
    if (result.ok) return result;
    if (result.reason === 'no_match' || result.reason === 'no_speech' || result.reason === 'timeout') {
      opts.patchHud?.('VOICE AUTH', result.hudSubtext || 'Réessayez');
      continue;
    }
    return result;
  }
  return {
    ok: false,
    reason: 'timeout',
    hudSubtext: `Échec — dites clairement « ${challenge} »`,
  };
}

export async function commitVoiceEnroll(
  userId: string,
  samples: string[],
): Promise<boolean> {
  const client = getCoreClient();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      off();
      resolve(ok);
    };
    const off = client.subscribe((data) => {
      if (data.type === 'VOICE_ENROLL_OK' && String(data.user_id || '') === userId) {
        finish(true);
      }
      if (data.type === 'VOICE_FAILED') finish(false);
    });
    const timer = window.setTimeout(() => finish(false), REPLY_TIMEOUT_MS);
    try {
      client.send({
        type: 'voice',
        action: 'enroll_phrase',
        user_id: userId,
        samples,
      });
    } catch {
      finish(false);
    }
  });
}
