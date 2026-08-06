/**
 * Ouverture centralisée des intentions — grille, dock, voix.
 *
 * Deux chemins, et un seul décide :
 *
 *   - `status: 'live'`  → une page produit React existe. Le HUD l'ouvre lui-même,
 *     sans LLM et sans réseau. C'est ce qui fait tenir `JARVIS BASE` : le lanceur
 *     et ses pages fréquentes survivent à un Core absent.
 *   - `status: 'surface'` → le HUD ne décide de rien. Il demande au Core d'ouvrir
 *     l'intention ; le Core applique la Policy, choisit l'exécutant, et diffuse une
 *     surface. Le résultat arrive par `SURFACE_SNAPSHOT`, pas par cette fonction.
 *
 * Ce fichier n'a donc AUCUNE connaissance de qui exécute. Il envoie un `intent`.
 * Avant, il affichait « Hermes outil « X » » dans une notification — un libellé,
 * jamais un appel : vingt tuiles sur trente ne faisaient rien.
 */
import type { LucideIcon } from 'lucide-react';
import { getAppById, type HudApp } from '../apps/catalog';
import { getCoreClient } from './coreClient';

export type OpenHudAppFx = {
  launchApp: (app: { id: string; name: string; color: string; icon: LucideIcon }) => void;
  setSettingsOpen: (v: boolean) => void;
  setGestureOpen?: (v: boolean) => void;
  setAppGridOpen?: (v: boolean) => void;
  requestDashboard: () => void;
  openSettings?: (section?: 'profil' | 'voix' | 'vision' | 'comportement' | 'coupure' | 'foyer') => void;
  addNotification: (n: { type: 'info' | 'warning' | 'success' | 'error'; title: string; message: string }) => void;
  isAdmin?: boolean;
  role?: string | null;
  setInputMode?: (m: 'voice' | 'recovery') => void;
  navigateDashboard?: (page: string) => void;
};

export type OpenResult = { ok: boolean; message: string };

export function openHudApp(appOrId: HudApp | string, fx: OpenHudAppFx): OpenResult {
  const app = typeof appOrId === 'string' ? getAppById(appOrId) : appOrId;
  if (!app) return { ok: false, message: 'Application inconnue.' };

  if (app.status === 'soon') {
    fx.addNotification({ type: 'info', title: app.name, message: 'Pas encore disponible.' });
    return { ok: false, message: `${app.name} — bientôt.` };
  }

  const admin =
    fx.isAdmin === true ||
    fx.role === 'ADMIN';

  if (app.adminOnly && !admin) {
    fx.addNotification({
      type: 'warning',
      title: app.name,
      message: 'Réservé à l’administrateur (Dashboard / Policy).',
    });
    return { ok: false, message: 'Permission refusée — ADMIN requis.' };
  }

  fx.setAppGridOpen?.(false);

  if (app.id === 'settings') {
    fx.setSettingsOpen(true);
    return { ok: true, message: 'Paramètres ouverts.' };
  }

  if (app.id === 'vision') {
    fx.openSettings?.('vision');
    fx.setGestureOpen?.(true);
    fx.addNotification({ type: 'info', title: 'Holomat', message: 'Vision / gestes — Settings + panneau gestes.' });
    return { ok: true, message: 'Holomat / gestes.' };
  }

  if (app.id === 'hub') {
    fx.requestDashboard();
    return { ok: true, message: 'Accès Dashboard (auth admin).' };
  }

  fx.launchApp({ id: app.id, name: app.name, color: app.color, icon: app.icon });

  if (app.status === 'surface') {
    if (!app.intent) {
      // Une tuile « surface » sans intention n'a aucun chemin d'exécution. Le dire
      // plutôt que d'ouvrir une fenêtre vide : c'est une erreur de catalogue.
      fx.addNotification({
        type: 'warning',
        title: app.name,
        message: 'Aucune intention déclarée pour cette tuile.',
      });
      return { ok: false, message: `${app.name} — intention manquante.` };
    }

    // `prompt` est laissé vide ici : un clic demande un ÉTAT, pas une action. Une
    // phrase (« allume le salon ») arrive par la voix ou le chat, pas par la tuile.
    getCoreClient().send({
      type: 'surface',
      action: 'open',
      app: app.id,
      intent: app.intent,
    });

    if (app.vpsLimited) {
      fx.addNotification({
        type: 'info',
        title: app.name,
        message: 'Accès limité — allowlist + Policy. Pas de root libre.',
      });
    }
    return { ok: true, message: `${app.name} — demande envoyée au Core.` };
  }

  return { ok: true, message: `${app.name} ouvert.` };
}
