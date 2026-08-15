/**
 * PresentationController — types.
 *
 * Indépendant du renderer (Three.js n'apparaît nulle part ici). Le
 * renderer (CinematicCamera, callouts, Agentic UI) lit cet état et décide
 * COMMENT l'animer ; ce module décide QUOI montrer.
 */

export type PresentationActionType =
  | 'overview'
  | 'focus'
  | 'enter'
  | 'inspect'
  | 'follow_relation'
  | 'back'
  | 'home';

export interface PresentationTarget {
  nodeId: string | null; // null seulement pour overview/home
  depth: number;
  action: PresentationActionType;
}

export type PresentationMode = 'overview' | 'focus' | 'enter' | 'inspect';

export interface ActiveRelation {
  from: string;
  to: string;
}

export interface PresentationState {
  mode: PresentationMode;
  currentNodeId: string | null;
  /** Pile de navigation — dernier élément = position actuelle. Overview = pile vide. */
  navigationStack: PresentationTarget[];
  depth: number;
  activeRelation: ActiveRelation | null;
  transitionState: 'idle' | 'transitioning';
  agenticContext: string | null;
  /** Origine du dernier changement — pour que JARVIS sache si l'utilisateur a repris la main. */
  origin: 'guided' | 'manual';
}

export const DEPTH_BY_ACTION: Record<PresentationActionType, number> = {
  overview: 0,
  focus: 1,
  enter: 2,
  inspect: 3,
  follow_relation: 1,
  back: -1, // recalculé depuis la pile, jamais utilisé tel quel
  home: 0,
};

export function initialPresentationState(): PresentationState {
  return {
    mode: 'overview',
    currentNodeId: null,
    navigationStack: [],
    depth: 0,
    activeRelation: null,
    transitionState: 'idle',
    agenticContext: null,
    origin: 'guided',
  };
}
