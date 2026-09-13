/**
 * API toast minimale (style Sonner/Sileo) branchée sur NotificationSystem glass.
 *
 *   toast.success('Sauvé')
 *   toast.action({ title: 'Policy', message: '…', label: 'Ouvrir', app: 'reach' })
 *   await toast.promise(job, { loading: '…', success: '…', error: '…' })
 */
import { messagesFromPromiseOpts, resolveDurationMs } from './helpers';
import type { PromiseToastMessages, ToastInput, ToastRecord, ToastTone } from './types';

export type ToastHost = {
  push: (n: ToastInput) => string;
  patch: (id: string, n: Partial<ToastInput>) => void;
  dismiss: (id?: string) => void;
};

let host: ToastHost | null = null;

export function bindToastHost(next: ToastHost | null): void {
  host = next;
}

function requireHost(): ToastHost {
  if (!host) {
    throw new Error('toast: host non lié — AppProvider doit appeler bindToastHost');
  }
  return host;
}

function pushTone(type: ToastTone, title: string, message = ''): string {
  return requireHost().push({ type, title, message });
}

function normalizeActionInput(
  input: ToastInput & { label: string; onClick?: () => void; app?: string; intent?: string },
): ToastInput {
  const { label, onClick, app, intent, ...rest } = input;
  return {
    ...rest,
    type: rest.type ?? 'info',
    action: { label, onClick, app, intent },
    durationMs: rest.durationMs === undefined ? null : rest.durationMs,
  };
}

export const toast = {
  info: (title: string, message = '') => pushTone('info', title, message),
  success: (title: string, message = '') => pushTone('success', title, message),
  warning: (title: string, message = '') => pushTone('warning', title, message),
  error: (title: string, message = '') => pushTone('error', title, message),

  message: (input: ToastInput): string => requireHost().push(input),

  /** Toast sticky avec CTA (bouton). */
  action: (
    input: Omit<ToastInput, 'action' | 'type'> & {
      type?: ToastTone;
      label: string;
      onClick?: () => void;
      app?: string;
      intent?: string;
    },
  ): string => requireHost().push(normalizeActionInput({ type: 'info', ...input })),

  dismiss: (id?: string) => requireHost().dismiss(id),

  /** Met à jour un toast existant (promise Core pending → success/error). */
  update: (id: string, patch: Partial<ToastInput>): void => {
    requireHost().patch(id, patch);
  },

  /**
   * Affiche un toast `pending`, puis le remplace success/error à la résolution.
   * Retourne la même promesse (chaînable).
   */
  promise: <T>(promise: Promise<T>, opts: PromiseToastMessages<T>): Promise<T> => {
    const h = requireHost();
    const msgs = messagesFromPromiseOpts(opts);
    const loading: ToastInput = { ...msgs.loading, type: 'pending' };
    if (loading.durationMs === undefined) loading.durationMs = null;
    const id = h.push(loading);

    return promise.then(
      (value) => {
        const ok = msgs.success(value);
        const type = ok.type === 'pending' ? 'success' : ok.type;
        h.patch(id, {
          ...ok,
          type,
          durationMs: resolveDurationMs({ ...ok, type }),
          action: undefined,
        });
        return value;
      },
      (err: unknown) => {
        const fail = msgs.error(err);
        const type = fail.type === 'pending' ? 'error' : fail.type;
        h.patch(id, {
          ...fail,
          type,
          durationMs: resolveDurationMs({ ...fail, type }),
          action: undefined,
        });
        throw err;
      },
    );
  },
};

/** Pending Core `display_notification` — un toast par titre, patché à la fin. */
const pendingByTitle = new Map<string, string>();

export type CoreNotificationPayload = {
  message: string;
  level?: ToastTone;
  title?: string;
  action_label?: string;
  action_app?: string;
  action_intent?: string;
};

/** Applique un `display_notification` Core (pending sticky → update success/error/action). */
export function applyCoreNotification(payload: CoreNotificationPayload): string {
  const title = payload.title || 'JARVIS';
  const level = payload.level ?? 'info';
  const message = payload.message;

  if (level === 'pending') {
    const existing = pendingByTitle.get(title);
    if (existing) {
      toast.update(existing, { type: 'pending', title, message, durationMs: null, action: undefined });
      return existing;
    }
    const id = toast.message({ type: 'pending', title, message, durationMs: null });
    pendingByTitle.set(title, id);
    return id;
  }

  const pendingId = pendingByTitle.get(title);
  if (pendingId) {
    pendingByTitle.delete(title);
    const type: ToastTone = level === 'pending' ? 'success' : level;
    const action = payload.action_label
      ? {
          label: payload.action_label,
          app: payload.action_app,
          intent: payload.action_intent,
        }
      : undefined;
    toast.update(pendingId, {
      type,
      title,
      message,
      action,
      durationMs: action ? null : resolveDurationMs({ type, title, message, action }),
    });
    return pendingId;
  }

  if (payload.action_label) {
    return toast.action({
      type: level === 'pending' ? 'info' : level,
      title,
      message,
      label: payload.action_label,
      app: payload.action_app,
      intent: payload.action_intent,
    });
  }

  return toast[level === 'pending' ? 'info' : level](title, message);
}

export { asToastInput, resolveDurationMs } from './helpers';
export type { ToastInput, ToastRecord, ToastTone, PromiseToastMessages };
