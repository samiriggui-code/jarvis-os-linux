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

export { asToastInput, resolveDurationMs } from './helpers';
export type { ToastInput, ToastRecord, ToastTone, PromiseToastMessages };
