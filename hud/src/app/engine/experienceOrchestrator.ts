/**
 * Experience Orchestrator — JARVIS HUD
 * Cahier §3.5
 *
 * Synchronise : processus système → voix TTS → texte HUD → avatar → orbe
 * La voix accompagne les events. Elle ne précède pas.
 */

export type OrbState = 'idle' | 'listening' | 'processing' | 'responding' | 'thinking';
export type AvatarMode = 'idle' | 'scanning' | 'speaking' | 'ok' | 'denied' | 'listening' | 'alert';

export interface SceneStep {
  id: string;
  hudText: string;
  hudSubtext?: string;
  voiceLine?: string;           // undefined = silence
  orbState: OrbState;
  avatarMode: AvatarMode;
  /** ms — minimum avant de passer à l'étape suivante */
  minDuration?: number;
  /** ms — pause APRÈS la fin de la voix */
  pauseAfter?: number;
  /** true = attente interaction utilisateur avant de continuer */
  waitForUser?: boolean;
  /** Attente processus async (ex. scan face piloté par events) */
  waitForAsync?: () => Promise<void>;
  /** callback optionnel déclenché quand l'étape DÉMARRE */
  onEnter?: () => void;
  /** callback optionnel déclenché quand l'étape TERMINE */
  onComplete?: () => void;
}

export interface OrchestratorState {
  stepIndex: number;
  currentStep: SceneStep | null;
  isRunning: boolean;
  isSpeaking: boolean;
  isWaitingForUser: boolean;
  hudText: string;
  hudSubtext: string;
  orbState: OrbState;
  avatarMode: AvatarMode;
}

type Listener = (state: OrchestratorState) => void;

export class ExperienceOrchestrator {
  private steps: SceneStep[] = [];
  private state: OrchestratorState = {
    stepIndex: -1,
    currentStep: null,
    isRunning: false,
    isSpeaking: false,
    isWaitingForUser: false,
    hudText: '',
    hudSubtext: '',
    orbState: 'idle',
    avatarMode: 'idle',
  };
  private listeners: Listener[] = [];
  private alive = true;
  private ttsEnabled: boolean;
  private speakFn: (text: string, opts?: { rate?: number; pitch?: number }) => Promise<void>;
  private stopFn: () => void;

  constructor(opts: {
    ttsEnabled: boolean;
    speakFn: (text: string, opts?: { rate?: number; pitch?: number }) => Promise<void>;
    stopFn: () => void;
  }) {
    this.ttsEnabled = opts.ttsEnabled;
    this.speakFn = opts.speakFn;
    this.stopFn = opts.stopFn;
  }

  subscribe(fn: Listener) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private emit() {
    const s = { ...this.state };
    this.listeners.forEach(l => l(s));
  }

  private patch(update: Partial<OrchestratorState>) {
    this.state = { ...this.state, ...update };
    this.emit();
  }

  load(steps: SceneStep[]) {
    this.steps = steps;
    this.state.stepIndex = -1;
  }

  /** L'utilisateur a appuyé sur le bouton "continuer" */
  userConfirm() {
    if (this.state.isWaitingForUser) {
      this.patch({ isWaitingForUser: false });
    }
  }

  /** Mise à jour HUD depuis un sous-flux (face auth, recovery…) */
  patchHud(partial: Partial<Pick<OrchestratorState, 'hudText' | 'hudSubtext' | 'orbState' | 'avatarMode' | 'isSpeaking'>>) {
    this.patch(partial);
  }

  stop() {
    this.alive = false;
    this.stopFn();
    this.patch({ isRunning: false, isSpeaking: false });
  }

  async run() {
    this.alive = true;
    this.patch({ isRunning: true });

    for (let i = 0; i < this.steps.length; i++) {
      if (!this.alive) break;
      const step = this.steps[i];

      // 1. Entrer dans l'étape
      this.patch({
        stepIndex: i,
        currentStep: step,
        hudText: step.hudText,
        hudSubtext: step.hudSubtext ?? '',
        orbState: step.orbState,
        avatarMode: step.avatarMode,
        isSpeaking: false,
        isWaitingForUser: !!step.waitForUser,
      });

      step.onEnter?.();

      if (step.waitForAsync) {
        await step.waitForAsync();
        if (!this.alive) break;
      }

      // 3. Durée minimale ET voix en parallèle (skip si waitForAsync a déjà géré voix/progression)
      if (step.waitForAsync) {
        if (step.pauseAfter && step.pauseAfter > 0) {
          await new Promise(r => setTimeout(r, step.pauseAfter));
        }
        step.onComplete?.();
        continue;
      }

      const tasks: Promise<void>[] = [];

      if (step.minDuration && step.minDuration > 0) {
        tasks.push(new Promise(r => setTimeout(r, step.minDuration)));
      }

      if (step.voiceLine) {
        this.patch({ isSpeaking: true, avatarMode: 'speaking' });
        const voiceLine = step.voiceLine;
        const stepAvatarMode = step.avatarMode;
        const voiceTask = (async () => {
          if (this.ttsEnabled) {
            await this.speakFn(voiceLine, { rate: 0.92, pitch: 0.85 });
          } else {
            // Estimation durée sans TTS réel (~120ms/mot)
            const words = voiceLine.split(' ').length;
            await new Promise(r => setTimeout(r, Math.max(800, words * 120)));
          }
          if (this.alive) {
            this.patch({ isSpeaking: false, avatarMode: stepAvatarMode });
          }
        })();
        tasks.push(voiceTask);
      }

      if (tasks.length > 0) await Promise.all(tasks);
      if (!this.alive) break;

      // 4. Pause après
      if (step.pauseAfter && step.pauseAfter > 0) {
        await new Promise(r => setTimeout(r, step.pauseAfter));
      }
      if (!this.alive) break;

      // 5. Si waitForUser → attendre la confirmation APRÈS la voix/consigne
      if (step.waitForUser) {
        await new Promise<void>(resolve => {
          const unsub = this.subscribe(s => {
            if (!s.isWaitingForUser) { unsub(); resolve(); }
          });
        });
        if (!this.alive) break;
      }

      // 6. onComplete
      step.onComplete?.();
    }

    if (this.alive) {
      this.patch({ isRunning: false });
    }
  }
}
