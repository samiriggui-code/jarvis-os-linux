/**
 * Ouverture centralisée des apps HUD — grille, dock, voix, Hermes.
 * Évite les faux chemins (Dashboard sans admin, VPS root, soon).
 */
import type { LucideIcon } from 'lucide-react';
import { getAppById, type HudApp } from '../apps/catalog';

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

  if (app.vpsLimited) {
    fx.addNotification({
      type: 'info',
      title: app.name,
      message: 'VPS limité — Hermes + Policy (allowlist). Pas de root libre.',
    });
    return { ok: true, message: `${app.name} (VPS limité via Hermes).` };
  }

  if (app.status === 'hermes') {
    fx.addNotification({
      type: 'info',
      title: app.name,
      message: app.hermesTool
        ? `Surface HUD — Hermes outil « ${app.hermesTool} ».`
        : 'Surface HUD — commande Hermes.',
    });
    return { ok: true, message: `${app.name} — Hermes.` };
  }

  return { ok: true, message: `${app.name} ouvert.` };
}
