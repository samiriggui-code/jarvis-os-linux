/**
 * Pont HUD ↔ Dashboard iframe (postMessage).
 * Jarvis : « ouvre dashboard hermes » → #/hermes dans l’iframe.
 */
const DASHBOARD_ORIGIN = 'http://127.0.0.1:5174';

export type DashboardMsg =
  | { type: 'jarvis:navigate'; page: string }
  | { type: 'jarvis:inputMode'; mode: 'voice' | 'recovery' }
  | { type: 'jarvis:ping' };

export function postDashboardNavigate(page: string) {
  const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="Dashboard Core"]');
  if (!iframe?.contentWindow) {
    // Stash pour le prochain load iframe
    try { sessionStorage.setItem('jarvis.dashboard.pendingPage', page); } catch { /* */ }
    return;
  }
  const msg: DashboardMsg = { type: 'jarvis:navigate', page };
  iframe.contentWindow.postMessage(msg, DASHBOARD_ORIGIN);
}

export function postDashboardInputMode(mode: 'voice' | 'recovery') {
  const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="Dashboard Core"]');
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage({ type: 'jarvis:inputMode', mode } satisfies DashboardMsg, DASHBOARD_ORIGIN);
}
