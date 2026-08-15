/**
 * Confirmation vocale kiosk — oui / non via micro → Core Whisper.
 * Pas de clavier / souris sur le NUC salon.
 */
import { captureUtterance } from './micRecorder';
import { getCoreClient } from './coreClient';

const OUI = /\b(oui|ouais|ok|okay|d['']accord|valide|confirme|correct|exact|parfait|yes)\b/i;
const NON = /\b(non|nan|nega|faux|incorrect|recommence|répète|repete|no)\b/i;

export async function jarvisSay(text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  const { subscribeTtsSpeaking, isTtsSpeaking } = await import('./ttsCore');
  try {
    getCoreClient().send({ type: 'voice', action: 'speak', text: t });
  } catch { /* */ }
  // Attendre la vraie fin TTS si le Core joue un WAV ; sinon estimation.
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallback);
      off();
      resolve();
    };
    let sawStart = isTtsSpeaking();
    const off = subscribeTtsSpeaking((speaking) => {
      if (speaking) sawStart = true;
      else if (sawStart) done();
    });
    const ms = Math.min(14_000, Math.max(1_400, Math.round((t.length / 14) * 1000) + 600));
    const fallback = window.setTimeout(done, ms);
  });
}

/** Écoute une phrase courte (nom, réponse). */
export async function listenUtterance(durationMs = 4_500): Promise<string> {
  const r = await captureUtterance(durationMs, 'fr');
  return (r.ok ? r.text : '').trim();
}

export type YesNo = 'yes' | 'no' | 'unknown';

export function parseYesNo(text: string): YesNo {
  const t = text.trim();
  if (!t) return 'unknown';
  if (OUI.test(t) && !NON.test(t)) return 'yes';
  if (NON.test(t) && !OUI.test(t)) return 'no';
  if (OUI.test(t)) return 'yes';
  if (NON.test(t)) return 'no';
  return 'unknown';
}

/** Demande confirmation : réécoute jusqu'à oui/non (max attempts). */
export async function askYesNo(
  prompt: string,
  opts?: { maxAttempts?: number; listenMs?: number },
): Promise<boolean> {
  const max = opts?.maxAttempts ?? 4;
  const listenMs = opts?.listenMs ?? 3_500;
  for (let i = 0; i < max; i++) {
    await jarvisSay(i === 0 ? prompt : 'Répondez par oui, ou par non.');
    const heard = await listenUtterance(listenMs);
    const v = parseYesNo(heard);
    if (v === 'yes') return true;
    if (v === 'no') return false;
    await jarvisSay("Je n'ai pas compris.");
  }
  return false;
}

/**
 * Capture un nom à la voix : écoute → Jarvis répète → oui/non.
 * Si non → recommence. Rend le nom confirmé ou null.
 */
export async function askNameWithConfirm(opts?: {
  isAlive?: () => boolean;
  onHeard?: (name: string) => void;
}): Promise<string | null> {
  const alive = opts?.isAlive ?? (() => true);
  for (let round = 0; round < 8 && alive(); round++) {
    await jarvisSay(
      round === 0
        ? 'Veuillez dire votre prénom, clairement.'
        : 'Recommençons. Dites votre prénom.',
    );
    const raw = await listenUtterance(5_000);
    if (!alive()) return null;
    const name = cleanName(raw);
    if (!name) {
      await jarvisSay("Je n'ai rien entendu. Réessayons.");
      continue;
    }
    opts?.onHeard?.(name);
    const ok = await askYesNo(
      `J'ai compris : ${name}. Confirmez par oui, ou dites non pour recommencer.`,
    );
    if (!alive()) return null;
    if (ok) return name;
    await jarvisSay('Très bien. Répétez votre prénom.');
  }
  return null;
}

function cleanName(raw: string): string {
  let t = raw.trim();
  // Retire formules politesse / wake
  t = t.replace(/^(je m['']appelle|mon nom est|je suis|c['']est|jarvis[, ]*)/i, '').trim();
  t = t.replace(/[.,!?]+$/g, '').trim();
  // Premier token capitalisé si phrase
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  // Garde 1–3 mots (prénom + éventuel nom)
  return parts.slice(0, 3).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export type CivilTitle = 'monsieur' | 'madame' | 'mademoiselle';

export function parseCivilTitle(text: string): CivilTitle | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/\b(mademoiselle|fille|enfant|miss)\b/.test(t)) return 'mademoiselle';
  if (/\b(madame|mme|femme|lady)\b/.test(t)) return 'madame';
  if (/\b(monsieur|mister|homme|garçon|garcon|mr)\b/.test(t)) return 'monsieur';
  return null;
}

/** Demande la civilité (monsieur / madame / mademoiselle) à la voix. */
export async function askTitleWithConfirm(opts?: {
  isAlive?: () => boolean;
}): Promise<CivilTitle | null> {
  const alive = opts?.isAlive ?? (() => true);
  for (let round = 0; round < 6 && alive(); round++) {
    await jarvisSay(
      round === 0
        ? 'Souhaitez-vous être appelé monsieur, madame, ou mademoiselle ?'
        : 'Répondez par monsieur, madame, ou mademoiselle.',
    );
    const heard = await listenUtterance(4_000);
    if (!alive()) return null;
    const title = parseCivilTitle(heard);
    if (!title) {
      await jarvisSay("Je n'ai pas compris.");
      continue;
    }
    const ok = await askYesNo(
      `Très bien, ${title}. Confirmez par oui, ou dites non pour recommencer.`,
    );
    if (!alive()) return null;
    if (ok) return title;
  }
  return null;
}
