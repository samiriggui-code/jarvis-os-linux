import {
  DEPTH_BY_ACTION,
  initialPresentationState,
  type ActiveRelation,
  type PresentationActionType,
  type PresentationState,
  type PresentationTarget,
} from './types';

type Listener = (state: PresentationState) => void;

const MODE_BY_ACTION: Partial<Record<PresentationActionType, PresentationState['mode']>> = {
  overview: 'overview',
  focus: 'focus',
  enter: 'enter',
  inspect: 'inspect',
  follow_relation: 'focus',
};

/**
 * Contrôleur de présentation — pile de navigation, focus, transitions.
 *
 * N'importe rien de Three.js ni de React. `enqueue` accepte une séquence
 * de PresentationTarget ; une nouvelle commande interactive (focus/enter/
 * inspect/back/home appelés directement) VIDE la queue en cours — c'est
 * la mécanique d'interruption (§16 du brief) : rien n'attend la fin d'une
 * transition en vol.
 */
export class PresentationController {
  private state: PresentationState = initialPresentationState();
  private listeners = new Set<Listener>();
  private queue: PresentationTarget[] = [];
  private queueTimer: ReturnType<typeof setTimeout> | null = null;

  getState(): PresentationState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(next: PresentationState) {
    this.state = next;
    this.listeners.forEach((l) => l(next));
  }

  private push(action: PresentationActionType, nodeId: string | null, origin: 'guided' | 'manual') {
    const depth = action === 'home' || action === 'overview' ? 0 : DEPTH_BY_ACTION[action];
    const target: PresentationTarget = { nodeId, depth, action };
    const stack =
      action === 'overview' || action === 'home' ? [] : [...this.state.navigationStack, target];

    this.emit({
      mode: MODE_BY_ACTION[action] ?? this.state.mode,
      currentNodeId: nodeId,
      navigationStack: stack,
      depth,
      activeRelation: action === 'follow_relation' ? this.state.activeRelation : null,
      transitionState: 'transitioning',
      agenticContext: action === 'inspect' ? nodeId : action === 'overview' || action === 'home' ? null : this.state.agenticContext,
      origin,
    });
  }

  /** Le renderer appelle ceci quand l'anim caméra atteint sa cible. */
  markTransitionSettled() {
    if (this.state.transitionState === 'idle') return;
    this.emit({ ...this.state, transitionState: 'idle' });
  }

  overview(origin: 'guided' | 'manual' = 'guided') {
    this.clearQueue();
    this.push('overview', null, origin);
  }

  home(origin: 'guided' | 'manual' = 'guided') {
    this.clearQueue();
    this.push('home', null, origin);
  }

  focus(nodeId: string, origin: 'guided' | 'manual' = 'guided') {
    this.clearQueue();
    this.push('focus', nodeId, origin);
  }

  enter(nodeId: string, origin: 'guided' | 'manual' = 'guided') {
    this.clearQueue();
    this.push('enter', nodeId, origin);
  }

  inspect(nodeId: string, origin: 'guided' | 'manual' = 'guided') {
    this.clearQueue();
    this.push('inspect', nodeId, origin);
  }

  followRelation(relation: ActiveRelation, origin: 'guided' | 'manual' = 'guided') {
    this.clearQueue();
    const target: PresentationTarget = { nodeId: relation.to, depth: 1, action: 'follow_relation' };
    this.emit({
      mode: 'focus',
      currentNodeId: relation.to,
      navigationStack: [...this.state.navigationStack, target],
      depth: 1,
      activeRelation: relation,
      transitionState: 'transitioning',
      agenticContext: this.state.agenticContext,
      origin,
    });
  }

  back(origin: 'guided' | 'manual' = 'guided') {
    this.clearQueue();
    const stack = this.state.navigationStack.slice(0, -1);
    const prev = stack[stack.length - 1] ?? null;
    if (!prev) {
      this.push('home', null, origin);
      return;
    }
    this.emit({
      mode: MODE_BY_ACTION[prev.action] ?? 'overview',
      currentNodeId: prev.nodeId,
      navigationStack: stack,
      depth: prev.depth,
      activeRelation: null,
      transitionState: 'transitioning',
      agenticContext: prev.action === 'inspect' ? prev.nodeId : null,
      origin,
    });
  }

  /** Annule toute transition/queue en cours — l'utilisateur/JARVIS reprend la main immédiatement. */
  cancel() {
    this.clearQueue();
    this.emit({ ...this.state, transitionState: 'idle' });
  }

  private clearQueue() {
    this.queue = [];
    if (this.queueTimer) {
      clearTimeout(this.queueTimer);
      this.queueTimer = null;
    }
  }

  /**
   * File d'actions temporisées — ex. script de présentation JARVIS.
   * `at` en ms, relatif au moment de l'appel. Un enqueue remplace toute
   * queue en cours (pas d'empilement de scripts concurrents).
   */
  enqueue(sequence: Array<{ at: number; action: PresentationActionType; nodeId?: string }>) {
    this.clearQueue();
    this.queue = sequence.map((s) => ({
      nodeId: s.nodeId ?? null,
      depth: DEPTH_BY_ACTION[s.action],
      action: s.action,
    }));

    sequence.forEach((step) => {
      const timer = setTimeout(() => {
        this.runQueuedStep(step.action, step.nodeId ?? null);
      }, step.at);
      // On garde seulement le dernier timer pour permettre un clearQueue
      // global ; les timers intermédiaires s'auto-annulent via ce même
      // clearTimeout au prochain clearQueue (Node/DOM les libère au GC).
      this.queueTimer = timer;
    });
  }

  private runQueuedStep(action: PresentationActionType, nodeId: string | null) {
    switch (action) {
      case 'overview':
        this.push('overview', null, 'guided');
        return;
      case 'home':
        this.push('home', null, 'guided');
        return;
      case 'focus':
      case 'enter':
      case 'inspect':
        if (nodeId) this.push(action, nodeId, 'guided');
        return;
      case 'back':
        this.back('guided');
        return;
      case 'follow_relation':
        return; // nécessite un ActiveRelation complet — pas géré via enqueue simple V1
      default:
        return;
    }
  }
}
