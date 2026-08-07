/**
 * Device 1 — satellite HUD (navigateur) → DeviceRegistry Core.
 *
 * WS open : device.register + device.capabilities + heartbeat.
 * Discovery only — pas d'action, pas de Tool Router.
 *
 * Identité :
 *   device_id = UUID persisté (localStorage) — identité réelle
 *   label     = décoratif (localStorage / persona)
 * Debug : `?device_id=` / `?device_label=` (override session, sans écraser l'UUID).
 */
import { getDevicePolicy } from '../../ui/core/devicePolicy';

const ID_KEY = 'jarvis_device_id';
const LABEL_KEY = 'jarvis_device_label';
const HEARTBEAT_MS = 45_000;

export type HudCapability = {
  name?: string;
  capability_id: string;
  value: boolean;
  metadata?: Record<string, unknown>;
};

export type DeviceSend = (payload: Record<string, unknown>) => boolean;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let announcedId: string | null = null;

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function newDeviceUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* */ }
  return `hud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** True si la valeur ressemble à un UUID (v4-ish) déjà persisté. */
function looksLikePersistentId(id: string): boolean {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return true;
  }
  // Anciens slugs persona (pc-portable…) : on migre vers UUID une fois.
  return id.startsWith('hud-');
}

/**
 * Identifiant satellite stable (pas un user_id).
 * Priorité : `?device_id=` (debug, session) → UUID localStorage → générer.
 */
export function resolveHudDeviceId(): string {
  if (typeof window === 'undefined') return 'web-hud-ssr';

  try {
    const q = new URLSearchParams(window.location.search).get('device_id');
    if (q && q.trim()) {
      // Debug only — n'écrase pas l'UUID persisté.
      return slug(q.trim()) || q.trim();
    }
  } catch { /* */ }

  try {
    const stored = window.localStorage.getItem(ID_KEY);
    if (stored && stored.trim() && looksLikePersistentId(stored.trim())) {
      return stored.trim();
    }
    // Migration : ancien slug persona → nouveau UUID.
  } catch { /* */ }

  const id = newDeviceUuid();
  try { window.localStorage.setItem(ID_KEY, id); } catch { /* */ }
  return id;
}

/** Label humain décoratif — jamais utilisé pour décider. */
export function resolveHudDeviceLabel(): string {
  if (typeof window === 'undefined') return 'Navigateur HUD';
  try {
    const q = new URLSearchParams(window.location.search).get('device_label');
    if (q && q.trim()) {
      window.localStorage.setItem(LABEL_KEY, q.trim());
      return q.trim();
    }
    const stored = window.localStorage.getItem(LABEL_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch { /* */ }

  const persona = getDevicePolicy().persona;
  if (persona === 'kiosk') return 'Kiosk HUD';
  if (persona === 'phone') return 'Téléphone HUD';
  if (persona === 'tablet') return 'Tablette HUD';
  if (persona === 'desktop') return 'Desktop HUD';
  return 'Portable HUD';
}

/**
 * Capacités navigateur confirmées uniquement.
 * Inconnu → omis (pas de false forcé, pas de sur-déclaration).
 * Pas de getUserMedia forcé (pas de prompt permission).
 */
export async function probeBrowserCapabilities(): Promise<HudCapability[]> {
  const out: HudCapability[] = [];
  if (typeof navigator === 'undefined') return out;

  let list: MediaDeviceInfo[] = [];
  try {
    if (navigator.mediaDevices?.enumerateDevices) {
      list = await navigator.mediaDevices.enumerateDevices();
    }
  } catch {
    // API absente / refusée — on n'invente rien.
  }

  if (list.some((d) => d.kind === 'videoinput')) {
    out.push({ name: 'camera', capability_id: 'camera.capture', value: true });
  }
  if (list.some((d) => d.kind === 'audioinput')) {
    out.push({ name: 'audio', capability_id: 'audio.input', value: true });
  }
  if (list.some((d) => d.kind === 'audiooutput')) {
    out.push({ name: 'audio', capability_id: 'audio.output', value: true });
  } else if (typeof Audio !== 'undefined') {
    // Sortie HTMLAudio / TTS détectable via l'API Audio.
    out.push({ name: 'audio', capability_id: 'audio.output', value: true });
  }

  if (typeof window !== 'undefined' && window.screen && Number(window.screen.width) > 0) {
    out.push({ name: 'display', capability_id: 'display.screen', value: true });
  }

  const touch =
    Number(navigator.maxTouchPoints) > 0
    || (typeof window !== 'undefined' && 'ontouchstart' in window);
  if (touch) {
    out.push({ name: 'touch', capability_id: 'touch.input', value: true });
  }

  return out;
}

export function stopHudDeviceHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  announcedId = null;
}

export function startHudDeviceHeartbeat(send: DeviceSend, deviceId: string): void {
  stopHudDeviceHeartbeat();
  announcedId = deviceId;
  heartbeatTimer = setInterval(() => {
    if (!announcedId) return;
    send({
      type: 'device',
      action: 'heartbeat',
      device_id: announcedId,
      timestamp: Date.now() / 1000,
    });
  }, HEARTBEAT_MS);
}

/** register + capabilities ; démarre le heartbeat. */
export async function announceHudDevice(send: DeviceSend): Promise<string> {
  const device_id = resolveHudDeviceId();
  const label = resolveHudDeviceLabel();
  const persona = typeof window !== 'undefined' ? getDevicePolicy().persona : 'laptop';

  // `type` = enveloppe WS (ROUTES). Classe machine = `device_type` (évite collision).
  send({
    type: 'device',
    action: 'register',
    device_id,
    device_type: 'pc_client',
    runtime_kind: 'web_hud',
    label,
    metadata: {
      label,
      persona,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 180) : '',
      source: 'hud-device-1',
    },
  });

  const capabilities = await probeBrowserCapabilities();
  send({
    type: 'device',
    action: 'capabilities',
    device_id,
    capabilities,
  });

  startHudDeviceHeartbeat(send, device_id);
  console.info(
    '[device] announced',
    device_id,
    label,
    capabilities.map((c) => c.capability_id),
  );
  return device_id;
}
