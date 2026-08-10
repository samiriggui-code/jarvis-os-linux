/**
 * Score cinématique style Matrix — Web Audio procédural.
 *
 * Pas le générique copyrighté de Reloaded (Warner) : une nappe « digital rain »
 * + basse pulse + stingers d'acte. Pour coller un vrai morceau :
 *   hud/public/boot/score.mp3  → chargé automatiquement si présent.
 *
 * Chrome mute tant qu'il n'y a pas de geste : `armCinematicAudio()` AU clic.
 */

import type { VoyageAct } from './OrbVoyage';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bedGain: GainNode | null = null;
let unlocked = false;
let bedAlive = false;
let lastAct: VoyageAct | null = null;
let scoreEl: HTMLAudioElement | null = null;
let rainTimer = 0;
let pulseTimer = 0;
const bedNodes: AudioScheduledSourceNode[] = [];

const SCORE_URL = '/boot/score.mp3';

const getCtx = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    // Fort volontairement — c'est un trailer, pas un bip UI.
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    bedGain = ctx.createGain();
    bedGain.gain.value = 0;
    bedGain.connect(master);
  }
  return ctx;
};

const now = (): number => getCtx()?.currentTime ?? 0;

export const isBootAudioUnlocked = (): boolean => unlocked;

/**
 * Borne une promesse qui peut ne jamais se régler.
 *
 * Les API audio du navigateur en offrent deux : `AudioContext.resume()` et
 * `HTMLMediaElement.play()`. Les deux se tiennent au succès et se rompent au
 * refus — mais **sans périphérique de sortie, elles restent simplement en
 * attente**, sans erreur ni événement. Un `await` nu dessus est un blocage
 * définitif, pas une lenteur.
 */
const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise((resolve) => {
    let done = false;
    const timer = window.setTimeout(() => {
      if (!done) {
        done = true;
        resolve(fallback);
      }
    }, ms);
    promise
      .then((v) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        resolve(v);
      })
      .catch(() => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        resolve(fallback);
      });
  });

/** Reprendre le contexte est rapide quand ça marche ; au-delà, ça ne marchera pas. */
const RESUME_TIMEOUT_MS = 1500;

/** Débloque + démarre la piste. À appeler dans le handler du clic. */
export const armCinematicAudio = async (): Promise<boolean> => {
  const c = getCtx();
  if (!c || !master) return false;
  try {
    if (c.state === 'suspended') {
      await withTimeout(c.resume(), RESUME_TIMEOUT_MS, undefined);
    }
  } catch {
    return false;
  }
  unlocked = c.state === 'running';
  if (!unlocked) return false;

  const hasScore = await startScoreTrack();
  if (hasScore) {
    // Uniquement le MP3 — pas de nappe / ticks / drones (bruit d'enceinte).
    return true;
  }

  // Fallback sans score.mp3 : nappe procédurale.
  tone(880, now(), 0.06, 'square', 0.1);
  startMatrixBed(0.55);
  return true;
};

/** @deprecated alias */
export const unlockBootAudio = (): Promise<boolean> => armCinematicAudio();

const tone = (
  freq: number,
  t0: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  freqEnd?: number,
): void => {
  const c = getCtx();
  if (!c || !master || !unlocked) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, freq), t0);
  if (freqEnd != null) {
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
};

const noiseBurst = (
  t0: number,
  dur: number,
  gain: number,
  freq = 1600,
  q = 0.6,
): void => {
  const c = getCtx();
  if (!c || !master || !unlocked) return;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
};

/** Pluie digitale continue (ticks Matrix). */
const tickRain = (): void => {
  if (!unlocked || !bedAlive) return;
  const t = now();
  const f = 1800 + Math.random() * 4200;
  tone(f, t, 0.035 + Math.random() * 0.04, 'square', 0.04 + Math.random() * 0.05);
  if (Math.random() > 0.7) {
    tone(f * 0.5, t + 0.01, 0.03, 'square', 0.03);
  }
  rainTimer = window.setTimeout(tickRain, 45 + Math.random() * 90);
};

/** Pulse basse type trailer (double hit). */
const bassPulse = (): void => {
  if (!unlocked || !bedAlive) return;
  const t = now();
  tone(48, t, 0.35, 'sine', 0.55, 36);
  tone(55, t, 0.28, 'triangle', 0.22);
  noiseBurst(t, 0.12, 0.2, 120, 0.4);
  tone(48, t + 0.22, 0.28, 'sine', 0.35, 40);
  pulseTimer = window.setTimeout(bassPulse, 1400);
};

const startMatrixBed = (level = 0.55): void => {
  const c = getCtx();
  if (!c || !bedGain || !unlocked || bedAlive) return;
  bedAlive = true;

  // Drone grave continu
  const drone = c.createOscillator();
  const drone2 = c.createOscillator();
  const dg = c.createGain();
  drone.type = 'sawtooth';
  drone2.type = 'sine';
  drone.frequency.value = 36;
  drone2.frequency.value = 54;
  dg.gain.value = 0.18;
  drone.connect(dg);
  drone2.connect(dg);
  dg.connect(bedGain);
  drone.start();
  drone2.start();
  bedNodes.push(drone, drone2);

  // Pad montant filtré
  const pad = c.createOscillator();
  const padF = c.createBiquadFilter();
  const pg = c.createGain();
  pad.type = 'sawtooth';
  pad.frequency.value = 72;
  padF.type = 'lowpass';
  padF.frequency.value = 220;
  padF.Q.value = 4;
  pg.gain.value = 0.12;
  pad.connect(padF);
  padF.connect(pg);
  pg.connect(bedGain);
  pad.start();
  bedNodes.push(pad);
  padF.frequency.linearRampToValueAtTime(1800, c.currentTime + 50);

  bedGain.gain.cancelScheduledValues(c.currentTime);
  bedGain.gain.setValueAtTime(0.0001, c.currentTime);
  bedGain.gain.exponentialRampToValueAtTime(Math.max(0.001, level), c.currentTime + 0.4);

  // Pluie / pulse seulement si pas de score (sinon ça masque la musique).
  if (level >= 0.3) {
    tickRain();
    bassPulse();
  }
};

const stopMatrixBed = (): void => {
  bedAlive = false;
  window.clearTimeout(rainTimer);
  window.clearTimeout(pulseTimer);
  rainTimer = 0;
  pulseTimer = 0;
  while (bedNodes.length) {
    const n = bedNodes.pop();
    try {
      n?.stop();
    } catch {
      /* ignore */
    }
  }
  const c = getCtx();
  if (bedGain && c) {
    try {
      bedGain.gain.cancelScheduledValues(c.currentTime);
      bedGain.gain.setValueAtTime(0.0001, c.currentTime);
    } catch {
      /* ignore */
    }
  }
};

/** Piste optionnelle (générique perso) — false si 404. */
/**
 * Délai au-delà duquel on considère que la piste ne démarrera pas.
 *
 * ⚠ Ce garde-temps n'est pas une précaution de style : sans lui, le HUD peut
 * rester bloqué sur « ARMING… » **définitivement**.
 *
 * `HTMLMediaElement.play()` rend une promesse qui se tient quand la lecture
 * commence et se rompt sur refus d'autopilotage. Mais quand **aucune sortie
 * audio n'est disponible**, il n'y a ni l'un ni l'autre : le fichier se charge,
 * aucun `error` n'est émis — l'événement couvre le réseau et le décodage, pas
 * l'absence de périphérique — et la promesse reste en attente pour toujours.
 *
 * En face, `BootScene.armAndPlay` pose `arming = true` avant d'attendre, et sa
 * garde `if (arming || playing) return` rejette ensuite tous les clics. L'écran
 * devient définitivement mort, sans une ligne dans la console.
 *
 * Le cas n'est pas théorique : le kiosque s'arme tout seul au montage, sans
 * personne devant l'écran (cf. `BootScene`). Un NUC qui démarre avant que sa
 * sortie HDMI ou son serveur audio soit prêt fige JARVIS au lancement.
 *
 * Deux secondes et demie : au-delà, on rend `false` et l'appelant bascule sur
 * la nappe procédurale. Un démarrage à la nappe vaut mieux qu'un écran figé.
 */
const SCORE_START_TIMEOUT_MS = 2500;

const startScoreTrack = (): Promise<boolean> => {
  if (scoreEl) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;

    const settle = (ok: boolean, el?: HTMLAudioElement) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (ok && el) scoreEl = el;
      resolve(ok);
    };

    try {
      const a = new Audio(SCORE_URL);
      a.loop = false;
      a.volume = 0.9;
      a.preload = 'auto';

      timer = window.setTimeout(() => {
        // La piste peut démarrer APRÈS le délai, une fois la nappe lancée : on
        // aurait alors deux sources. On coupe donc l'élément abandonné.
        try {
          a.pause();
          a.src = '';
        } catch {
          /* rien à faire — on abandonne cet élément de toute façon */
        }
        settle(false);
      }, SCORE_START_TIMEOUT_MS);

      a.addEventListener('error', () => settle(false), { once: true });

      const p = a.play();
      if (p && typeof p.then === 'function') {
        p.then(() => settle(true, a)).catch(() => settle(false));
      } else {
        // Navigateur ancien : `play()` ne rend rien. On ne peut pas savoir, on
        // fait confiance — le garde-temps couvre déjà le cas où c'est faux.
        settle(true, a);
      }
    } catch {
      settle(false);
    }
  });
};

const stopScoreTrack = (): void => {
  if (!scoreEl) return;
  try {
    scoreEl.pause();
    scoreEl.src = '';
  } catch {
    /* ignore */
  }
  scoreEl = null;
};

/** Impact d'acte — style trailer Matrix, fort. */
const CUES: Record<VoyageAct, () => void> = {
  galaxies: () => {
    const t = now();
    noiseBurst(t, 0.8, 0.45, 400, 0.5);
    tone(40, t, 1.6, 'sine', 0.7, 28);
    tone(80, t + 0.05, 1.2, 'sawtooth', 0.25, 55);
    tone(220, t + 0.3, 0.6, 'square', 0.12);
  },
  voyage: () => {
    const t = now();
    noiseBurst(t, 1.0, 0.55, 2200, 0.3);
    tone(90, t, 0.9, 'sawtooth', 0.35, 40);
    tone(180, t, 0.7, 'sawtooth', 0.2, 60);
    for (let i = 0; i < 8; i++) {
      tone(900 + i * 180, t + i * 0.04, 0.08, 'square', 0.1);
    }
  },
  solaire: () => {
    const t = now();
    tone(55, t, 0.5, 'sine', 0.5);
    tone(110, t + 0.05, 0.6, 'triangle', 0.3);
    tone(440, t + 0.1, 0.8, 'sine', 0.28);
    tone(660, t + 0.2, 0.7, 'sine', 0.2);
    tone(880, t + 0.35, 0.9, 'triangle', 0.15);
    noiseBurst(t + 0.1, 0.4, 0.25, 800);
  },
  terre: () => {
    const t = now();
    tone(36, t, 1.4, 'sine', 0.65);
    tone(72, t + 0.1, 1.0, 'triangle', 0.3);
    noiseBurst(t, 0.5, 0.3, 200, 0.8);
  },
  vague: () => {
    const t = now();
    noiseBurst(t, 1.2, 0.4, 500, 0.4);
    tone(90, t, 1.0, 'sine', 0.35, 60);
    tone(180, t + 0.2, 0.8, 'sine', 0.2, 100);
  },
  adn: () => {
    const t = now();
    [130, 165, 196, 247, 294].forEach((f, i) => {
      tone(f, t + i * 0.09, 0.35, 'square', 0.16);
      tone(f * 2, t + i * 0.09 + 0.04, 0.2, 'sine', 0.08);
    });
    noiseBurst(t, 0.3, 0.2, 3000);
  },
  cerveau: () => {
    const t = now();
    tone(60, t, 0.8, 'sawtooth', 0.3, 45);
    for (let i = 0; i < 12; i++) {
      tone(400 + Math.random() * 2000, t + i * 0.05, 0.06, 'square', 0.08);
    }
    noiseBurst(t + 0.1, 0.4, 0.25, 1500);
  },
  neurones: () => {
    const t = now();
    [523, 659, 784, 988, 1175, 1319].forEach((f, i) => {
      tone(f, t + i * 0.055, 0.28, 'square', 0.14);
    });
    tone(65, t, 0.9, 'sine', 0.4);
    noiseBurst(t, 0.35, 0.22, 2500);
  },
  // Le réseau se stabilise : arpège plus lent, timbre plus rond (triangle,
  // pas square) — l'électricité de `neurones` se réchauffe déjà vers
  // le swell harmonique de `orbe`.
  reseau: () => {
    const t = now();
    [392, 523, 659, 784].forEach((f, i) => {
      tone(f, t + i * 0.09, 0.5, 'triangle', 0.16);
    });
    tone(55, t, 1.4, 'sine', 0.45, 40);
    noiseBurst(t, 0.4, 0.28, 1400, 0.25);
  },
  orbe: () => {
    const t = now();
    noiseBurst(t, 0.6, 0.5, 900);
    tone(45, t, 2.0, 'sine', 0.75, 55);
    tone(90, t + 0.1, 1.6, 'triangle', 0.35);
    tone(180, t + 0.25, 1.4, 'sine', 0.3);
    tone(360, t + 0.45, 1.2, 'sine', 0.25);
    tone(720, t + 0.7, 1.0, 'triangle', 0.18);
    tone(1440, t + 1.0, 0.8, 'sine', 0.1);
  },
};

export const playActSfx = (act: VoyageAct, force = false): void => {
  if (!unlocked) return;
  // La piste ElevenLabs porte déjà l'arc narratif — pas de stingers par-dessus.
  if (scoreEl) return;
  if (!force && act === lastAct) return;
  lastAct = act;
  CUES[act]?.();
};

export const playTitleRevealSfx = (): void => {
  if (!unlocked || scoreEl) return;
  const t = now();
  noiseBurst(t, 0.5, 0.45, 700);
  tone(55, t, 2.2, 'sine', 0.7);
  tone(110, t + 0.15, 1.8, 'triangle', 0.4);
  tone(220, t + 0.35, 1.5, 'sine', 0.35);
  tone(440, t + 0.55, 1.3, 'sine', 0.28);
  tone(880, t + 0.8, 1.0, 'triangle', 0.18);
  // Accord final
  [261, 329, 392, 523].forEach((f, i) => {
    tone(f, t + 1.0 + i * 0.04, 1.4, 'sine', 0.2);
  });
};

export const playRecedeSfx = (): void => {
  if (!unlocked) return;
  stopMatrixBed();
  if (scoreEl) {
    // Fade propre de la musique — pas de whoosh synthé par-dessus.
    const fade = window.setInterval(() => {
      if (!scoreEl) {
        window.clearInterval(fade);
        return;
      }
      scoreEl.volume = Math.max(0, scoreEl.volume - 0.05);
      if (scoreEl.volume <= 0.05) {
        stopScoreTrack();
        window.clearInterval(fade);
      }
    }, 80);
    return;
  }
  const t = now();
  noiseBurst(t, 1.4, 0.5, 1800, 0.25);
  tone(200, t, 1.5, 'sawtooth', 0.35, 40);
  tone(100, t + 0.1, 1.6, 'sine', 0.45, 28);
};

export const resetBootSfx = (): void => {
  lastAct = null;
  stopMatrixBed();
  stopScoreTrack();
  bedAlive = false;
};

export const disposeBootSfx = (): void => {
  resetBootSfx();
  try {
    void ctx?.close();
  } catch {
    /* ignore */
  }
  ctx = null;
  master = null;
  bedGain = null;
  unlocked = false;
};
