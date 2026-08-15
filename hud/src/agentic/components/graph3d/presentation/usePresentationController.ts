import { useMemo, useSyncExternalStore } from 'react';
import { PresentationController } from './PresentationController';
import type { PresentationState } from './types';

export interface PresentationHandle {
  state: PresentationState;
  controller: PresentationController;
}

/** Un contrôleur par instance de scène — pas de singleton global. */
export function usePresentationController(): PresentationHandle {
  const controller = useMemo(() => new PresentationController(), []);
  const state = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getState(),
  );
  return { state, controller };
}
