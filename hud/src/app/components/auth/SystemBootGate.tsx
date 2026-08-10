/**
 * Checklist de boot système (HERMES / VOICE / FACE…) — pilotée par le Core.
 * Partagée AuthScene (login) et FirstSetupScene (premier démarrage).
 * Chrome Vision — glass + SF, plus de HUD cyber.
 */
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getCoreClient } from '../../bridge/coreClient';
import { getMediaState, tryPrimeCamera } from '../../bridge/mediaDevices';
import { GlassPanel } from '../../../components/glass/GlassPanel';
import { tokens } from '../../../ui/tokens';
import { visionBody, visionCaption, visionTitle } from '../visionChrome';
import { OrbSpatial } from './OrbSpatial';

export type BootCheckStatus = 'pending' | 'loading' | 'ok' | 'failed' | 'skipped';

export type BootCheck = {
  label: string;
  component: string;
  status: BootCheckStatus;
};

export const INITIAL_BOOT_CHECKS: BootCheck[] = [
  { label: 'Hermes Core', component: 'hermes', status: 'pending' },
  { label: 'Voice System', component: 'voice', status: 'pending' },
  { label: 'Face Recognition', component: 'face', status: 'pending' },
  { label: 'Holomat Vision', component: 'holomat', status: 'pending' },
  { label: 'User Database', component: 'users', status: 'pending' },
  { label: 'Agent Network', component: 'agents', status: 'pending' },
];

const CHECK_COLORS: Record<BootCheckStatus, string> = {
  ok: tokens.color.success,
  failed: tokens.color.danger,
  loading: tokens.color.accent,
  skipped: tokens.color.textMuted,
  pending: tokens.color.textMuted,
};

/** Checklist de boot déjà OK cette session navigateur — skip après soft-lock. */
export const BOOT_OK_KEY = 'jarvis_boot_ok';

export function markBootOk() {
  try {
    sessionStorage.setItem(BOOT_OK_KEY, '1');
  } catch {
    /* */
  }
}

export function isBootAlreadyOk(): boolean {
  try {
    return sessionStorage.getItem(BOOT_OK_KEY) === '1';
  } catch {
    return false;
  }
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

  if (isBootAlreadyOk()) {
    setChecks((prev) => prev.map((c) => ({ ...c, status: 'ok' as const })));
    setHudSubtext?.('Systèmes déjà vérifiés');
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
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
      setChecks((prev) => prev.map((c) => (c.component === component ? { ...c, status } : c)));
    };

    const handshake = setTimeout(() => {
      if (client.connected) {
        console.warn('[boot] timeout mais Core connecté — skip checklist');
        setChecks((prev) =>
          prev.map((c) =>
            c.status === 'pending' || c.status === 'loading'
              ? { ...c, status: 'skipped' as const }
              : c,
          ),
        );
        try {
          client.send({ type: 'boot', action: 'skip' });
        } catch {
          /* */
        }
        finish(null);
        return;
      }
      console.warn('[boot] aucun boot_state — Core injoignable');
      setCheckStatus('hermes', 'failed');
      finish('Noyau cognitif injoignable');
    }, 15_000);

    const unsubscribe = client.subscribe((data) => {
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
        degraded.forEach((ev) => setCheckStatus(ev.replace(/^boot_/, ''), 'failed'));
        setChecks((prev) =>
          prev.map((c) => (c.status === 'pending' ? { ...c, status: 'skipped' as const } : c)),
        );
        finish(data.ok === false ? 'Démarrage interrompu' : null);
      }
    });

    // Sonde caméra soft : pas de prompt forcé au boot (timeout 10s + refus
    // artificiel). Face/Holomat = modèles Core ; caméra device = plus tard au clic.
    void (async () => {
      try {
        const stream = await tryPrimeCamera();
        client.send({
          type: 'holomat',
          action: 'camera',
          ok: !!stream,
          error: stream ? undefined : getMediaState().cameraError || 'camera_pending_user_gesture',
        });
      } catch {
        /* hors chemin critique boot */
      }
    })();

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
  const accent = blocked ? tokens.color.danger : tokens.color.accent;

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center px-3 overflow-hidden"
      style={{
        height: '100%',
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        justifyContent: 'space-between',
        gap: 12,
      }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <header className="flex flex-col items-center shrink-0 pt-3" style={{ gap: 20 }}>
        <div
          className="flex items-center justify-center"
          style={{ width: 104, height: 104, overflow: 'visible', flexShrink: 0 }}
        >
          <OrbSpatial size={80} veille={!blocked} state={blocked ? 'idle' : 'listening'} />
        </div>
        <div className="text-center">
          <p
            style={{
              ...visionCaption,
              color: accent,
              fontSize: 12,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              margin: 0,
              fontWeight: 600,
            }}
          >
            JARVIS
          </p>
          <h1
            style={{
              ...visionTitle,
              color: tokens.color.text,
              fontSize: 'clamp(18px, 3.2vw, 24px)',
              margin: '10px 0 0',
              letterSpacing: '-0.02em',
            }}
          >
            Vérification système
          </h1>
          <motion.p
            style={{ ...visionBody, color: accent, fontSize: 12, marginTop: 8 }}
            animate={blocked ? { opacity: 1 } : { opacity: [0.55, 1, 0.55] }}
            transition={blocked ? { duration: 0 } : { duration: 1.8, repeat: Infinity }}
          >
            {msg}
          </motion.p>
        </div>
      </header>

      <GlassPanel
        level="regular"
        radius="md"
        padding="sm"
        className="w-full"
        style={{ maxWidth: 360, flex: '0 1 auto' }}
      >
        <p style={{ ...visionCaption, color: accent, marginBottom: 6, fontSize: 10 }}>Contrôles</p>

        <div className="flex flex-col gap-1 w-full">
          {checks.map((c) => (
            <div
              key={c.label}
              className="flex items-center gap-2"
              style={{
                padding: '5px 8px',
                borderRadius: tokens.radius.sm,
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${tokens.color.border}`,
              }}
            >
              <div className="w-4 flex items-center justify-center flex-shrink-0">
                {c.status === 'ok' && (
                  <span style={{ color: CHECK_COLORS.ok, fontSize: 11 }}>✓</span>
                )}
                {c.status === 'failed' && (
                  <span style={{ color: CHECK_COLORS.failed, fontSize: 11 }}>✕</span>
                )}
                {c.status === 'loading' && (
                  <motion.span
                    style={{ color: CHECK_COLORS.loading, fontSize: 11 }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  >
                    ●
                  </motion.span>
                )}
                {c.status === 'skipped' && (
                  <span style={{ color: CHECK_COLORS.skipped, fontSize: 11 }}>–</span>
                )}
                {c.status === 'pending' && (
                  <span style={{ color: tokens.color.textMuted, fontSize: 11, opacity: 0.5 }}>·</span>
                )}
              </div>
              <span style={{ ...visionBody, fontSize: 12, color: CHECK_COLORS[c.status], flex: 1 }}>
                {c.label}
              </span>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.p
            key={subtext}
            style={{ ...visionBody, fontSize: 11, textAlign: 'center', marginTop: 8 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {subtext}
          </motion.p>
        </AnimatePresence>

        {blocked && footer ? <div style={{ marginTop: 8 }}>{footer}</div> : null}
      </GlassPanel>

      <div className="shrink-0" style={{ height: 24 }} aria-hidden />
    </motion.div>
  );
}
