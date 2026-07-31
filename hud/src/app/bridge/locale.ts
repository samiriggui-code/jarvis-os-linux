/**
 * Locale foyer — détection langue énoncé + règles profil (mirror / preferred / sticky).
 * Whisper lang_id brancher plus tard via opts.whisperLang.
 */
export type Lang = 'fr' | 'en';
export type LocaleMode = 'mirror' | 'preferred' | 'sticky';

export type UserLocale = {
  preferredLanguage: Lang;
  secondaryLanguages: Lang[];
  mode: LocaleMode;
  stickyLanguage: Lang | null;
  voicePreset: 'jarvis_fr' | 'jarvis_en' | 'jarvis_soft';
  faceId: string | null;
};

const FR_RE = /\b(le|la|les|un|une|des|je|tu|nous|vous|est|suis|quoi|m[eé]t[eé]o|ouvre|lance|bonjour|merci|passe|fran[cç]ais)\b/i;
const EN_RE = /\b(the|a|an|is|are|what|what's|open|launch|please|thanks|hello|weather|calendar|switch|english|french)\b/i;

export function detectUtteranceLanguage(text: string): Lang | null {
  const t = text.trim();
  if (!t) return null;
  const fr = (t.match(new RegExp(FR_RE.source, 'gi')) || []).length;
  const en = (t.match(new RegExp(EN_RE.source, 'gi')) || []).length;
  if (!fr && !en) return null;
  return fr >= en ? 'fr' : 'en';
}

export function parseLanguageSwitch(text: string): Lang | null {
  if (/\b(passe\s+en\s+anglais|parle\s+anglais|switch\s+to\s+english|speak\s+english)\b/i.test(text)) return 'en';
  if (/\b(passe\s+en\s+fran[cç]ais|parle\s+fran[cç]ais|switch\s+to\s+french)\b/i.test(text)) return 'fr';
  return null;
}

export function resolveReplyLanguage(
  locale: UserLocale,
  utterance: string,
  whisperLang?: string | null,
): { language: Lang; voicePreset: UserLocale['voicePreset']; stickyUpdate: Lang | null; switchAck: boolean; detected: Lang | null } {
  const sw = parseLanguageSwitch(utterance);
  if (sw) {
    return {
      language: sw,
      voicePreset: locale.voicePreset === 'jarvis_soft' ? 'jarvis_soft' : sw === 'en' ? 'jarvis_en' : 'jarvis_fr',
      stickyUpdate: sw,
      switchAck: true,
      detected: sw,
    };
  }

  let detected: Lang | null = null;
  if (whisperLang) {
    const w = whisperLang.slice(0, 2).toLowerCase();
    if (w === 'fr' || w === 'en') detected = w;
  }
  if (!detected) detected = detectUtteranceLanguage(utterance);

  let language: Lang = locale.preferredLanguage;
  if (locale.mode === 'preferred') {
    language = locale.preferredLanguage;
  } else if (locale.stickyLanguage && (locale.mode === 'sticky' || locale.mode === 'mirror')) {
    language = locale.stickyLanguage;
  } else if (detected) {
    language = detected;
  }

  let voicePreset = locale.voicePreset;
  if (voicePreset !== 'jarvis_soft') {
    voicePreset = language === 'en' ? 'jarvis_en' : 'jarvis_fr';
  }

  return { language, voicePreset, stickyUpdate: null, switchAck: false, detected };
}

export function ackSwitch(lang: Lang): string {
  return lang === 'en' ? 'Sure. Switching to English.' : 'Bien sûr. Je passe en français.';
}
