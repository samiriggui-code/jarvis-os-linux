/**
 * Pipeline chat HUD — texte ou voix → console + apps via catalogue.
 * Locale : mirror / preferred / sticky (« passe en anglais »).
 */
import { findAppByVoice, getAppById } from '../apps/catalog';
import { openHudApp, type OpenHudAppFx } from './openHudApp';
import {
  ackSwitch,
  detectUtteranceLanguage,
  parseLanguageSwitch,
  resolveReplyLanguage,
  type UserLocale,
} from './locale';
import { DEFAULT_HUD_PREFS } from './hudContracts';

export type ChatSideEffects = OpenHudAppFx & {
  setScanningActive: (v: boolean) => void;
  setInputMode?: (m: 'voice' | 'recovery') => void;
  navigateDashboard?: (page: string) => void;
  openMissionControl?: (opts: {
    scenario?: 'cursor' | 'generic';
    projectName?: string;
    title?: string;
    subtitle?: string;
  }) => void;
  closeMissionControl?: () => void;
  /** Locale session (prefs user) — optionnel */
  locale?: UserLocale;
  onLocaleSticky?: (lang: 'fr' | 'en') => void;
};

function loadLocale(): UserLocale {
  try {
    const raw = localStorage.getItem('jarvis.hud_preferences');
    if (raw) {
      const p = JSON.parse(raw);
      if (p?.locale) return { ...DEFAULT_HUD_PREFS.locale, ...p.locale };
    }
  } catch { /* */ }
  return { ...DEFAULT_HUD_PREFS.locale };
}

function bilingual(lang: 'fr' | 'en', fr: string, en: string) {
  return lang === 'en' ? en : fr;
}

export function interpretCommand(cmd: string, fx: ChatSideEffects): string {
  const lower = cmd.toLowerCase().trim();
  const locale = fx.locale || loadLocale();
  const resolved = resolveReplyLanguage(locale, cmd);
  const lang = resolved.language;

  if (resolved.switchAck && resolved.stickyUpdate) {
    fx.onLocaleSticky?.(resolved.stickyUpdate);
    return ackSwitch(resolved.stickyUpdate);
  }

  if (/\b(mode\s+recovery|mode\s+maintenance|recovery\s+mode)\b/.test(lower)) {
    fx.setInputMode?.('recovery');
    return bilingual(lang, 'Mode recovery — clics et clavier actifs.', 'Recovery mode — mouse and keyboard enabled.');
  }
  if (/\b(mode\s+voix|mode\s+kiosque|voice\s+mode)\b/.test(lower)) {
    fx.setInputMode?.('voice');
    return bilingual(lang, 'Mode voix — chrome masqué.', 'Voice mode — chrome hidden.');
  }

  if (/\b(ferme|fermer|close|dismiss)\b/.test(lower) && /\b(mission\s*control|mission)\b/.test(lower)) {
    fx.closeMissionControl?.();
    return bilingual(lang, 'Mission Control fermé.', 'Mission Control closed.');
  }

  // Mission Control — exemple Cursor (§15)
  if (
    /\b(mission\s*control)\b/.test(lower)
    || /\b(ouvre|ouvrir|lance|lancer|open|launch)\b/.test(lower) && /\bcursor\b/.test(lower)
    || /\b(cr[eé]e|creer|create)\b/.test(lower) && /\b(projet|project)\b/.test(lower)
    || /\bcursor\b/.test(lower) && /\b(projet|project|dev)\b/.test(lower)
  ) {
    const nameMatch = lower.match(/(?:projet|project)\s+([a-z0-9][\w\-]{1,32})/i)
      || lower.match(/(?:appel[eé]|nomm[eé]|named?)\s+([a-z0-9][\w\-]{1,32})/i);
    const projectName = nameMatch?.[1]
      ? nameMatch[1].replace(/^\w/, c => c.toUpperCase())
      : 'HoloControl';
    fx.openMissionControl?.({
      scenario: 'cursor',
      projectName,
      title: 'Ouverture environnement Cursor',
      subtitle: 'Hermès orchestre le projet via le Core.',
    });
    return bilingual(
      lang,
      `Mission Control — projet « ${projectName} » (Core).`,
      `Mission Control — project “${projectName}” (Core).`,
    );
  }

  if (/\b(dashboard|cockpit)\b/.test(lower)) {
    const pageHints: Array<{ keys: string[]; page: string }> = [
      { keys: ['recovery', 'récup'], page: 'recovery' },
      { keys: ['overview', 'stats', 'tokens', 'jetons'], page: 'dashboard' },
      { keys: ['hermes'], page: 'hermes' },
      { keys: ['voice', 'voix'], page: 'voice' },
      { keys: ['holomat', 'vision'], page: 'holomat' },
      { keys: ['docker'], page: 'docker' },
      { keys: ['terminal'], page: 'terminal' },
      { keys: ['deploy', 'déploi'], page: 'deploy' },
      { keys: ['agents'], page: 'agents' },
      { keys: ['tools', 'outils'], page: 'tools' },
      { keys: ['reach', 'agent-reach', 'internet', 'exa'], page: 'reach' },
      { keys: ['apps', 'applications'], page: 'apps' },
      { keys: ['système', 'system', 'monitoring'], page: 'system' },
      { keys: ['ia', 'providers', 'ai'], page: 'ai' },
      { keys: ['réglages', 'settings'], page: 'settings' },
      { keys: ['command', 'command center'], page: 'command' },
      { keys: ['entités', 'entities'], page: 'entities' },
    ];
    const hit = pageHints.find(h => h.keys.some(k => lower.includes(k)));
    fx.navigateDashboard?.(hit?.page || 'dashboard');
    fx.requestDashboard();
    return hit
      ? bilingual(lang, `Dashboard → ${hit.page}.`, `Dashboard → ${hit.page}.`)
      : bilingual(lang, 'Ouverture Dashboard.', 'Opening Dashboard.');
  }

  if (lower.includes('scan')) setTimeout(() => fx.setScanningActive(true), 600);
  if (/\b(apps|applications|lanceur|launcher)\b/.test(lower)) {
    setTimeout(() => fx.setAppGridOpen?.(true), 600);
    return bilingual(lang, 'Lanceur d’applications.', 'Opening app launcher.');
  }

  const byVoice = findAppByVoice(lower);
  if (byVoice) {
    const res = openHudApp(byVoice, fx);
    if (lang === 'en') {
      return `Sure. Opening ${byVoice.name}.`;
    }
    return res.ok ? `Bien sûr, j'ouvre ${byVoice.name}.` : res.message;
  }

  const openMatch = lower.match(
    /\b(?:ouvre|ouvrir|lance|lancer|start|open|launch)\s+([a-z0-9\-_ ]{2,40})/i,
  );
  if (openMatch) {
    const tip = openMatch[1].trim();
    const app =
      findAppByVoice(tip) ||
      getAppById(tip.replace(/\s+/g, '-')) ||
      getAppById(tip);
    if (app) {
      openHudApp(app, fx);
      return lang === 'en'
        ? `Sure. Opening ${app.name}.`
        : `Bien sûr, j'ouvre ${app.name}.`;
    }
  }

  if (/\b(cherche|recherche|research|look\s+up|deep\s+dive)\b/.test(lower)
    || /\b(youtube|github|reddit|twitter|rss)\b/.test(lower)) {
    const res = openHudApp('reach', fx);
    return bilingual(
      lang,
      res.ok
        ? 'Internet (Agent-Reach) — Hermes cherche puis synthétise. Config admin : Dashboard → Agent-Reach.'
        : res.message,
      res.ok
        ? 'Internet (Agent-Reach) — Hermes will fetch then summarize. Admin: Dashboard → Agent-Reach.'
        : res.message,
    );
  }

  if (/\b(status|statut)\b/.test(lower)) {
    return bilingual(lang, 'Systèmes nominaux.', 'All systems nominal.');
  }
  if (/\b(heure|time)\b/.test(lower)) {
    const t = new Date().toLocaleTimeString(lang === 'en' ? 'en-GB' : 'fr-FR');
    return bilingual(lang, `Il est ${t}.`, `It is ${t}.`);
  }
  if (/\b(bonjour|hello|salut|hi)\b/.test(lower)) {
    return bilingual(lang, 'Bonjour. JARVIS à votre écoute.', 'Hello. JARVIS listening.');
  }
  if (/\b(aide|help)\b/.test(lower)) {
    return bilingual(
      lang,
      'Dis « Jarvis ouvre … ». Langue : miroir de ta voix, ou « passe en anglais ».',
      'Say “Jarvis open …”. Language mirrors your speech, or “switch to French”.',
    );
  }
  if (/\b(m[eé]moire|memory)\b/.test(lower)) {
    return bilingual(lang, 'Mémoire locale Core (onglet MÉMOIRE).', 'Local Core memory (MEMORY tab).');
  }
  if (/\b(m[eé]t[eé]o|weather)\b/.test(lower)) {
    return bilingual(lang, 'Météo : outil Hermes à brancher.', 'Weather: Hermes tool not wired yet.');
  }
  if (/\bvps\b/.test(lower)) {
    return bilingual(
      lang,
      'VPS limité — allowlist + Policy. Pas de root libre.',
      'Limited VPS — allowlist + Policy. No free root.',
    );
  }

  const det = detectUtteranceLanguage(cmd);
  return bilingual(
    lang,
    `Compris : « ${cmd} ».${det ? ` (détecté ${det})` : ''} Hermes / Core complètent si joignables.`,
    `Got it: “${cmd}”.${det ? ` (detected ${det})` : ''} Hermes / Core will complete when online.`,
  );
}

export const CHAT_STORAGE_KEY = 'jarvis.hud_chat';

/** Réexport pour switch explicite hors interpret */
export { parseLanguageSwitch, resolveReplyLanguage };
