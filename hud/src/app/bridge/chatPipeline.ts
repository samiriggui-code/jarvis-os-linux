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
  openMissionControlDev?: (opts: {
    scenario?: 'cursor' | 'generic';
    projectName?: string;
    title?: string;
    subtitle?: string;
  }) => void;
  closeMissionControlDev?: () => void;
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

/**
 * Retire les accents avant toute comparaison.
 *
 * `\b` de JavaScript est ASCII : « é » compte comme une NON-lettre, donc les
 * frontières de mot tombent au milieu des verbes français. C'est ce qui faisait
 * que « crée un projet » ouvrait Mission Control DEV mais pas « créer un
 * projet » — l'infinitif, c'est-à-dire la façon dont on le dit le plus souvent.
 * Déaccentuer une fois vaut mieux que semer des `[eé]` dans chaque motif.
 */
function deburr(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Verbes de fabrication — « ouvre » et « lance » n'en font PAS partie. */
const VERBE_FABRIQUER =
  /\b(cree|crees|creer|creez|creation|create|creates|genere|generer|developpe|developper|initialise|initialiser|monte|monter|build|make)\b/;

/** Ce qui se fabrique. Volontairement borné : pas « scénario », pas « playlist ». */
const CHOSE_FABRICABLE =
  /\b(projets?|projects?|application|appli|app|api|micro-?service|systeme|logiciel|bot|script|outil|module|site)\b/;

/** « nouveau projet », « démarre un projet » — sans verbe de fabrication. */
const NOUVEAU_PROJET =
  /\b(nouveau|nouvelle|new|demarre|demarrer|lance|lancer|start)\b[^.!?]{0,20}\b(projets?|projects?)\b/;

/** Mots qui ne sont jamais un nom de projet. */
const PROJECT_NAME_STOP =
  /^(un|une|le|la|les|des|mon|ma|mes|ton|ta|tes|notre|votre|nouveau|nouvelle|new|projet|project|appele|appelee|nomme|nommee|named?)$/i;

/**
 * Extraire le nom après « projet … » / « nommé … ».
 * Sans nom → null (on demande, on ne force plus HoloControl).
 */
function extractProjectName(cmd: string): string | null {
  const patterns = [
    /(?:nouveau|nouvelle|new)\s+(?:projet|project)\s+([\p{L}\p{N}][\p{L}\p{N}_-]{1,48})/iu,
    /(?:projet|project)\s+(?:appel[ée]\s+|nomm[ée]\s+)?([\p{L}\p{N}][\p{L}\p{N}_-]{1,48})/iu,
    /(?:appel[eé]|nomm[eé]|named?)\s+([\p{L}\p{N}][\p{L}\p{N}_-]{1,48})/iu,
  ];
  for (const re of patterns) {
    const m = cmd.match(re);
    const raw = m?.[1]?.trim();
    if (raw && !PROJECT_NAME_STOP.test(raw)) {
      return raw.replace(/^\w/, (c) => c.toUpperCase());
    }
  }
  return null;
}

export function interpretCommand(
  cmd: string,
  fx: ChatSideEffects,
  opts?: { deferToCore?: boolean },
): string {
  const lower = cmd.toLowerCase().trim();
  const locale = fx.locale || loadLocale();
  const resolved = resolveReplyLanguage(locale, cmd);
  const lang = resolved.language;
  const defer = opts?.deferToCore === true;

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

  // « mission » nu ne déclenche plus rien : le mot ne dit pas de quel cockpit
  // il s'agit. Il faut « mission control » (dev) — et le jour où Mission
  // Control HOME existe, ce motif devra exiger « dev » explicitement.
  if (/\b(ferme|fermer|close|dismiss)\b/.test(lower) && /\bmission\s*control\b/.test(lower)) {
    fx.closeMissionControlDev?.();
    return bilingual(lang, 'Mission Control DEV fermé.', 'Mission Control DEV closed.');
  }

  // Mission Control DEV — orchestration d'un projet logiciel (§15.1.1)
  const plain = deburr(lower);

  // « ouvre Cursor » seul → surface IDE HUD (pas Mission Control).
  if (
    /\b(ouvre|ouvrir|lance|lancer|open|launch)\b/.test(plain)
    && /\bcursor\b/.test(plain)
    && !/\b(projet|project)\b/.test(plain)
    && !/\bmission\s*control\b/.test(plain)
  ) {
    const res = openHudApp('cursor', fx);
    return res.message;
  }

  if (
    /\b(mission\s*control)\b/.test(plain)
    || VERBE_FABRIQUER.test(plain) && CHOSE_FABRICABLE.test(plain)
    || NOUVEAU_PROJET.test(plain)
    || /\bcursor\b/.test(plain) && /\b(projet|project|dev)\b/.test(plain)
  ) {
    // Nom sur le texte D'ORIGINE (accents). Plus de défaut « HoloControl ».
    const projectName = extractProjectName(cmd);
    if (!projectName) {
      return bilingual(
        lang,
        'Quel nom pour le projet ? Dites par exemple « ouvre un nouveau projet HolomatControl ».',
        'What should we call the project? Say e.g. “open a new project HolomatControl”.',
      );
    }
    fx.openMissionControlDev?.({
      scenario: 'cursor',
      projectName,
      title: 'Ouverture environnement Cursor',
      subtitle: 'Core crée le workspace + mémoire DB ; handoff surface Cursor.',
    });
    return bilingual(
      lang,
      `Mission Control DEV — projet « ${projectName} » (Core).`,
      `Mission Control DEV — project “${projectName}” (Core).`,
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
    if (defer) {
      return bilingual(lang, 'Transmis au Core…', 'Sent to Core…');
    }
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
    if (defer) {
      return bilingual(lang, 'Transmis au Core…', 'Sent to Core…');
    }
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
    if (defer) {
      return bilingual(lang, 'Recherche en cours via le Core…', 'Searching via Core…');
    }
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
