/**
 * Auth faciale live — caméra HUD → Holomat Core (OpenCV).
 * Remplace faceAuthSimulator quand Core + caméra OK.
 */
import { getCoreClient } from './coreClient';
import { ensureCamera, getCameraStream, withCamera } from './mediaDevices';
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
  // Obstruction = phase sur FACE_PROGRESS (Core Holomat), pas un type WS dédié.
  // holomat_error : sinon request() timeout 6 s sans jamais loguer l’échec Core.
  return (
    t === 'FACE_PROGRESS' ||
    t === 'FACE_SUCCESS' ||
    t === 'FACE_FAILED' ||
    t === 'holomat_error'
  );
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    const t = window.setTimeout(() => {
      if (done) return;
      done = true;
      resolve(null);
    }, ms);
    p.then(
      (v) => {
        if (done) return;
        done = true;
        window.clearTimeout(t);
        resolve(v);
      },
      () => {
        if (done) return;
        done = true;
        window.clearTimeout(t);
        resolve(null);
      },
    );
  });
}

async function waitForPreviewVideo(ms = 1200): Promise<HTMLVideoElement | null> {
  const hit = findLivePreviewVideo();
  if (hit) return hit;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 80));
    const v = findLivePreviewVideo();
    if (v) return v;
  }
  return findLivePreviewVideo();
}

async function grabJpegB64(stream: MediaStream | null, quality = 0.85): Promise<string | null> {
  // 0) Preview HUD visible — c’est LA source fiable (« je vois la caméra »).
  //    Attendre un peu : FaceCamView monte en parallèle du premier grab.
  const preview = await waitForPreviewVideo(900);
  if (preview && preview.videoWidth >= 16) {
    const fromPreview = canvasFromVideo(preview, quality);
    if (fromPreview) {
      console.info(`[FACE] frame captured size=${fromPreview.length} via=preview`);
      return fromPreview;
    }
  }

  if (!stream) {
    console.warn('[FACE] grabJpeg: pas de MediaStream et preview trop tôt');
    return null;
  }

  // 1) ImageCapture — timeout strict : grabFrame() peut rester pendu à jamais
  //    sur certains Chrome/webcam, et bloquait toute la boucle face_frame.
  const track = stream.getVideoTracks().find((t) => t.readyState === 'live');
  if (track && typeof ImageCapture !== 'undefined') {
    try {
      const ic = new ImageCapture(track);
      const bitmap = await withTimeout(ic.grabFrame(), 800);
      if (bitmap) {
        const canvas = grabCanvas || (grabCanvas = document.createElement('canvas'));
        const maxW = 960;
        const scale = Math.min(1, maxW / Math.max(bitmap.width, 1));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          bitmap.close?.();
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const b64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
          console.info(`[FACE] frame captured size=${b64.length} via=ImageCapture`);
          return b64;
        }
        bitmap.close?.();
      }
    } catch {
      // Fallback <video> ci-dessous.
    }
  }

  const video = ensureCaptureVideo(stream);
  try {
    video.muted = true;
    if (video.paused) await video.play();
  } catch {
    return null;
  }

  if ((video.videoWidth || 0) < 16) {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        video.removeEventListener('loadeddata', finish);
        video.removeEventListener('loadedmetadata', finish);
        resolve();
      };
      video.addEventListener('loadeddata', finish);
      video.addEventListener('loadedmetadata', finish);
      window.setTimeout(finish, 1500);
    });
  }

  if ((video.videoWidth || 0) < 16) {
    console.warn('[FACE] grabJpeg: aucune source décodée', {
      preview: Boolean(preview),
      readyState: video.readyState,
      tracks: stream.getVideoTracks().map((t) => `${t.label}:${t.readyState}`),
    });
    return null;
  }

  const b64 = canvasFromVideo(video, quality);
  if (b64) console.info(`[FACE] frame captured size=${b64.length} via=captureVideo`);
  return b64;
}

let grabVideo: HTMLVideoElement | null = null;
let grabCanvas: HTMLCanvasElement | null = null;

function findLivePreviewVideo(): HTMLVideoElement | null {
  if (typeof document === 'undefined') return null;
  const list = document.querySelectorAll('video');
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    // Ignorer la vidéo 1×1 de capture hors écran.
    if (v === grabVideo) continue;
    if (v.videoWidth >= 16 && v.videoHeight >= 16 && v.srcObject) return v;
  }
  return null;
}

function canvasFromVideo(video: HTMLVideoElement, quality: number): string | null {
  const w = video.videoWidth || 0;
  const h = video.videoHeight || 0;
  if (w < 16 || h < 16) return null;
  const canvas = grabCanvas || (grabCanvas = document.createElement('canvas'));
  const maxW = 960;
  const scale = Math.min(1, maxW / w);
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl.replace(/^data:image\/jpeg;base64,/, '');
}

function ensureCaptureVideo(stream: MediaStream): HTMLVideoElement {
  if (!grabVideo) {
    grabVideo = document.createElement('video');
    grabVideo.muted = true;
    grabVideo.autoplay = true;
    grabVideo.playsInline = true;
    grabVideo.setAttribute('playsinline', 'true');
    grabVideo.setAttribute('autoplay', 'true');
    // 1×1 visible dans le layout — certains navigateurs ne décodent pas
    // une vidéo strictement hors écran (left:-9999).
    grabVideo.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1';
    document.body.appendChild(grabVideo);
  }
  if (grabVideo.srcObject !== stream) {
    grabVideo.srcObject = stream;
  }
  return grabVideo;
}

async function sendFrame(payload: Record<string, unknown>): Promise<FaceLiveEvent> {
  const client = getCoreClient();
  const jpegLen = typeof payload.jpeg_b64 === 'string' ? payload.jpeg_b64.length : 0;
  console.info(`[FACE] sending face_frame mode=${payload.mode ?? '?'} size=${jpegLen}`);
  const data = await client.request(
    { type: 'holomat', action: 'face_frame', ...payload },
    isFaceEvent,
    6000,
  );
  if (data.type === 'holomat_error') {
    throw new Error(String(data.error || 'holomat_error'));
  }
  return data as unknown as FaceLiveEvent;
}

export interface FaceEnrollOpts {
  /** Obligatoire — clé buffer Core (contrat FACE_AUTH_CONTRACT). */
  userId: string;
  username: string;
  isAlive: () => boolean;
  patchFace: (u: Partial<FaceHologramState>) => void;
  patchHud?: (hudText: string, hudSubtext: string) => void;
  speak?: (t: string) => Promise<void>;
}

/**
 * Enrôlement facial — tient la caméra du début à la fin, et la rend ensuite.
 *
 * `withCamera` garantit la libération sur TOUTES les sorties : succès, échec
 * anticipé, exception. Avant, cette fonction appelait `ensureCamera()` et rien
 * ne l'éteignait jamais — la webcam du portable restait allumée en permanence
 * après le premier démarrage.
 */
export async function runFaceEnrollLive(opts: FaceEnrollOpts): Promise<boolean> {
  return withCamera('enrollment', (stream) => faceEnrollBody(opts, stream));
}

async function faceEnrollBody(
  opts: FaceEnrollOpts,
  camera: MediaStream | null,
): Promise<boolean> {
  const stream = camera || getCameraStream();
  if (!stream) {
    opts.patchFace({ phase: 'obstruction', obstruction: true });
    return false;
  }
  if (!opts.userId?.trim()) {
    console.warn('[holomat] enroll sans user_id');
    opts.patchHud?.('PROFIL MANQUANT', 'user_id requis avant capture');
    return false;
  }

  const client = getCoreClient();
  try {
    const begin = await client.request(
      {
        type: 'holomat',
        action: 'face_enroll_begin',
        user_id: opts.userId,
        username: opts.username,
      },
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
      ev = await sendFrame({
        mode: 'enroll',
        user_id: opts.userId,
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

export interface FaceVerifyOpts {
  username?: string;
  isAlive: () => boolean;
  patchFace: (u: Partial<FaceHologramState>) => void;
  patchHud?: (hudText: string, hudSubtext: string) => void;
  speak?: (t: string) => Promise<void>;
  /** frames successives au-dessus du seuil avant lock */
  stableNeeded?: number;
  /**
   * Pourquoi on filme. Change uniquement l'étiquette d'arbitrage : le
   * déverrouillage et l'identification de démarrage font la même chose, mais
   * ne se relâchent pas au même moment.
   */
  reason?: 'auth' | 'unlock';
}

export type FaceVerifyResult = {
  ok: boolean;
  user_id?: string;
  username?: string;
  confidence: number;
  reason?: string;
  hudText?: string;
  hudSubtext?: string;
};

/**
 * Résout un flux sans bloquer sur un 2e getUserMedia.
 * Priorité : module partagé → srcObject de la preview visible → ensureCamera court.
 */
async function resolveAuthStream(_reason: 'auth' | 'unlock' = 'auth'): Promise<MediaStream | null> {
  const existing = getCameraStream();
  if (existing?.getVideoTracks().some((t) => t.readyState === 'live')) return existing;

  const preview = await waitForPreviewVideo(2_000);
  if (preview?.srcObject instanceof MediaStream) {
    const fromPreview = preview.srcObject;
    if (fromPreview.getVideoTracks().some((t) => t.readyState === 'live')) {
      console.info('[CAMERA] stream from preview video element');
      return fromPreview;
    }
  }

  // Dernier recours — timeout court (ne jamais pendre 8+ s ici).
  try {
    return await withTimeout(ensureCamera(), 3_000);
  } catch {
    return getCameraStream();
  }
}

/** Vérification faciale — préfère le flux preview déjà live (pas de double getUserMedia). */
export async function runFaceVerifyLive(opts: FaceVerifyOpts): Promise<FaceVerifyResult> {
  const stream = await resolveAuthStream(opts.reason ?? 'auth');
  return faceVerifyBody(opts, stream);
}

async function faceVerifyBody(
  opts: FaceVerifyOpts,
  camera: MediaStream | null,
): Promise<FaceVerifyResult> {
  const stream = camera || getCameraStream();
  const previewReady = Boolean(findLivePreviewVideo());
  if (!stream && !previewReady) {
    console.warn('[HUD CAMERA] stream missing — no_camera');
    opts.patchFace({ phase: 'obstruction', obstruction: true });
    return { ok: false, confidence: 0, reason: 'no_camera' };
  }

  console.info(
    '[CAMERA] stream ready',
    stream
      ? stream.getVideoTracks().map((t) => `${t.label}:${t.readyState}`)
      : ['preview-dom-only'],
  );
  console.info('[FACE] scanner started');

  opts.patchFace({ phase: 'camera_on', progress: 1, confidence: 0 });
  opts.patchHud?.('FACE AUTH', 'Capture en cours…');

  const need = opts.stableNeeded ?? 2;
  let hits = 0;
  let nullGrabs = 0;
  let lastUser: { user_id?: string; username?: string; confidence: number } | null = null;
  const t0 = Date.now();
  const timeoutMs = 35000;

  while (opts.isAlive() && Date.now() - t0 < timeoutMs) {
    const jpeg = await grabJpegB64(stream);
    if (!jpeg) {
      nullGrabs += 1;
      if (nullGrabs === 5 || nullGrabs % 15 === 0) {
        opts.patchHud?.(
          'CAMÉRA ACTIVE',
          'Flux visible mais frames Holomat indisponibles — patientez',
        );
      }
      await new Promise(r => setTimeout(r, 200));
      continue;
    }
    nullGrabs = 0;
    let ev: FaceLiveEvent;
    try {
      ev = await sendFrame({
        mode: 'verify',
        username: opts.username,
        jpeg_b64: jpeg,
      });
    } catch (err) {
      console.warn('[face] face_frame timeout/erreur', err);
      opts.patchHud?.('CORE LENT', 'Nouvelle tentative…');
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
      return {
        ok: false,
        confidence: conf,
        reason: ev.reason,
        hudText: ev.hudText,
        hudSubtext: ev.hudSubtext,
      };
    } else {
      hits = 0;
    }
    await new Promise(r => setTimeout(r, 180));
  }

  opts.patchFace({ phase: 'deconstruct', progress: 0 });
  if (opts.speak) await opts.speak('Signature biométrique insuffisante.');
  return { ok: false, confidence: lastUser?.confidence ?? 0, reason: 'timeout' };
}

export async function commitFaceEnroll(username: string, userId: string): Promise<boolean> {
  const client = getCoreClient();
  try {
    const data = await client.request(
      { type: 'holomat', action: 'face_enroll_commit', username, user_id: userId },
      d => d.type === 'face_enroll_commit_result' || d.type === 'holomat_error',
      8000,
    );
    if (data.type === 'holomat_error') {
      console.warn('[holomat] face_enroll_commit', data.error);
      return false;
    }
    return Boolean(data.ok);
  } catch {
    return false;
  }
}
