/**
 * Simulateur face auth — events alignés Core futur (FACE_PROGRESS, FACE_FAILED…)
 * Le HUD met à jour jauge + voix sur chaque palier.
 */
import type { FaceHologramState } from './faceHologramTypes';
import { FACE_MILESTONES } from './faceHologramTypes';

export type FaceAuthEvent =
  | { type: 'FACE_PROGRESS'; progress: number; hudText: string; hudSubtext: string }
  | { type: 'FACE_SUCCESS' }
  | { type: 'FACE_FAILED'; reason: 'low_confidence' | 'obstruction' | 'motion' }
  | { type: 'FACE_OBSTRUCTION' }
  | { type: 'RECOVERY_TICK'; secondsLeft: number }
  | { type: 'RETRY_AUTH' }
  | { type: 'AUTH_LOCK' };

export interface RunFaceAuthOptions {
  ttsEnabled: boolean;
  speak: (text: string) => Promise<void>;
  patchHud: (hudText: string, hudSubtext: string, orbState?: 'processing' | 'listening' | 'responding') => void;
  patchFace: (update: Partial<FaceHologramState>) => void;
  /** Première tentative échoue (demo ?faceFail=1) */
  simulateFailOnce?: boolean;
  maxRetries?: number;
  recoverySeconds?: number;
  isAlive: () => boolean;
}

function delay(ms: number, isAlive: () => boolean) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      if (!isAlive()) reject(new Error('aborted'));
      else resolve();
    }, ms);
  });
}

async function animateProgress(
  from: number,
  to: number,
  ms: number,
  opts: RunFaceAuthOptions,
  onProgress: (p: number) => void,
) {
  const start = Date.now();
  let lastMilestone = -1;
  while (true) {
    if (!opts.isAlive()) return;
    const t = Math.min(1, (Date.now() - start) / ms);
    const p = from + (to - from) * t;
    onProgress(p);
    const milestone = FACE_MILESTONES.filter(m => p >= m.at).pop();
    if (milestone && milestone.at > lastMilestone) {
      lastMilestone = milestone.at;
      opts.patchHud('BIOMETRIC SYNTHESIS', `FACIAL MATRIX ${Math.round(p)}% — ${milestone.label}`);
      if (milestone.voice) await opts.speak(milestone.voice);
    }
    if (t >= 1) break;
    await delay(40, opts.isAlive);
  }
}

async function deconstruct(opts: RunFaceAuthOptions, from: number) {
  opts.patchFace({ phase: 'deconstruct', obstruction: false });
  opts.patchHud('AUTH FAILED', 'RETRY AVAILABLE');
  await opts.speak('Signature biométrique insuffisante.');
  if (!opts.isAlive()) return;
  await opts.speak('Veuillez rester immobile et repositionner votre visage.');
  const steps = [80, 50, 20, 0];
  let current = from;
  for (const target of steps) {
    if (!opts.isAlive()) return;
    const start = Date.now();
    const ms = 350;
    while (true) {
      const t = Math.min(1, (Date.now() - start) / ms);
      const p = current + (target - current) * t;
      opts.patchFace({ progress: p, confidence: p / 100, phase: 'deconstruct' });
      if (t >= 1) break;
      await delay(30, opts.isAlive);
    }
    current = target;
  }
  opts.patchFace({ phase: 'waiting', progress: 0, confidence: 0 });
}

async function runAttempt(opts: RunFaceAuthOptions, failAtEnd: boolean): Promise<boolean> {
  opts.patchFace({
    phase: 'camera_on',
    progress: 0,
    confidence: 0,
    obstruction: false,
  });
  opts.patchHud('OPTICAL SENSOR ONLINE', 'Activation capteurs');
  // Ouvre la webcam Windows (permission navigateur) — Holomat stub
  try {
    const { ensureCameraAndMic } = await import('../bridge/mediaDevices');
    await ensureCameraAndMic();
  } catch { /* permissions gérées côté UI */ }
  await opts.speak('Activation du module de perception visuelle.');
  if (!opts.isAlive()) return false;

  await delay(500, opts.isAlive);
  opts.patchFace({ phase: 'reconstruction' });
  opts.patchHud('BIOMETRIC SYNTHESIS', 'FACIAL MATRIX 0%');

  if (opts.simulateFailOnce && failAtEnd) {
    await animateProgress(0, 72, 2800, opts, p => {
      opts.patchFace({ progress: p, confidence: p / 100, phase: 'reconstruction' });
    });
    opts.patchFace({ phase: 'obstruction', obstruction: true, obstructionZone: 'eyes', progress: 55 });
    opts.patchHud('OBSTRUCTION DETECTED', 'Zone yeux');
    await opts.speak("Un élément empêche l'analyse faciale.");
    await opts.speak('Veuillez retirer l\'objet qui bloque votre authentification.');
    await deconstruct(opts, 55);
    return false;
  }

  await animateProgress(0, 100, 3200, opts, p => {
    opts.patchFace({ progress: p, confidence: p / 100, phase: 'reconstruction' });
  });

  if (failAtEnd && opts.simulateFailOnce) {
    await deconstruct(opts, 100);
    return false;
  }

  opts.patchFace({ phase: 'success', progress: 100, confidence: 1 });
  opts.patchHud('IDENTITY MATCH FOUND', 'AUTH COMPLETE');
  await opts.speak('Signature biométrique validée.');
  return true;
}

export async function runFaceAuthFlow(opts: RunFaceAuthOptions): Promise<boolean> {
  const maxRetries = opts.maxRetries ?? 3;
  const recoverySeconds = opts.recoverySeconds ?? 30;
  let attempt = 0;
  let failOnceUsed = false;

  while (attempt < maxRetries) {
    if (!opts.isAlive()) return false;
    // `simulateFailOnce` est optionnel : sans le `=== true`, `shouldFail` vaut
    // `boolean | undefined` et ne satisfait pas `runAttempt(…, failAtEnd: boolean)`.
    const shouldFail = opts.simulateFailOnce === true && !failOnceUsed;
    if (shouldFail) failOnceUsed = true;

    if (attempt > 0) {
      opts.patchHud('NEW IDENTIFICATION ATTEMPT', `Tentative ${attempt + 1}`);
      await opts.speak('Nouvelle tentative d\'identification.');
    }

    const ok = await runAttempt(opts, shouldFail);
    if (ok) return true;

    attempt++;
    if (attempt >= maxRetries) break;

    opts.patchFace({ phase: 'recovery', progress: 0, confidence: 0 });
    opts.patchHud('RETRY AVAILABLE', 'Correction en cours');
    for (let s = recoverySeconds; s >= 0; s--) {
      if (!opts.isAlive()) return false;
      opts.patchFace({ recoverySecondsLeft: s });
      opts.patchHud('NEW IDENTIFICATION ATTEMPT', `${s}s`);
      await delay(1000, opts.isAlive);
    }
    opts.patchFace({ recoverySecondsLeft: undefined });
  }

  opts.patchFace({ phase: 'locked', progress: 0, confidence: 0 });
  opts.patchHud('AUTH LOCK TEMPORARY', 'Réessayez plus tard');
  await opts.speak('Authentification non validée.');
  await opts.speak('Nouvelle tentative disponible ultérieurement.');
  return false;
}
