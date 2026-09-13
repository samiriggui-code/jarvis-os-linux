/** Toasts HUD — glass NotificationSystem, pas Sonner/Sileo. */

export type ToastTone = 'info' | 'warning' | 'success' | 'error' | 'pending';

export type ToastAction = {
  label: string;
  onClick?: () => void;
  /** Ouvre une app HUD (ex. `reach`) au clic. */
  app?: string;
  /** Intent Core optionnel (surface / policy). */
  intent?: string;
};

export type ToastInput = {
  type: ToastTone;
  title: string;
  message: string;
  /** `null` = sticky (pending / action). Défaut 6000. */
  durationMs?: number | null;
  action?: ToastAction;
};

export type ToastRecord = ToastInput & { id: string };

export type PromiseToastMessages<T> = {
  loading: ToastInput | string;
  success: ToastInput | string | ((value: T) => ToastInput | string);
  error: ToastInput | string | ((err: unknown) => ToastInput | string);
};
