/**
 * Politique produit par classe d'appareil.
 *
 * `device.ts` décide le budget perf (tier). Ici on décide l'expérience :
 * micro idle, caméra en veille, gestes, densité UI. Une seule source pour
 * AuthScene / GestureBridge / Settings / idle session.
 */
import { getDeviceProfile, type DeviceTier } from './device';

export type DevicePersona = 'phone' | 'tablet' | 'laptop' | 'desktop' | 'kiosk';

/** Maison (kiosque / mur) vs accès distant (téléphone / portable WAN). */
export type SessionSecurity = 'household' | 'remote';

export interface DevicePolicy {
  persona: DevicePersona;
  tier: DeviceTier;
  /** Micro prêt en permanence (wake) une fois autorisé. */
  micAlwaysReady: boolean;
  /** Caméra éteinte hors besoin explicite. */
  cameraSleepByDefault: boolean;
  /** Gestes autorisés sur ce persona (encore opt-in utilisateur). */
  gesturesAllowed: boolean;
  /** Boot cinéma / particules lourdes. */
  cinematicBoot: boolean;
  /** Densité panneaux (compact = mobile/tablet). */
  uiDensity: 'compact' | 'comfortable' | 'spacious';
  /** Auth : face suffit (pas de théâtre voix MFA). */
  authFactors: { face: boolean; voice: boolean; pin: boolean };
  /** Unlock session : face dès présence détectée, sinon invite. */
  unlock: {
    requireFaceInFrame: boolean;
    /** Phrase vocale obligatoire en plus du visage — false tant que speaker verify absent. */
    requireVoicePhrase: boolean;
  };
  /**
   * Sécurité de session :
   * - household : lock OK, pas de logout à la fermeture ; famille peut changer
   *   d’identité au déverrouillage. Enrôlement = admin seulement.
   * - remote : logout à la fermeture d’onglet + idle → déconnexion.
   */
  sessionSecurity: SessionSecurity;
  /** Minutes d’inactivité avant lock (household) ou logout (remote). 0 = off. */
  idleLockMinutes: number;
}

function detectPersona(): DevicePersona {
  if (typeof window === 'undefined') return 'desktop';
  const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const minSide = Math.min(w, h);
  const maxSide = Math.max(w, h);
  const ua = navigator.userAgent || '';

  // Kiosque / tablette murale maison
  try {
    if (new URLSearchParams(window.location.search).get('kiosk') === '1') return 'kiosk';
    if (new URLSearchParams(window.location.search).get('remote') === '1') {
      // remote forcé : on garde laptop pour la densité, la sécurité vient d’ailleurs
    }
    if (window.localStorage.getItem('jarvis_kiosk') === '1') return 'kiosk';
  } catch { /* */ }

  const isPhoneUa = /iPhone|Android.+Mobile|Windows Phone/i.test(ua);
  const isTabletUa = /iPad|Android(?!.+Mobile)|Tablet/i.test(ua);

  if (isPhoneUa || (coarse && maxSide < 900)) return 'phone';
  if (isTabletUa || (coarse && minSide >= 600 && maxSide < 1400)) return 'tablet';
  if (fine && maxSide < 1400) return 'laptop';
  return 'desktop';
}

const POLICY_BY_PERSONA: Record<DevicePersona, Omit<DevicePolicy, 'persona' | 'tier'>> = {
  phone: {
    micAlwaysReady: true,
    cameraSleepByDefault: true,
    gesturesAllowed: false,
    cinematicBoot: false,
    uiDensity: 'compact',
    authFactors: { face: false, voice: true, pin: false },
    unlock: { requireFaceInFrame: false, requireVoicePhrase: true },
    sessionSecurity: 'remote',
    idleLockMinutes: 10,
  },
  tablet: {
    micAlwaysReady: true,
    cameraSleepByDefault: true,
    // MediaPipe sur tablette = freeze fréquent (CPU/GPU). Opt-in via ?gestures=1.
    gesturesAllowed: false,
    cinematicBoot: false,
    uiDensity: 'comfortable',
    authFactors: { face: false, voice: true, pin: false },
    unlock: { requireFaceInFrame: false, requireVoicePhrase: true },
    // Tablette murale maison : lock, pas de logout à la fermeture.
    sessionSecurity: 'household',
    idleLockMinutes: 10,
  },
  laptop: {
    micAlwaysReady: true,
    cameraSleepByDefault: true,
    gesturesAllowed: true,
    cinematicBoot: false,
    uiDensity: 'comfortable',
    authFactors: { face: false, voice: true, pin: false },
    unlock: { requireFaceInFrame: false, requireVoicePhrase: true },
    sessionSecurity: 'remote',
    idleLockMinutes: 10,
  },
  desktop: {
    micAlwaysReady: true,
    cameraSleepByDefault: true,
    gesturesAllowed: true,
    cinematicBoot: false,
    uiDensity: 'spacious',
    authFactors: { face: false, voice: true, pin: false },
    unlock: { requireFaceInFrame: false, requireVoicePhrase: true },
    sessionSecurity: 'household',
    idleLockMinutes: 15,
  },
  kiosk: {
    micAlwaysReady: true,
    // TV salon : micro wake OK ; caméra OFF hors gestes explicites.
    cameraSleepByDefault: true,
    gesturesAllowed: false,
    cinematicBoot: false,
    uiDensity: 'spacious',
    authFactors: { face: false, voice: true, pin: false },
    unlock: { requireFaceInFrame: false, requireVoicePhrase: true },
    sessionSecurity: 'household',
    idleLockMinutes: 0, // écran allumé en permanence
  },
};

let cached: DevicePolicy | null = null;

export function getDevicePolicy(): DevicePolicy {
  if (!cached) {
    const persona = detectPersona();
    const tier = getDeviceProfile().tier;
    const base = { persona, tier, ...POLICY_BY_PERSONA[persona] };
    // Override explicite
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('remote') === '1' || window.localStorage.getItem('jarvis_remote') === '1') {
        base.sessionSecurity = 'remote';
        base.idleLockMinutes = base.idleLockMinutes || 10;
      }
      if (params.get('kiosk') === '1' || window.localStorage.getItem('jarvis_kiosk') === '1') {
        base.sessionSecurity = 'household';
      }
    } catch { /* */ }
    cached = base;
  }
  return cached;
}

export function resetDevicePolicy(): void {
  cached = null;
}

/**
 * Gestes Holomat / MediaPipe.
 * Priorité : `?gestures=0|1` → localStorage `jarvis_gestures` → persona.
 * Laptop/desktop : ON par défaut. Phone/tablet/kiosk : OFF (opt-in `?gestures=1`).
 */
export function gesturesPolicyEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const forced = new URLSearchParams(window.location.search).get('gestures');
  if (forced === '0' || forced === 'false') return false;
  if (forced === '1' || forced === 'true') return true;
  try {
    const stored = window.localStorage.getItem('jarvis_gestures');
    if (stored === '0') return false;
    if (stored === '1') return true;
  } catch { /* */ }
  return getDevicePolicy().gesturesAllowed;
}

/** Pose `data-persona` + densité CSS sur <html> (échelle TV 40″). */
export function applyDevicePolicyToDom(): void {
  if (typeof document === 'undefined') return;
  const p = getDevicePolicy();
  const root = document.documentElement;
  root.dataset.persona = p.persona;
  root.dataset.density = p.uiDensity;
  try {
    if (p.persona === 'kiosk') {
      window.localStorage.setItem('jarvis_kiosk', '1');
      // Forcer OFF même si une ancienne session avait activé les gestes.
      window.localStorage.setItem('jarvis_gestures', '0');
    }
  } catch { /* */ }
}
