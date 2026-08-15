import { useEffect, useMemo, useState } from 'react';
import {
  createPresentationController,
  type PresentationController,
  type PresentationState,
} from './presentationController';

export function usePresentationController(): {
  controller: PresentationController;
  state: PresentationState;
} {
  const controller = useMemo(() => createPresentationController(), []);
  const [state, setState] = useState<PresentationState>(() => controller.getState());

  useEffect(() => controller.subscribe(setState), [controller]);

  return { controller, state };
}
