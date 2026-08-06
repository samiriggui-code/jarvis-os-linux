/**
 * Accès React à la boucle partagée.
 *
 * Les deux hooks lisent le callback et le framerate à travers des refs, ce qui
 * veut dire qu'un changement de prop prend effet à la frame suivante sans
 * jamais recréer l'abonnement — et sans la fermeture périmée qu'un callback
 * capturé au montage produirait.
 */

import { useEffect, useRef, type RefObject } from 'react';

import { subscribeToTicker, type TickerCallback } from './ticker';

export interface UseTickerOptions {
  /** Écart minimal entre appels (ms). `0` = chaque frame. */
  framerate?: number;
  /** Faux : l'abonnement n'est pas pris du tout. */
  enabled?: boolean;
}

export const useTicker = (
  onFrame: TickerCallback,
  { framerate = 0, enabled = true }: UseTickerOptions = {},
): void => {
  const onFrameRef = useRef(onFrame);
  const framerateRef = useRef(framerate);

  useEffect(() => {
    onFrameRef.current = onFrame;
    framerateRef.current = framerate;
  });

  useEffect(() => {
    if (!enabled) return;
    return subscribeToTicker(
      (time, delta) => onFrameRef.current(time, delta),
      () => framerateRef.current,
    );
  }, [enabled]);
};

/**
 * Comme `useTicker`, mais ne tourne que lorsque l'élément est à l'écran.
 *
 * Un panneau du HUD masqué derrière une autre scène n'a aucune raison de
 * consommer des frames. On garde une petite traîne après la sortie de champ :
 * les animations en cours ont besoin de quelques frames pour se poser
 * proprement au lieu de se figer au milieu d'un mouvement.
 */
export const useTickerInView = (
  ref: RefObject<Element | null>,
  onFrame: TickerCallback,
  options: UseTickerOptions & {
    /** Marge autour de la fenêtre : réchauffe l'élément avant son arrivée. */
    rootMargin?: string;
    /** Frames rendues après la sortie de champ. */
    trailingFrames?: number;
  } = {},
): void => {
  const { rootMargin = '0px', trailingFrames = 10, ...tickerOptions } = options;

  const inView = useRef(false);
  const trailing = useRef(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (inView.current && !entry.isIntersecting) trailing.current = trailingFrames;
        inView.current = entry.isIntersecting;
      },
      { threshold: 0, rootMargin },
    );

    observer.observe(element);
    inView.current = true;
    trailing.current = trailingFrames;

    return () => observer.disconnect();
  }, [ref, rootMargin, trailingFrames]);

  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  useTicker((time, delta) => {
    if (inView.current) {
      onFrameRef.current(time, delta);
      return;
    }
    if (trailing.current > 0) {
      trailing.current -= 1;
      onFrameRef.current(time, delta);
    }
  }, tickerOptions);
};
