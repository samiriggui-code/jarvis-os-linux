import { easeInOutCubic } from './presentationEasing';

/**
 * Moteur de navigation profondeur N. Piloté par une seule pile —
 * PAS une variable de transition par palier (transition/territoryTransition/
 * fileTransition/...). depth 0 = JARVIS, 1 = process, 2 = directory,
 * 3 = file, 4 = symbol, etc. Le moteur ne connaît aucun de ces noms —
 * seulement des index de pile.
 */
export type PresentationDirection = 'idle' | 'entering' | 'leaving';

export type PresentationState = {
  /** Pile réglée — source de vérité au repos. [] = JARVIS. */
  stack: string[];
  /** Pile visée pendant une transition ; null si idle. */
  pendingStack: string[] | null;
  /** Progression brute 0→1 de la transition en cours. */
  transition: number;
  direction: PresentationDirection;
};

export const PRESENTATION_TIMING = {
  enterMs: 1500,
  backMs: 1200,
  homeMs: 1500,
} as const;

export const INITIAL_PRESENTATION: PresentationState = {
  stack: [],
  pendingStack: null,
  transition: 0,
  direction: 'idle',
};

/** Profondeur "connue" — la plus grande des deux piles (réglée / visée). */
export function stackDepth(state: PresentationState): number {
  return Math.max(state.stack.length, state.pendingStack?.length ?? 0);
}

export function currentNodeId(state: PresentationState): string | null {
  const s = state.stack;
  return s.length ? s[s.length - 1]! : null;
}

/**
 * Profondeur effective continue — glisse de stack.length vers
 * pendingStack.length pendant une transition, quel que soit l'écart
 * (1 palier comme N paliers, ex. home() depuis L4).
 */
function effectiveDepth(state: PresentationState): number {
  if (state.direction === 'idle' || !state.pendingStack) return state.stack.length;
  const from = state.stack.length;
  const to = state.pendingStack.length;
  return from + (to - from) * easeInOutCubic(state.transition);
}

/**
 * lod ∈ [0,1] à la profondeur `depth` (1 = process, 2 = directory, ...).
 * Chaque palier "s'allume" progressivement quand la profondeur effective
 * le dépasse — générique, aucun cas spécial par nom de palier. Un jump
 * multi-niveaux (home() depuis L3) fait s'éteindre les paliers un par un
 * dans l'ordre au lieu d'un saut brutal.
 */
export function lodAtDepth(state: PresentationState, depth: number): number {
  const ed = effectiveDepth(state);
  return Math.max(0, Math.min(1, ed - (depth - 1)));
}

/** Compat — lod du palier 1 (process). Utilisé par NeuralGraph.tsx existant. */
export function presentationLodT(state: PresentationState): number {
  return lodAtDepth(state, 1);
}

/** Compat V1 — palier 2 (directory/territoire), tant que L3+ n'est pas construit. */
export function territoryLodT(state: PresentationState): number {
  return lodAtDepth(state, 2);
}

export function canEnter(state: PresentationState): boolean {
  return state.direction === 'idle';
}

export function canGoBack(state: PresentationState): boolean {
  return state.direction === 'idle' && state.stack.length > 0;
}

type Listener = (state: PresentationState) => void;

/** Contrôleur unique — JARVIS / DEBUG envoient enterNode/back/home ici. */
export class PresentationController {
  private state: PresentationState = { ...INITIAL_PRESENTATION };
  private listeners = new Set<Listener>();
  private raf = 0;

  getState(): PresentationState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  private cancelAnim() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private animateTo(target: string[], direction: PresentationDirection, durationMs: number) {
    this.cancelAnim();
    const from = this.state.stack;
    this.state = { stack: from, pendingStack: target, transition: 0, direction };
    this.emit();
    const start = performance.now();
    const tick = () => {
      const raw = Math.min(1, (performance.now() - start) / durationMs);
      this.state = { stack: from, pendingStack: target, transition: raw, direction };
      this.emit();
      if (raw < 1) {
        this.raf = requestAnimationFrame(tick);
      } else {
        this.raf = 0;
        this.state = { stack: target, pendingStack: null, transition: 0, direction: 'idle' };
        this.emit();
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  /**
   * Primitive UNIQUE de descente — process, directory, file, symbole :
   * même mécanique à toute profondeur. Pas de méthode par palier.
   */
  enterNode(nodeId: string) {
    if (!canEnter(this.state)) return;
    this.animateTo([...this.state.stack, nodeId], 'entering', PRESENTATION_TIMING.enterMs);
  }

  /** Compat — ancien point d'entrée L0→process ; délègue à enterNode. */
  enter(processId: string) {
    if (this.state.stack.length !== 0 || !canEnter(this.state)) return;
    this.enterNode(processId);
  }

  /** Remonte d'UN élément dans navigationStack — aucune logique par palier. */
  back() {
    if (!canGoBack(this.state)) return;
    this.animateTo(this.state.stack.slice(0, -1), 'leaving', PRESENTATION_TIMING.backMs);
  }

  /** Retour direct à JARVIS depuis n'importe quelle profondeur. */
  home() {
    if (this.state.direction !== 'idle') return;
    if (this.state.stack.length === 0) return;
    this.animateTo([], 'leaving', PRESENTATION_TIMING.homeMs);
  }

  overview() {
    this.home();
  }
}

export function createPresentationController(): PresentationController {
  return new PresentationController();
}
