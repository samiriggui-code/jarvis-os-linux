/**
 * Capture micro → `voice/transcribe` du Core.
 *
 * Ce module comble un trou : le HUD ouvrait bien le micro (voyant VOIX vert)
 * mais **rien n'enregistrait ni n'envoyait quoi que ce soit**. Le contrat
 * `voice/transcribe` était déclaré dans `hudContracts.ts` sans un seul appel,
 * et il n'existait aucun `MediaRecorder` dans tout le HUD. Conséquence en
 * chaîne : le Core n'émettait jamais `enroll.voice`, donc l'empreinte vocale
 * ne se faisait pas, donc le déverrouillage à la voix ne pouvait pas exister.
 *
 * ⚠ À ne pas confondre avec `bridge/stt.ts`, qui utilise la reconnaissance
 * vocale du NAVIGATEUR pour le chat courant. Elle est pratique mais elle ne
 * rend que du texte : aucun audio n'en sort. Or l'empreinte vocale se calcule
 * sur le SON. Les deux chemins coexistent donc, et ce n'est pas un doublon :
 *
 *   · `stt.ts`        — commandes courantes, texte seul, zéro octet au Core ;
 *   · `micRecorder`   — enrôlement et déverrouillage, l'audio part au Core.
 *
 * Format : `audio/webm;codecs=opus`, envoyé sous le nom `capture.webm`.
 * L'extension n'est pas décorative — côté voicebox, librosa choisit son
 * décodeur dessus. Un webm annoncé en `.wav` est refusé.
 */

import { getCoreClient } from './coreClient';
import { ensureMic } from './mediaDevices';
import { stopTtsPlayback } from './ttsCore';
import { stopDev } from './ttsDev';

/** Un enregistrement plus long que ça n'est plus une phrase. */
const MAX_MS = 12_000;
/** En deçà, il ne s'est rien passé : micro coupé, ou personne n'a parlé. */
const MIN_BYTES = 2_000;
/** Le Core transcrit puis répond ; voicebox distant peut prendre son temps. */
const REPLY_TIMEOUT_MS = 45_000;

/** Coupe Jarvis avant d'écouter — sinon le micro capte le TTS. */
async function quietBeforeCapture(): Promise<void> {
  try {
    stopDev();
    stopTtsPlayback();
    const c = getCoreClient();
    c.send({ type: 'auth', action: 'sequence_stop' });
    c.send({ type: 'voice', action: 'cancel' });
  } catch { /* */ }
  await new Promise((r) => window.setTimeout(r, 700));
}

function looksLikeAuthChallenge(text: string): boolean {
  const h = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!h || h.length < 4) return false;
  const collapsed = h.replace(/\s/g, '');
  const hasJarvis =
    /j\s*ar?vise|j\s*arvis|jarvis|jarlis|charvis|jarvi[sz]?\b/.test(h) ||
    ['jarvis', 'arvise', 'jarvi', 'jarlis', 'charvis', 'jarvise'].some((x) =>
      collapsed.includes(x),
    );
  const hasActive = /activ|actif/.test(h);
  const hasToi = /\btoi\b/.test(h) || h.endsWith(' toi');
  if (hasJarvis && (hasActive || hasToi)) return true;
  if (h.split(' ').includes('hey') && (collapsed.includes('jarvis') || collapsed.includes('jarlis'))) {
    return true;
  }
  return false;
}

export interface CaptureResult {
  ok: boolean;
  /** Texte transcrit — vide si personne n'a parlé. */
  text: string;
  /** Durée du son telle que mesurée par voicebox. */
  duration?: number;
  error?: string;
}

/** Le format retenu par le navigateur, ou `null` s'il n'en sait faire aucun. */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/** `capture.webm` / `capture.ogg` selon ce que le navigateur a produit. */
function filenameFor(mime: string): string {
  return mime.includes('ogg') ? 'capture.ogg' : 'capture.webm';
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  // Par tranches : `String.fromCharCode(...buf)` dépasse la taille maximale
  // de la pile d'appels dès quelques centaines de kilo-octets, et un
  // enregistrement de dix secondes y arrive sans peine.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Enregistre `durationMs` de micro et rend le blob brut. */
export async function recordSegment(durationMs: number): Promise<Blob | null> {
  const stream = await ensureMic();
  if (!stream) return null;

  const mime = pickMimeType();
  if (!mime) {
    console.warn('[mic] MediaRecorder indisponible dans ce navigateur');
    return null;
  }

  return new Promise<Blob | null>((resolve) => {
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime });
    } catch (e) {
      console.warn('[mic] MediaRecorder refusé', e);
      resolve(null);
      return;
    }

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = () => resolve(null);

    recorder.start();
    window.setTimeout(() => {
      // `stop()` sur un enregistreur déjà arrêté lève : on garde la garde.
      if (recorder.state !== 'inactive') recorder.stop();
    }, Math.min(durationMs, MAX_MS));
  });
}

/**
 * Enregistre, envoie au Core, attend la transcription.
 *
 * Ne rejette jamais : un enrôlement doit pouvoir annoncer « je n'ai rien
 * entendu » plutôt que de casser la séquence qui l'appelle.
 */
export async function captureUtterance(
  durationMs = 4_000,
  language: string | null = 'fr',
): Promise<CaptureResult> {
  const blob = await recordSegment(durationMs);
  if (!blob) return { ok: false, text: '', error: 'micro indisponible' };
  if (blob.size < MIN_BYTES) {
    return { ok: false, text: '', error: 'aucun son capté' };
  }

  const audio_b64 = await blobToBase64(blob);
  const client = getCoreClient();

  return new Promise<CaptureResult>((resolve) => {
    let settled = false;
    const finish = (r: CaptureResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      off();
      resolve(r);
    };

    // On s'abonne AVANT d'envoyer : la réponse d'un Core local peut revenir
    // avant que la ligne suivante ne s'exécute.
    const off = client.subscribe((data) => {
      if (data.type !== 'voice_transcript') return;
      finish({
        ok: Boolean(data.ok),
        text: String(data.text ?? ''),
        duration: typeof data.duration === 'number' ? data.duration : undefined,
        error: data.error ? String(data.error) : undefined,
      });
    });

    const timer = window.setTimeout(
      () => finish({ ok: false, text: '', error: 'pas de réponse du Core' }),
      REPLY_TIMEOUT_MS,
    );

    try {
      client.send({
        type: 'voice',
        action: 'transcribe',
        audio_b64,
        filename: filenameFor(blob.type || 'audio/webm'),
        ...(language ? { language } : {}),
      });
    } catch (e) {
      finish({ ok: false, text: '', error: `envoi impossible : ${String(e)}` });
    }
  });
}

/**
 * Enrôlement vocal : la même phrase, plusieurs fois.
 *
 * Plusieurs passes parce qu'une empreinte tirée d'un seul échantillon épouse
 * les accidents de cet échantillon — une toux, une porte, un mot avalé. La
 * séquence parlée annonce chaque passe ; ici on ne fait qu'enregistrer.
 *
 * On rend TOUTES les tentatives, y compris les muettes : c'est à l'appelant
 * de décider si deux prises sur trois suffisent.
 */
export async function captureEnrollmentPhrase(
  repetitions = 3,
  durationMs = 5_000,
  onProgress?: (index: number, total: number, result: CaptureResult) => void,
): Promise<CaptureResult[]> {
  const good: CaptureResult[] = [];
  let attempts = 0;
  const maxAttempts = repetitions * 3;
  while (good.length < repetitions && attempts < maxAttempts) {
    attempts += 1;
    await quietBeforeCapture();
    const r = await captureUtterance(durationMs);
    if (r.ok && looksLikeAuthChallenge(r.text)) {
      good.push(r);
      onProgress?.(good.length, repetitions, r);
    } else {
      onProgress?.(good.length + 1, repetitions, {
        ...r,
        ok: false,
        error: r.error || (r.text ? `hors phrase (« ${r.text} »)` : 'rien entendu'),
      });
    }
    await new Promise((r2) => window.setTimeout(r2, 700));
  }
  return good;
}
