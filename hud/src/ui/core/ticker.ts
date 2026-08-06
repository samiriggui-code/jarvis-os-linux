/**
 * Boucle de rendu partagée — une seule `requestAnimationFrame` pour tout le HUD.
 *
 * Le HUD empile des sources par-frame : orbe 3D, curseur gestuel, métriques
 * système, fond ambiant, animations de texte. Chacune démarrant sa propre rAF,
 * on paie N boucles là où une seule suffit — et rien ne peut les cadencer
 * ensemble. Ici tout s'abonne au même ticker.
 *
 * - Compté par référence : démarre au premier abonné, s'arrête au dernier.
 *   Un HUD au repos ne coûte rien.
 * - Chaque abonné a son propre budget de framerate (l'orbe peut tourner à
 *   60 fps pendant que le fond se contente de 30).
 * - Onglet caché → aucune frame. La visibilité est traitée ici, pas dans
 *   chaque abonné.
 * - Un abonné qui jette n'emporte pas les autres avec lui.
 */

export type TickerCallback = (time: number, delta: number) => void;

interface Subscriber {
  callback: TickerCallback;
  /** Lu à chaque frame : changer le framerate ne nécessite pas de se réabonner. */
  getFramerate: () => number;
  last: number;
}

const subscribers = new Set<Subscriber>();
let rafId: number | null = null;

/**
 * Delta maximal transmis aux abonnés (ms). Un retour d'onglet peut produire un
 * delta de plusieurs secondes ; sans plafond, tout intégrateur physique fait un
 * bond visible à la première frame.
 */
const MAX_DELTA = 50;

const frame = (time: number): void => {
  rafId = requestAnimationFrame(frame);

  // Un onglet caché ne peint rien : inutile de faire tourner la physique.
  if (typeof document !== 'undefined' && document.hidden) return;

  // Copie préalable : un callback peut s'abonner ou se désabonner en cours d'itération.
  for (const sub of [...subscribers]) {
    if (!subscribers.has(sub)) continue;

    const elapsed = time - sub.last;
    // Comparaison stricte : avec `<=`, un budget de 1000/30 ms rate
    // systématiquement sa cible sur un écran 120 Hz et rend ~26 fps.
    if (elapsed < sub.getFramerate()) continue;

    sub.last = time;
    try {
      sub.callback(time, Math.min(elapsed, MAX_DELTA));
    } catch (error) {
      console.error('[ticker] un abonné a jeté :', error);
    }
  }
};

const start = (): void => {
  if (rafId === null) rafId = requestAnimationFrame(frame);
};

const stop = (): void => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
};

/**
 * Abonne un callback à la boucle partagée.
 *
 * @param callback     reçoit l'horodatage rAF et le delta plafonné depuis son
 *                     propre appel précédent (pas depuis la frame précédente).
 * @param getFramerate écart minimal en ms entre deux appels ; `0` = chaque frame.
 * @returns            la fonction de désabonnement.
 */
export const subscribeToTicker = (
  callback: TickerCallback,
  getFramerate: () => number = () => 0,
): (() => void) => {
  const subscriber: Subscriber = {
    callback,
    getFramerate,
    last: typeof performance !== 'undefined' ? performance.now() : 0,
  };
  subscribers.add(subscriber);
  start();

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) stop();
  };
};

/** Nombre d'abonnés actifs — pour le diagnostic. */
export const tickerSubscriberCount = (): number => subscribers.size;
