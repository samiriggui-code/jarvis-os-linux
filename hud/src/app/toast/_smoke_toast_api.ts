/**
 * Smoke — API toast (helpers purs + bus mémoire).
 *
 *   npx --yes tsx src/app/toast/_smoke_toast_api.ts
 */
import {
  asToastInput,
  bindToastHost,
  messagesFromPromiseOpts,
  resolveDurationMs,
  resolvePromiseToast,
  toast,
  applyCoreNotification,
  type ToastRecord,
} from './index';

function check(label: string, cond: boolean): void {
  console.log(`  [${cond ? 'OK' : 'FAIL'}] ${label}`);
  if (!cond) throw new Error(`FAIL: ${label}`);
}

function installMemoryHost(): { records: ToastRecord[] } {
  const records: ToastRecord[] = [];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  bindToastHost({
    push: (n) => {
      const id = `t${records.length + 1}`;
      const durationMs = resolveDurationMs(n);
      const rec: ToastRecord = { ...n, id, durationMs };
      records.push(rec);
      if (durationMs != null) {
        timers.set(
          id,
          setTimeout(() => {
            const i = records.findIndex((r) => r.id === id);
            if (i >= 0) records.splice(i, 1);
          }, durationMs),
        );
      }
      return id;
    },
    patch: (id, patch) => {
      const i = records.findIndex((r) => r.id === id);
      if (i < 0) return;
      const prev = records[i]!;
      const next: ToastRecord = { ...prev, ...patch, id };
      next.durationMs = resolveDurationMs(next);
      records[i] = next;
      const old = timers.get(id);
      if (old) clearTimeout(old);
      if (next.durationMs != null) {
        timers.set(
          id,
          setTimeout(() => {
            const j = records.findIndex((r) => r.id === id);
            if (j >= 0) records.splice(j, 1);
          }, next.durationMs),
        );
      }
    },
    dismiss: (id) => {
      if (!id) {
        records.length = 0;
        return;
      }
      const i = records.findIndex((r) => r.id === id);
      if (i >= 0) records.splice(i, 1);
    },
  });

  return { records };
}

async function main(): Promise<void> {
  console.log('=== smoke toast API ===');

  check('string → ToastInput', asToastInput('hello', 'success').title === 'hello');
  check('pending sticky', resolveDurationMs({ type: 'pending', title: 'x', message: '' }) === null);
  check(
    'action sticky défaut',
    resolveDurationMs({
      type: 'info',
      title: 'x',
      message: '',
      action: { label: 'Go' },
    }) === null,
  );
  check('success 6s', resolveDurationMs({ type: 'success', title: 'x', message: '' }) === 6000);

  const msgs = messagesFromPromiseOpts({
    loading: 'Recherche…',
    success: (v: string) => `OK ${v}`,
    error: 'échec',
  });
  check('loading title', msgs.loading.title === 'Recherche…');
  check('success fn', resolvePromiseToast((v: number) => `n=${v}`, 3, 'success').title === 'n=3');

  const { records } = installMemoryHost();
  toast.success('Sauvé', 'prefs');
  check('success push', records[0]?.type === 'success' && records[0]?.title === 'Sauvé');

  toast.action({ title: 'Policy', message: 'Confirmer ?', label: 'Ouvrir', app: 'reach' });
  const act = records.find((r) => r.action?.label === 'Ouvrir');
  check('action push', Boolean(act?.action?.app === 'reach' && act.durationMs === null));

  const p = toast.promise(Promise.resolve('météo'), {
    loading: { type: 'pending', title: 'Recherche', message: '…' },
    success: (v) => ({ type: 'success', title: 'Recherche', message: String(v) }),
    error: 'fail',
  });
  check('promise loading visible', records.some((r) => r.type === 'pending'));
  await p;
  const done = records.find((r) => r.title === 'Recherche' && r.type === 'success');
  check('promise → success', done?.message === 'météo');

  try {
    await toast.promise(Promise.reject(new Error('boom')), {
      loading: '…',
      success: 'ok',
      error: (e) => ({
        type: 'error',
        title: 'Erreur',
        message: e instanceof Error ? e.message : 'x',
      }),
    });
    check('promise reject devrait throw', false);
  } catch {
    check('promise → error', records.some((r) => r.type === 'error' && r.message === 'boom'));
  }


  // Core pending → success/action (même titre)
  applyCoreNotification({ title: 'Web', message: 'météo…', level: 'pending' });
  check('core pending sticky', records.some((r) => r.type === 'pending' && r.title === 'Web'));
  applyCoreNotification({
    title: 'Web',
    message: 'Il fera beau.',
    level: 'success',
    action_label: 'Ouvrir',
    action_app: 'reach',
  });
  const coreDone = records.find((r) => r.title === 'Web' && r.type === 'success');
  check('core pending patché success', Boolean(coreDone?.action?.app === 'reach'));
  check('un seul toast Web', records.filter((r) => r.title === 'Web').length === 1);

  bindToastHost(null);
  console.log('=== ALL PASS ===');
}

void main();
