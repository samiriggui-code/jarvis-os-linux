/**
 * Checklist de boot système (HERMES / VOICE / FACE…) — pilotée par le Core.
 * Partagée AuthScene (login) et FirstSetupScene (premier démarrage).
 */
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Orb } from '../orb';
import { getCoreClient } from '../../bridge/coreClient';
import { withCamera, getMediaState } from '../../bridge/mediaDevices';

const orbF = { fontFamily: 'Orbitron, sans-serif' } as const;
const mono = { fontFamily: 'Share Tech Mono, monospace' } as const;

export type BootCheckStatus = 'pending' | 'loading' | 'ok' | 'failed' | 'skipped';

export type BootCheck = {
  label: string;
  component: string;
  status: BootCheckStatus;
};

export const INITIAL_BOOT_CHECKS: BootCheck[] = [
  { label: 'HERMES CORE', component: 'hermes', status: 'pending' },
  { label: 'VOICE SYSTEM', component: 'voice', status: 'pending' },
  { label: 'FACE RECOGNITION', component: 'face', status: 'pending' },
  { label: 'HOLOMAT VISION', component: 'holomat', status: 'pending' },
  { label: 'USER DATABASE', component: 'users', status: 'pending' },
  { label: 'AGENT NETWORK', component: 'agents', status: 'pending' },
];

const CHECK_COLORS: Record<BootCheckStatus, string> = {
  ok: '#22c55e',
  failed: '#ef4444',
  loading: '#00e5ff',
  skipped: 'rgba(255,255,255,0.18)',
  pending: 'rgba(255,255,255,0.25)',
};

/** Checklist de boot déjà OK cette session navigateur — skip après soft-lock. */
export const BOOT_OK_KEY = 'jarvis_boot_ok';

export function markBootOk() {
  try { sessionStorage.setItem(BOOT_OK_KEY, '1'); } catch { /* */ }
}

export function isBootAlreadyOk(): boolean {
  try { return sessionStorage.getItem(BOOT_OK_KEY) === '1'; } catch { return false; }
}


export function mapComponentState(state: string): BootCheckStatus {
  if (state === 'ready') return 'ok';
  if (state === 'loading' || state === 'unknown') return 'loading';
  if (state === 'degraded' || state === 'offline' || state === 'error') return 'failed';
  return 'pending';
}

/**
 * Attend `boot_state` du Core (start → end). Lance aussi la sonde caméra Holomat.
 * Retourne un message d'erreur si le boot est bloqué, sinon null.
 */
export function runSystemBootGate(opts: {
  setChecks: React.Dispatch<React.SetStateAction<BootCheck[]>>;
  setHudSubtext?: (s: string) => void;
  onBlocked?: (msg: string) => void;
}): Promise<string | null> {
  const { setChecks, setHudSubtext, onBlocked } = opts;

  // Soft-lock / refresh : ne pas rejouer le boot système (écran figé).
  if (isBootAlreadyOk()) {
    setChecks(prev => prev.map(c => ({ ...c, status: 'ok' as const })));
    setHudSubtext?.('Systèmes déjà vérifiés');
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    const client = getCoreClient();
    let settled = false;
    const finish = (blocked: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(handshake);
      unsubscribe();
      if (blocked) onBlocked?.(blocked);
      else markBootOk();
      resolve(blocked);
    };

    const setCheckStatus = (component: string, status: BootCheckStatus) => {
      setChecks(prev => prev.map(c => (c.component === component ? { ...c, status } : c)));
    };

    const handshake = setTimeout(() => {
      if (client.connected) {
        console.warn('[boot] timeout mais Core connecté — skip checklist');
        setChecks(prev =>
          prev.map(c =>
            c.status === 'pending' || c.status === 'loading'
              ? { ...c, status: 'skipped' as const }
              : c,
          ),
        );
        try { client.send({ type: 'boot', action: 'skip' }); } catch { /* */ }
        finish(null);
        return;
      }
      console.warn('[boot] aucun boot_state — Core injoignable');
      setCheckStatus('hermes', 'failed');
      finish('NOYAU COGNITIF INJOIGNABLE');
    }, 15_000);

    const unsubscribe = client.subscribe(data => {
      if (data.type === 'component_state') {
        const comp = String(data.component ?? '');
        const st = mapComponentState(String(data.state ?? ''));
        setCheckStatus(comp, st);
        return;
      }
      if (data.type !== 'boot_state') return;

      if (data.phase === 'start') {
        clearTimeout(handshake);
        setHudSubtext?.('Vérification des systèmes');
        return;
      }

      if (data.phase === 'end') {
        const degraded = Array.isArray(data.degraded) ? (data.degraded as string[]) : [];
        degraded.forEach(ev => setCheckStatus(ev.replace(/^boot_/, ''), 'failed'));
        setChecks(prev =>
          prev.map(c => (c.status === 'pending' ? { ...c, status: 'skipped' as const } : c)),
        );
        finish(data.ok === false ? 'DÉMARRAGE INTERROMPU' : null);
        if (data.ok !== false) markBootOk();
      }
    });

    void withCamera('auth', async stream => {
      client.send({
        type: 'holomat',
        action: 'camera',
        ok: !!stream,
        error: stream ? undefined : getMediaState().cameraError,
      });
    });

    // Relance l'annonce si la cinématique / BootGate l'a déjà envoyée trop tôt
    // ou si on arrive via first_setup sans OrbVoyage.
    try {
      client.send({ type: 'boot', action: 'announce' });
    } catch {
      /* */
    }
  });
}

export function SystemBootOverlay({
  checks,
  msg,
  subtext,
  blocked,
  footer,
}: {
  checks: BootCheck[];
  msg: string;
  subtext: string;
  blocked: boolean;
  footer?: React.ReactNode;
}) {
  const accent = blocked ? '#ef4444' : '#00e5ff';
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-start gap-4 px-8 z-10 overflow-y-auto"
      style={{ background: '#020509', paddingTop: 'min(10vh, 72px)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div style={{ width: 88, height: 88, marginBottom: 8 }}>
        <Orb state={blocked ? 'idle' : 'thinking'} volume={blocked ? 0.05 : 0.4} playbackVolume={0} />
      </div>

      <motion.p
        style={{ ...orbF, color: accent, fontSize: 11, letterSpacing: '0.4em', textShadow: `0 0 16px ${accent}88` }}
        animate={blocked ? { opacity: 1 } : { opacity: [0.4, 1, 0.4] }}
        transition={blocked ? { duration: 0 } : { duration: 1.4, repeat: Infinity }}
      >
        {msg}
      </motion.p>

      <div className="flex flex-col gap-1.5 w-full max-w-xs">
        {checks.map(c => (
          <div key={c.label} className="flex items-center gap-2.5">
            <div className="w-4 flex items-center justify-center flex-shrink-0">
              {c.status === 'ok' && <span style={{ color: CHECK_COLORS.ok, fontSize: 10 }}>✓</span>}
              {c.status === 'failed' && <span style={{ color: CHECK_COLORS.failed, fontSize: 10 }}>✕</span>}
              {c.status === 'loading' && (
                <motion.span
                  style={{ color: CHECK_COLORS.loading, fontSize: 10 }}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                >
                  ▸
                </motion.span>
              )}
              {c.status === 'skipped' && <span style={{ color: CHECK_COLORS.skipped, fontSize: 10 }}>–</span>}
              {c.status === 'pending' && <span style={{ color: 'rgba(0,229,255,0.2)', fontSize: 10 }}>·</span>}
            </div>
            <span style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: CHECK_COLORS[c.status] }}>
              {c.label}
            </span>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={subtext}
          style={{ ...mono, color: 'rgba(255,255,255,0.5)', fontSize: 10, textAlign: 'center', letterSpacing: '0.06em' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {subtext}
        </motion.p>
      </AnimatePresence>

      {blocked && footer}
    </motion.div>
  );
}
