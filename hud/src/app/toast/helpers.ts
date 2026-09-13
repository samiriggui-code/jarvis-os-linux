import type { PromiseToastMessages, ToastInput, ToastTone } from './types';

/** Normalise `string | ToastInput` vers un ToastInput typé. */
export function asToastInput(
  value: ToastInput | string,
  fallbackType: ToastTone = 'info',
): ToastInput {
  if (typeof value === 'string') {
    return { type: fallbackType, title: value, message: '' };
  }
  return value;
}

export function resolvePromiseToast<T>(
  template: ToastInput | string | ((value: T) => ToastInput | string),
  value: T,
  fallbackType: ToastTone,
): ToastInput {
  const raw = typeof template === 'function' ? template(value) : template;
  return asToastInput(raw, fallbackType);
}

/** Sticky si pending / action sans durée explicite. */
export function resolveDurationMs(input: ToastInput): number | null {
  if (input.durationMs !== undefined) return input.durationMs;
  if (input.type === 'pending') return null;
  if (input.action || input.secondaryAction) return null;
  return 6000;
}

export function messagesFromPromiseOpts<T>(
  opts: PromiseToastMessages<T>,
): { loading: ToastInput; success: (v: T) => ToastInput; error: (e: unknown) => ToastInput } {
  return {
    loading: asToastInput(opts.loading, 'pending'),
    success: (v) => resolvePromiseToast(opts.success, v, 'success'),
    error: (e) => resolvePromiseToast(opts.error, e, 'error'),
  };
}
