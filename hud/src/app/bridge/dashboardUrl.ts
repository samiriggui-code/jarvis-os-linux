/**
 * URL Dashboard.
 * - iframe HUD : même origine `/dashboard/` (nginx NUC, ou tunnel VPS→NUC)
 * - lien public FQDN : toujours `https://jarvis.global-it-ss.com/dashboard/`
 *
 * DNS public → VPS (Traefik) → tunnel `127.0.0.1:18080` → nginx NUC :8080.
 * Ça ne change pas le fonctionnement app : le Core reste sur le NUC.
 */
export const JARVIS_PUBLIC_ORIGIN = 'https://jarvis.global-it-ss.com';

/** Lien FQDN (nouvel onglet / favori) — indépendant de l’origine courante. */
export function dashboardPublicUrl(): string {
  const fromEnv = import.meta.env.VITE_DASHBOARD_PUBLIC_URL as string | undefined;
  if (fromEnv) return fromEnv.endsWith('/') ? fromEnv : `${fromEnv}/`;
  return `${JARVIS_PUBLIC_ORIGIN}/dashboard/`;
}

/** URL pour iframe / postMessage — même origine que le HUD en prod. */
export function dashboardUrl(): string {
  const fromEnv = import.meta.env.VITE_DASHBOARD_URL as string | undefined;
  if (fromEnv) return fromEnv.endsWith('/') ? fromEnv : `${fromEnv}/`;
  if (import.meta.env.DEV) return 'http://127.0.0.1:5174/';
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/dashboard/`;
  }
  return 'http://127.0.0.1:5174/';
}

export function dashboardOrigin(): string {
  try {
    return new URL(dashboardUrl()).origin;
  } catch {
    return 'http://127.0.0.1:5174';
  }
}

/** Ouvre le Dashboard sur le FQDN public (nouvel onglet). */
export function openDashboardPublic(): void {
  if (typeof window === 'undefined') return;
  window.open(dashboardPublicUrl(), '_blank', 'noopener,noreferrer');
}
