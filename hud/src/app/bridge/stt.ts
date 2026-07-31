/**
 * STT commande (écoute active) — Web Speech API.
 * Distinct du wake word (audioBus) : une seule session SpeechRecognition à la fois.
 */
type InterimFn = (text: string) => void;
type FinalFn = (text: string) => void;

let cmdRec: SpeechRecognition | null = null;
let active = false;
let onInterim: InterimFn | null = null;
let onFinal: FinalFn | null = null;

function getSR(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSttAvailable(): boolean {
  return !!getSR();
}

export function startCommandStt(handlers: { onInterim?: InterimFn; onFinal?: FinalFn }): boolean {
  const SR = getSR();
  if (!SR) return false;

  stopCommandStt();
  onInterim = handlers.onInterim ?? null;
  onFinal = handlers.onFinal ?? null;
  active = true;

  const rec = new SR();
  cmdRec = rec;
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'fr-FR';

  rec.onresult = (ev: SpeechRecognitionEvent) => {
    let interim = '';
    let final = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const piece = ev.results[i][0]?.transcript ?? '';
      if (ev.results[i].isFinal) final += piece;
      else interim += piece;
    }
    if (interim) onInterim?.(interim.trim());
    if (final.trim()) {
      onInterim?.('');
      onFinal?.(final.trim());
    }
  };

  rec.onerror = () => { /* no-speech etc. */ };
  rec.onend = () => {
    if (active && cmdRec === rec) {
      try { rec.start(); } catch { /* */ }
    }
  };

  try {
    rec.start();
    return true;
  } catch {
    active = false;
    return false;
  }
}

export function stopCommandStt() {
  active = false;
  try { cmdRec?.stop(); } catch { /* */ }
  cmdRec = null;
  onInterim = null;
  onFinal = null;
}
