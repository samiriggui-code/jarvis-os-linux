/**
 * Protocole vocal JARVIS
 * - Veille : wake word seul (léger) — ignore TV / autres voix
 * - Après réveil : fenêtre d’écoute — la commande peut suivre APRÈS une pause
 *   (Jarvis … [silence] … lance un film) sans devoir redire Jarvis
 * - Cycle : écoute → réflexion → réponse → micro repos (veille)
 */

const WAKE_RE = /^(?:hey |ok |bonjour )?jarvis\b[\s,.:;!\-—]*/i;

export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

/** True si l’énoncé commence par Jarvis (commande valide). */
export function startsWithJarvis(text: string): boolean {
  return WAKE_RE.test(normalizeSpeech(text));
}

/** Retire le préfixe Jarvis → corps de la commande. */
export function stripJarvisPrefix(text: string): string {
  const t = text.trim();
  const m = t.match(WAKE_RE);
  if (!m) return t;
  return t.slice(m[0].length).trim();
}

/** Uniquement « Jarvis » / « Hey Jarvis » sans suite. */
export function isWakeOnly(text: string): boolean {
  const rest = stripJarvisPrefix(text);
  return startsWithJarvis(text) && rest.length === 0;
}

/**
 * Décide si on traite l’énoncé.
 *
 * @param wakeAlreadyGranted — true si le wake word a déjà ouvert la fenêtre
 *   d’écoute (pause OK entre « Jarvis » et la question).
 */
export function acceptVoiceCommand(
  text: string,
  opts?: { wakeAlreadyGranted?: boolean },
): { ok: true; command: string } | { ok: false; reason: string } {
  const raw = text.trim();
  if (!raw) return { ok: false, reason: 'empty' };

  const granted = opts?.wakeAlreadyGranted === true;

  if (startsWithJarvis(raw)) {
    if (isWakeOnly(raw)) {
      return { ok: false, reason: 'wake_only' };
    }
    const command = stripJarvisPrefix(raw);
    if (!command) return { ok: false, reason: 'wake_only' };
    return { ok: true, command };
  }

  // Suite après pause : wake déjà validé → le corps suffit
  if (granted) {
    const cmd = raw.replace(/^[,.:;!\-—\s]+/, '').trim();
    if (cmd.length < 2) return { ok: false, reason: 'too_short' };
    return { ok: true, command: cmd };
  }

  return { ok: false, reason: 'no_jarvis_prefix' };
}
