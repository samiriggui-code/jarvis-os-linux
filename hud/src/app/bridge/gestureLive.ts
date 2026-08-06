/**
 * Pilotage gestuel — MediaPipe (HUD) → bus (Core).
 *
 * Le HUD est un **capteur** : il mesure des confidences par frame et les
 * envoie brutes. Il ne décide pas qu'un geste a eu lieu. Toute la
 * discrétisation — front montant, hystérésis, cooldown, seuils issus du
 * profil utilisateur — vit dans `core/jarvis_core/bus.py`, et la résolution
 * geste → action dans `core/jarvis_core/gestures.py`.
 *
 * Pourquoi MediaPipe ici et pas dans le Core : le Core tourne en Python
 * 3.14, où la roue `mediapipe` n'existe pas (plafond 3.13). Accessoirement
 * la caméra est déjà ouverte par Chromium pour l'auth faciale — la rouvrir
 * depuis un process Python donnerait `EBUSY`.
 *
 * Assets locaux, jamais le CDN : cf. `scripts/fetch-mediapipe.mjs`.
 */
import { getCoreClient } from './coreClient';
import { acquireCamera, releaseCamera, getCameraStream } from './mediaDevices';

const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/hand_landmarker.task';

/** Au-delà, on n'apprend plus rien : le bus coalesce et discrétise. */
const MAX_FPS = 24;
const MIN_INTERVAL_MS = 1000 / MAX_FPS;

// -- indices des 21 points MediaPipe ----------------------------------------
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_TIP = 20;
const FINGER_PIPS = [6, 10, 14, 18];
const FINGER_TIPS = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];

type Point = { x: number; y: number; z?: number };

export type GestureBridgeState = {
  status: 'idle' | 'loading' | 'running' | 'unavailable';
  error?: string;
  hands: number;
  fps: number;
};

let state: GestureBridgeState = { status: 'idle', hands: 0, fps: 0 };
const listeners = new Set<(s: GestureBridgeState) => void>();

export function getGestureState(): GestureBridgeState {
  return state;
}

export function subscribeGesture(fn: (s: GestureBridgeState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

function patch(next: Partial<GestureBridgeState>) {
  state = { ...state, ...next };
  listeners.forEach(fn => {
    try {
      fn(state);
    } catch {
      /* un écouteur cassé ne coupe pas le flux */
    }
  });
}

// -- géométrie ---------------------------------------------------------------

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Rampe linéaire : confiance 1 quand `value` atteint `full`, 0 à `none`.
 * Marche dans les deux sens (`full` peut être au-dessus ou en dessous).
 *
 * Convertir une distance en confiance *progressive* et non binaire : le bus
 * applique son hystérésis sur cette valeur, et un 0/1 sec la rendrait inerte.
 */
function ramp(value: number, full: number, none: number): number {
  if (none === full) return value === full ? 1 : 0;
  return clamp01((none - value) / (none - full));
}

/**
 * Échelle de la main : poignet → base du majeur.
 *
 * Tout est normalisé par cette longueur, sinon la même pince mesurée à 30 cm
 * puis à 1 m donnerait deux confidences très différentes et l'utilisateur
 * devrait « viser » une distance à la caméra pour être compris.
 */
function palmSize(lm: Point[]): number {
  return Math.max(dist(lm[WRIST], lm[MIDDLE_MCP]), 1e-4);
}

/** Doigt tendu : le bout est plus loin du poignet que la phalange moyenne. */
function extension(lm: Point[], tip: number, pip: number, scale: number): number {
  const reach = (dist(lm[WRIST], lm[tip]) - dist(lm[WRIST], lm[pip])) / scale;
  // Replié, le bout revient vers le poignet (`reach` négatif) ; tendu, il
  // gagne ~0.4 paume sur la phalange.
  return clamp01((reach + 0.35) / 0.4);
}

function pinchConfidence(lm: Point[], scale: number): number {
  // Pouce-index rapportés à la paume : ~0.30 pincé, ~1.10 ouvert.
  return ramp(dist(lm[THUMB_TIP], lm[INDEX_TIP]) / scale, 0.35, 0.9);
}

function fingerStates(lm: Point[], scale: number): number[] {
  return FINGER_TIPS.map((tip, i) => extension(lm, tip, FINGER_PIPS[i], scale));
}

/** Position du curseur : milieu pouce-index, comme `handtracking_mouse.py`. */
function cursorPoint(lm: Point[]): { x: number; y: number } {
  return {
    // Miroir en x : la prévisualisation est en selfie, sans quoi déplacer la
    // main vers la droite ferait partir le curseur vers la gauche.
    x: clamp01(1 - (lm[THUMB_TIP].x + lm[INDEX_TIP].x) / 2),
    y: clamp01((lm[THUMB_TIP].y + lm[INDEX_TIP].y) / 2),
  };
}

// -- balayage ----------------------------------------------------------------

const SWIPE_WINDOW_MS = 200;
/** Vitesse (largeur d'image par seconde) au-delà de laquelle c'est un geste. */
const SWIPE_MIN_SPEED = 1.1;
const SWIPE_FULL_SPEED = 2.6;

type Trace = { x: number; y: number; t: number };
const traces = new Map<string, Trace[]>();

function swipeOf(hand: string, palm: Point, now: number): { direction: string; confidence: number } | null {
  const trace = traces.get(hand) ?? [];
  trace.push({ x: palm.x, y: palm.y, t: now });
  while (trace.length > 1 && now - trace[0].t > SWIPE_WINDOW_MS) trace.shift();
  traces.set(hand, trace);

  if (trace.length < 3) return null;
  const first = trace[0];
  const dt = (now - first.t) / 1000;
  if (dt < 0.05) return null;

  // Miroir en x, cohérent avec le curseur.
  const vx = -(palm.x - first.x) / dt;
  const vy = (palm.y - first.y) / dt;
  const horizontal = Math.abs(vx) >= Math.abs(vy);
  const speed = horizontal ? Math.abs(vx) : Math.abs(vy);
  if (speed < SWIPE_MIN_SPEED) return null;

  const direction = horizontal ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
  const confidence = clamp01((speed - SWIPE_MIN_SPEED) / (SWIPE_FULL_SPEED - SWIPE_MIN_SPEED));
  return { direction, confidence };
}

// -- boucle ------------------------------------------------------------------

let landmarker: unknown = null;
let running = false;
let stopFn: (() => void) | null = null;
/** Ce pont détient-il la caméra ? Garde-fou contre un double relâchement. */
let holdsCamera = false;
let lastSent = 0;
let frames = 0;
let fpsMark = 0;

type Landmarker = {
  detectForVideo(video: HTMLVideoElement, ts: number): {
    landmarks?: Point[][];
    handedness?: { categoryName?: string }[][];
  };
  close?(): void;
};

async function loadLandmarker(): Promise<Landmarker> {
  const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  return (await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    // Seuils bas comme chez Holomat : une main vue de biais score mal, et
    // c'est le bus qui arbitre ensuite — pas la peine d'être sévère ici.
    minHandDetectionConfidence: 0.4,
    minHandPresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  })) as unknown as Landmarker;
}

function ensureVideo(stream: MediaStream): HTMLVideoElement {
  let video = document.getElementById('jarvis-gesture-video') as HTMLVideoElement | null;
  if (!video) {
    video = document.createElement('video');
    video.id = 'jarvis-gesture-video';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.style.cssText =
      'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(video);
  }
  if (video.srcObject !== stream) video.srcObject = stream;
  return video;
}

function frameToCore(lm: Point[], hand: string, now: number): void {
  const scale = palmSize(lm);
  const fingers = fingerStates(lm, scale);
  const thumbOut = ramp(dist(lm[THUMB_TIP], lm[PINKY_MCP]) / scale, 1.3, 0.7);
  const extended = fingers.reduce((a, b) => a + b, 0) / fingers.length;

  const payload: Record<string, unknown> = {
    type: 'gesture',
    hand,
    pinch: pinchConfidence(lm, scale),
    // Paume ouverte : les quatre doigts tendus ET le pouce écarté, sinon un
    // « stop » de la main et un « quatre doigts collés » sont confondus.
    open: Math.min(extended, thumbOut),
    fist: 1 - Math.max(extended, thumbOut),
    point: cursorPoint(lm),
  };

  const swipe = swipeOf(hand, lm[MIDDLE_MCP], now);
  if (swipe) payload.swipe = swipe;

  // `send()` sait déjà se taire hors ligne, mais il journalise en `debug` —
  // à 24 fps ça remplirait la console pendant toute une coupure du Core.
  const client = getCoreClient();
  if (client.connected) client.send(payload);
}

function handLabel(raw: string | undefined, index: number): 'left' | 'right' {
  const name = (raw || '').toLowerCase();
  if (name === 'left' || name === 'right') return name;
  return index === 0 ? 'right' : 'left';
}

/**
 * Démarre le pont gestuel. Ne lève jamais : gestuel indisponible ≠ HUD cassé.
 * Renvoie `true` si la boucle tourne.
 */
export async function startGestureBridge(): Promise<boolean> {
  if (running) return true;

  // Le pilotage gestuel DÉTIENT la caméra tant qu'il tourne — c'est un usage
  // continu, contrairement à un scan d'authentification. `stopGestureBridge`
  // la rend ; sans ça elle resterait allumée pour toujours.
  const stream = (await acquireCamera('gesture')) || getCameraStream();
  if (!stream) {
    patch({ status: 'unavailable', error: 'camera_refusee', hands: 0 });
    return false;
  }
  holdsCamera = true;

  patch({ status: 'loading', error: undefined });
  try {
    landmarker = landmarker ?? (await loadLandmarker());
  } catch (e) {
    // Assets absents = `npm run mediapipe` jamais lancé. C'est le cas le plus
    // probable, et il doit se lire dans la console sans avoir à deviner.
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[gesture] MediaPipe indisponible —', msg);
    console.warn('[gesture] assets manquants ? → cd hud && npm run mediapipe');
    patch({ status: 'unavailable', error: msg, hands: 0 });
    return false;
  }

  const video = ensureVideo(stream);
  try {
    if (video.paused) await video.play();
  } catch {
    patch({ status: 'unavailable', error: 'video_play_refuse' });
    return false;
  }

  running = true;
  patch({ status: 'running', error: undefined });
  let handle = 0;
  let cancelled = false;
  const model = landmarker as Landmarker;

  const tick = () => {
    if (cancelled) return;
    const now = performance.now();

    if (video.readyState >= 2 && now - lastSent >= MIN_INTERVAL_MS) {
      lastSent = now;
      try {
        const res = model.detectForVideo(video, now);
        const hands = res.landmarks ?? [];
        patch({ hands: hands.length });

        hands.forEach((lm, i) => {
          if (!lm || lm.length < 21) return;
          frameToCore(lm, handLabel(res.handedness?.[i]?.[0]?.categoryName, i), now);
        });

        if (hands.length === 0) traces.clear();

        frames += 1;
        if (now - fpsMark >= 1000) {
          patch({ fps: Math.round((frames * 1000) / (now - fpsMark)) });
          frames = 0;
          fpsMark = now;
        }
      } catch (e) {
        // Une frame ratée n'arrête pas la boucle : la caméra peut hoqueter
        // à la reprise de veille, ce n'est pas une raison de perdre la main.
        console.debug('[gesture] frame ignorée', e);
      }
    }
    handle = requestAnimationFrame(tick);
  };

  handle = requestAnimationFrame(tick);
  stopFn = () => {
    cancelled = true;
    cancelAnimationFrame(handle);
  };
  return true;
}

export function stopGestureBridge(): void {
  stopFn?.();
  stopFn = null;
  running = false;
  traces.clear();
  // Rendre la caméra, une seule fois : deux `stop` consécutifs décrémenteraient
  // deux fois un compteur incrémenté une seule, et éteindraient la caméra sous
  // le nez d'un autre consommateur légitime.
  if (holdsCamera) {
    holdsCamera = false;
    releaseCamera('gesture');
  }
  patch({ status: 'idle', hands: 0, fps: 0 });
}

/** Libère le modèle (~7,8 Mo). À n'appeler qu'en démontage complet du HUD. */
export function disposeGestureBridge(): void {
  stopGestureBridge();
  try {
    (landmarker as Landmarker | null)?.close?.();
  } catch {
    /* ignoré */
  }
  landmarker = null;
}
