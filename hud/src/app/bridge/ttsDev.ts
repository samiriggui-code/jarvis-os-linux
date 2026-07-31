/**
 * TTS stub — Windows SpeechSynthesis (dev, §3.4).
 * Chrome : unlockAudio() au 1er geste utilisateur.
 */
export interface TtsDevOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
  preferVoiceName?: string;
}

const STORAGE_KEY = 'jarvis_tts_voice_name';

function envVoiceName(): string {
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TTS_VOICE_NAME) || '';
}

/** Env .development > localStorage (évite Hortense collée en cache alors que Paul est dans .env). */
function resolvePreferName(explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  const fromEnv = envVoiceName().trim();
  if (fromEnv) return fromEnv;
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setPreferredVoiceName(name: string): void {
  try {
    if (name) localStorage.setItem(STORAGE_KEY, name);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* */ }
}

export function getPreferredVoiceName(): string {
  return resolvePreferName();
}

const DEFAULTS: Required<TtsDevOptions> = {
  lang: 'fr-FR',
  rate: 0.92,
  pitch: 0.85,
  preferVoiceName: '',
};

let _voices: SpeechSynthesisVoice[] = [];
let _unlocked = false;
let _queue: Array<() => void> = [];

function refreshVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  _voices = window.speechSynthesis.getVoices();
  return _voices;
}

function scoreVoice(v: SpeechSynthesisVoice, prefer: string): number {
  const name = v.name.toLowerCase();
  const pref = prefer.toLowerCase().trim();
  if (!pref) return 0;
  if (name === pref) return 100;
  if (name.startsWith(pref)) return 90;
  if (name.includes(pref)) return 80;
  // "Microsoft Paul" vs "Microsoft Paul - French (France)"
  const tokens = pref.replace(/microsoft\s+/i, '').split(/\s+/).filter(Boolean);
  if (tokens.length && tokens.every(t => name.includes(t))) return 70;
  // dernier token significatif (Paul, Hortense…)
  const last = tokens[tokens.length - 1];
  if (last && last.length >= 3 && name.includes(last)) return 60;
  return 0;
}

function pickVoice(prefer?: string): SpeechSynthesisVoice | null {
  const voices = refreshVoices();
  if (!voices.length) return null;

  if (prefer?.trim()) {
    let best: SpeechSynthesisVoice | null = null;
    let bestScore = 0;
    for (const v of voices) {
      const s = scoreVoice(v, prefer);
      if (s > bestScore) {
        bestScore = s;
        best = v;
      }
    }
    if (best && bestScore >= 60) return best;
    console.warn('[tts-dev] voix introuvable pour', prefer, '— fallback FR');
  }

  // Sans préférence explicite : 1ère FR (ordre OS), pas Hortense forcée
  return voices.find(v => v.lang.toLowerCase().startsWith('fr')) ?? voices[0] ?? null;
}

export function unlockAudio(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  _unlocked = true;
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    const warm = new SpeechSynthesisUtterance(' ');
    warm.volume = 0;
    warm.rate = 2;
    window.speechSynthesis.speak(warm);
    window.speechSynthesis.cancel();
  } catch { /* */ }
  const pending = _queue.splice(0);
  pending.forEach(fn => fn());
}

export function initTtsDev(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = () => refreshVoices();

  // Aligner le cache navigateur sur .env (Paul) si défini
  const fromEnv = envVoiceName().trim();
  if (fromEnv) setPreferredVoiceName(fromEnv);

  const once = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once, { once: true });
  window.addEventListener('keydown', once, { once: true });

  console.info('[tts-dev] prefer=', resolvePreferName() || '(auto FR)', '· voices=', listFrVoices().map(v => v.name));
}

export function speakDev(text: string, opts?: TtsDevOptions): Promise<void> {
  const run = (): Promise<void> =>
    new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        console.warn('[tts-dev] SpeechSynthesis indisponible');
        resolve();
        return;
      }
      if (!text?.trim()) {
        resolve();
        return;
      }

      const prefer = resolvePreferName(opts?.preferVoiceName);
      const cfg = { ...DEFAULTS, ...opts, preferVoiceName: prefer };
      try { window.speechSynthesis.resume(); } catch { /* */ }
      try { window.speechSynthesis.cancel(); } catch { /* */ }

      const utter = new SpeechSynthesisUtterance(text.trim());
      utter.lang = cfg.lang;
      utter.rate = cfg.rate;
      utter.pitch = cfg.pitch;
      utter.volume = 1;

      const voice = pickVoice(cfg.preferVoiceName || undefined);
      if (voice) {
        utter.voice = voice;
        utter.lang = voice.lang || cfg.lang;
        console.info('[tts-dev] speak with', voice.name, '→', text.slice(0, 60));
      } else {
        console.warn('[tts-dev] aucune voix — défaut OS', text.slice(0, 60));
      }

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      utter.onend = finish;
      utter.onerror = (e) => {
        console.warn('[tts-dev] error', e);
        finish();
      };
      window.setTimeout(finish, Math.min(30000, 800 + text.length * 80));

      window.speechSynthesis.speak(utter);
      try { window.speechSynthesis.resume(); } catch { /* */ }
    });

  if (!_unlocked) {
    console.warn('[tts-dev] en attente du 1er clic pour débloquer l’audio Chrome');
    return new Promise((resolve) => {
      _queue.push(() => { void run().then(resolve); });
    });
  }
  return run();
}

export function stopDev(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function listFrVoices(): SpeechSynthesisVoice[] {
  return refreshVoices().filter(v => v.lang.toLowerCase().startsWith('fr'));
}

export async function testTtsNow(sample = 'Système JARVIS. Synthèse vocale opérationnelle.'): Promise<string> {
  unlockAudio();
  await new Promise(r => setTimeout(r, 80));
  const voices = listFrVoices();
  await speakDev(sample);
  const active = pickVoice(resolvePreferName());
  return active
    ? `Active: ${active.name} · FR: ${voices.map(v => v.name).join(' | ') || '—'}`
    : voices.map(v => v.name).join(' | ') || '(aucune voix FR)';
}
