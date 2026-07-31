/**
 * Auth faciale live — caméra HUD → Holomat Core (OpenCV).
 * Remplace faceAuthSimulator quand Core + caméra OK.
 */
import { getCoreClient } from './coreClient';
import { ensureCamera, getCameraStream } from './mediaDevices';
import type { FaceHologramState } from '../engine/faceHologramTypes';

export type FaceLiveEvent = {
  type: string;
  progress?: number;
  confidence?: number;
  phase?: string;
  reason?: string;
  hudText?: string;
  hudSubtext?: string;
  user_id?: string;
  username?: string;
  mode?: string;
  samples?: number;
  needed?: number;
};

function isFaceEvent(d: Record<string, unknown>): boolean {
  const t = d.type;
  return t === 'FACE_PROGRESS' || t === 'FACE_SUCCESS' || t === 'FACE_FAILED' || t === 'FACE_OBSTRUCTION';
}

async function grabJpegB64(stream: MediaStream, quality = 0.72): Promise<string | null> {
  // Une seule <video> réutilisée — sinon la preview clignote / reste noire
  const video = ensureCaptureVideo(stream);
  try {
    if (video.paused) await video.play();
  } catch {
    return null;
  }
  if (video.readyState < 2) {
    await new Promise(r => setTimeout(r, 80));
  }
  const w = video.videoWidth || 0;
  const h = video.videoHeight || 0;
  if (w < 16 || h < 16) return null;

  const canvas = grabCanvas || (grabCanvas = document.createElement('canvas'));
  const maxW = 480;
  const scale = Math.min(1, maxW / w);
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl.replace(/^data:image\/jpeg;base64,/, '');
}

let grabVideo: HTMLVideoElement | null = null;
let grabCanvas: HTMLCanvasElement | null = null;

function ensureCaptureVideo(stream: MediaStream): HTMLVideoElement {
  if (!grabVideo) {
    grabVideo = document.createElement('video');
    grabVideo.muted = true;
    grabVideo.playsInline = true;
    grabVideo.setAttribute('playsinline', 'true');
    // hors écran, pas dans le DOM HUD
    grabVideo.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(grabVideo);
  }
  if (grabVideo.srcObject !== stream) {
    grabVideo.srcObject = stream;
  }
  return grabVideo;
}

async function sendFrame(payload: Record<string, unknown>): Promise<FaceLiveEvent> {
  const client = getCoreClient();
  const data = await client.request(
    { type: 'holomat', action: 'face_frame', ...payload },
    isFaceEvent,
    6000,
  );
  return data as unknown as FaceLiveEvent;
}

export async function runFaceEnrollLive(opts: {
  username: string;
  isAlive: () => boolean;
  patchFace: (u: Partial<FaceHologramState>) => void;
  patchHud?: (hudText: string, hudSubtext: string) => void;
  speak?: (t: string) => Promise<void>;
}): Promise<boolean> {
  const stream = (await ensureCamera()) || getCameraStream();
  if (!stream) {
    opts.patchFace({ phase: 'obstruction', obstruction: true });
    return false;
  }

  const client = getCoreClient();
  try {
    const begin = await client.request(
      { type: 'holomat', action: 'face_enroll_begin', username: opts.username },
      d => d.type === 'FACE_PROGRESS' || d.type === 'holomat_error',
      8000,
    );
    if (begin.type === 'holomat_error') {
      console.warn('[holomat] face_enroll_begin', begin.error);
      opts.patchHud?.(
        'HOLOMAT INDISPONIBLE',
        String(begin.error || 'face_engine_unavailable'),
      );
      opts.patchFace({ phase: 'obstruction', obstruction: true });
      return false;
    }
  } catch (e) {
    console.warn('[holomat] begin failed', e);
    opts.patchHud?.('HOLOMAT TIMEOUT', 'Relancer python -m jarvis_core');
    opts.patchFace({ phase: 'obstruction', obstruction: true });
    return false;
  }

  opts.patchFace({ phase: 'camera_on', progress: 0, confidence: 0 });
  if (opts.speak) await opts.speak('Positionnez-vous face à la caméra.');

  const t0 = Date.now();
  const timeoutMs = 45000;
  while (opts.isAlive() && Date.now() - t0 < timeoutMs) {
    const jpeg = await grabJpegB64(stream);
    if (!jpeg) {
      await new Promise(r => setTimeout(r, 200));
      continue;
    }
    let ev: FaceLiveEvent;
    try {
      ev = await sendFrame({ mode: 'enroll', username: opts.username, jpeg_b64: jpeg });
    } catch {
      await new Promise(r => setTimeout(r, 250));
      continue;
    }

    const progress = Number(ev.progress ?? 0);
    const conf = Number(ev.confidence ?? 0);
    const phase = (ev.phase as FaceHologramState['phase']) || 'reconstruction';
    opts.patchFace({
      progress,
      confidence: conf,
      phase: phase === 'success' ? 'success' : phase,
      obstruction: ev.reason === 'too_small' || ev.reason === 'no_face',
    });
    opts.patchHud?.(ev.hudText || 'BIOMETRIC SYNTHESIS', ev.hudSubtext || `${Math.round(progress)}%`);

    if (ev.type === 'FACE_SUCCESS') {
      opts.patchFace({ phase: 'success', progress: 100, confidence: conf || 1 });
      if (opts.speak) await opts.speak('Empreinte faciale enregistrée avec succès.');
      return true;
    }
    await new Promise(r => setTimeout(r, 180));
  }
  opts.patchFace({ phase: 'deconstruct', progress: 0 });
  return false;
}

export async function runFaceVerifyLive(opts: {
  username?: string;
  isAlive: () => boolean;
  patchFace: (u: Partial<FaceHologramState>) => void;
  patchHud?: (hudText: string, hudSubtext: string) => void;
  speak?: (t: string) => Promise<void>;
  /** frames successives au-dessus du seuil avant lock */
  stableNeeded?: number;
}): Promise<{ ok: boolean; user_id?: string; username?: string; confidence: number }> {
  const stream = (await ensureCamera()) || getCameraStream();
  if (!stream) {
    opts.patchFace({ phase: 'obstruction', obstruction: true });
    return { ok: false, confidence: 0 };
  }

  opts.patchFace({ phase: 'camera_on', progress: 0, confidence: 0 });
  if (opts.speak) await opts.speak('Activation du module de perception visuelle.');

  const need = opts.stableNeeded ?? 2;
  let hits = 0;
  let lastUser: { user_id?: string; username?: string; confidence: number } | null = null;
  const t0 = Date.now();
  const timeoutMs = 35000;

  while (opts.isAlive() && Date.now() - t0 < timeoutMs) {
    const jpeg = await grabJpegB64(stream);
    if (!jpeg) {
      await new Promise(r => setTimeout(r, 200));
      continue;
    }
    let ev: FaceLiveEvent;
    try {
      ev = await sendFrame({
        mode: 'verify',
        username: opts.username,
        jpeg_b64: jpeg,
      });
    } catch {
      await new Promise(r => setTimeout(r, 250));
      continue;
    }

    const progress = Number(ev.progress ?? 0);
    const conf = Number(ev.confidence ?? 0);
    const phase = (ev.phase as FaceHologramState['phase']) || 'reconstruction';
    opts.patchFace({
      progress,
      confidence: conf,
      phase: phase === 'success' ? 'reconstruction' : phase,
      obstruction: ev.reason === 'too_small' || ev.reason === 'no_face',
    });
    opts.patchHud?.(ev.hudText || 'BIOMETRIC SYNTHESIS', ev.hudSubtext || `${Math.round(progress)}%`);

    if (ev.type === 'FACE_SUCCESS' && ev.user_id) {
      hits += 1;
      lastUser = { user_id: ev.user_id, username: ev.username, confidence: conf };
      if (hits >= need) {
        opts.patchFace({ phase: 'success', progress: 100, confidence: conf });
        if (opts.speak) await opts.speak('Signature biométrique validée.');
        return { ok: true, ...lastUser, confidence: conf };
      }
    } else if (ev.type === 'FACE_FAILED') {
      opts.patchFace({ phase: 'deconstruct', progress: 0 });
      return { ok: false, confidence: conf };
    } else {
      hits = 0;
    }
    await new Promise(r => setTimeout(r, 180));
  }

  opts.patchFace({ phase: 'deconstruct', progress: 0 });
  if (opts.speak) await opts.speak('Signature biométrique insuffisante.');
  return { ok: false, confidence: lastUser?.confidence ?? 0 };
}

export async function commitFaceEnroll(username: string, userId: string): Promise<boolean> {
  const client = getCoreClient();
  try {
    const data = await client.request(
      { type: 'holomat', action: 'face_enroll_commit', username, user_id: userId },
      d => d.type === 'face_enroll_commit_result',
      8000,
    );
    return Boolean(data.ok);
  } catch {
    return false;
  }
}
