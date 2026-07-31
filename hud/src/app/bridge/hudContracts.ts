/**
 * Contrats HUD ↔ Core — préparation branchement (pas encore câblé).
 *
 * Sources :
 * - vendor/refs/jarvis_ai  → voix, chat, approvals, summon_panel, orb states
 * - vendor/vision/Holomat  → caméra, calibration, gestes, identité multi-facteurs (§6.8)
 *
 * Le SettingsPanel ne fait qu'éditer des *préférences expérience*.
 * Admin (clés API, providers, Policy) → Dashboard (figma2), jamais ici.
 */

/** États orbe — alignés cahier §3.2 / jarvis_ai agent_status */
export type OrbState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'tool_call'
  | 'speaking'
  | 'gesture'
  | 'error';

/** États scène Auth — cahier §10.1 */
export type AuthSceneState =
  | 'boot'
  | 'identification'
  | 'face_auth'
  | 'voice_auth'
  | 'gesture_auth'
  | 'authenticated';

export type UserRole = 'admin' | 'user' | 'child' | 'guest';
/** Tons Personality Manager — cahier §13.10 */
export type DialogueTone = 'neutral' | 'human' | 'technical' | 'cinematic' | 'security_alert' | 'silent';

export type DialogueSecurityLevel = 'public' | 'auth' | 'elevated' | 'admin' | 'alert';

/** Paramètres TTS imposés par Dialogue / Voice Manager — cahier §3.4 */
export interface JarvisVoiceParams {
  /** Vitesse typique 0.90–0.95 */
  rate?: number;
  /** Style exécutif calme */
  style?: 'executive' | 'cinematic' | 'alert' | 'whisper';
  pause_ms?: number;
  /** Provider derrière jarvis-voice — HUD ne choisit pas */
  engine?: 'piper' | 'elevenlabs' | 'xtts' | 'voicebox' | 'other';
}

/** Voix résolue par le Voice Manager pour cet utilisateur (§3.4) */
export interface ResolvedVoice {
  /** Profil voicebox (nom ou id) */
  profile: string;
  /** Moteur voicebox — luxtts pour le live, qwen pour le clonage */
  engine: string;
  language: string;
  preset: 'jarvis_fr' | 'jarvis_en' | 'jarvis_soft';
  enabled: boolean;
  personality?: boolean;
}

/** Pourquoi le Core n'a pas pu synthétiser — le HUD parle en secours */
export type TtsFallbackReason =
  | 'voicebox_unavailable'
  | 'voicebox_error'
  | 'model_downloading'
  | 'no_profile'
  | 'no_voice_selection'
  | 'voice_module_unavailable'
  | 'internal_error';

/** État d'une brique, tel que le superviseur le voit */
export type ComponentState = 'unknown' | 'loading' | 'ready' | 'degraded';

export interface SupervisedComponent {
  name: string;
  state: ComponentState;
  error?: string | null;
  critical?: boolean;
  failures?: number;
  checks?: number;
  transitions?: number;
  interval_s?: number;
  /** Secondes depuis le dernier succès — null si jamais vu vivant */
  age_s?: number | null;
}

/** Overlay Auth immersif (texte HUD, pas TTS) */
export type AuthHudOverlay =
  | 'boot_auth_sequence'
  | 'face_scan_active'
  | 'voice_channel'
  | 'gesture_prompt'
  | 'auth_fusion'
  | 'access_granted'
  | 'access_denied'
  | 'command_center';

/** Events Core → HUD (à brancher via WebSocket) */
export type CoreToHudEvent =
  | { type: 'set_orb_state'; state: OrbState; message?: string }
  | { type: 'set_auth_state'; state: AuthSceneState; message?: string }
  | { type: 'partial_transcript'; text: string }
  | { type: 'transcript'; text: string }
  | { type: 'agent_status'; state: 'thinking' | 'tool_use' | 'speaking' | 'stopped'; tool?: string; preview?: string }
  | { type: 'approval_request'; run_id: string; approval_id: string; preview: string }
  | { type: 'summon_panel'; media: 'video' | 'iframe' | 'image'; src: string; title: string; position?: 'center' | 'left' | 'right' }
  | { type: 'dismiss_panels' }
  | { type: 'display_notification'; message: string; level?: 'info' | 'success' | 'warning' | 'error' }
  | {
      type: 'dialogue_line';
      event: string;
      text: string;
      voice?: string;
      tone?: DialogueTone;
      security_level?: DialogueSecurityLevel;
      user_role?: UserRole;
      face_animation?: string;
      orb_state?: OrbState;
      holo_sfx?: string;
      hud_overlay?: AuthHudOverlay;
      voice_params?: JarvisVoiceParams;
      lip_sync?: 'idle' | 'speaking' | 'viseme_stream';
      interruptible?: boolean;
    }
  | {
      type: 'lip_sync_frame';
      /** Visème courant (A, E, O, closed…) — généré par Voice Manager */
      viseme: string;
      intensity?: number;
      t_ms?: number;
    }
  | { type: 'voice_playback'; phase: 'start' | 'end'; utterance_id?: string; speaking?: string | null }
  /** WAV synthétisé par voicebox — le HUD le joue et rend compte (§3.4) */
  | {
      type: 'tts_audio';
      utterance_id: string;
      format: 'wav';
      audio_b64: string;
      bytes: number;
      text: string;
      user_id?: string;
      voice: ResolvedVoice;
      synth_ms?: number;
      estimated_ms?: number;
      interruptible?: boolean;
    }
  | {
      type: 'tts_fallback';
      utterance_id: string | null;
      text: string;
      reason: TtsFallbackReason;
      detail?: string | null;
      language?: string;
      estimated_ms?: number;
      interruptible?: boolean;
    }
  | { type: 'tts_skipped'; utterance_id: string; reason: 'empty' | 'tts_disabled' | 'cancelled' }
  | { type: 'tts_cancel'; utterance_id: string | null }
  | {
      type: 'voice_status';
      url: string;
      /** null = pas encore sondé (la sonde tourne après serve()) */
      available: boolean | null;
      backend?: string | null;
      error?: string | null;
      speaking?: string | null;
      engine_default?: string;
      profiles?: Array<{ id: string; name: string }>;
      resolved?: ResolvedVoice;
    }
  | { type: 'voice_transcript'; ok: boolean; text?: string; duration?: number; error?: string; reason?: string }
  | { type: 'voice_error'; error: string }
  /**
   * État d'une brique au fil du boot — pas d'écran mort.
   * Émis **uniquement sur transition** : ce n'est pas un heartbeat. Pour
   * l'état courant, demander `{ type:'supervisor', action:'status' }`.
   */
  | {
      type: 'component_state';
      component: string;
      state: ComponentState;
      previous?: ComponentState;
      error?: string | null;
      failures?: number;
      interval_s?: number;
    }
  | {
      type: 'supervisor_status';
      ok: boolean;
      degraded: string[];
      watchdog?: { enabled: boolean; interval_s: number };
      components: SupervisedComponent[];
      error?: string;
    }
  | { type: 'holomat_status'; camera: 'ok' | 'missing' | 'error'; calibrated: boolean; hand?: 'left' | 'right' | null }
  | { type: 'gesture_detected'; gestureId: string; confidence: number }
  | { type: 'session_auth'; phase: 'locked' | 'probing' | 'unlocked' | 'denied'; factors: SessionAuthFactors; confidence: number }
  | {
      type: 'auth_progress';
      stage: 'face_scan' | 'voice_scan' | 'gesture' | 'profile_load';
      progress: number;
      message: string;
    }
  | {
      type: 'face_hologram';
      progress: number;
      confidence: number;
      phase: 'waiting' | 'camera_on' | 'reconstruction' | 'success' | 'deconstruct' | 'obstruction' | 'recovery' | 'locked';
      obstruction?: boolean;
      obstructionZone?: 'eyes' | 'mouth' | 'full';
      retry?: number;
      recoverySecondsLeft?: number;
    }
  | { type: 'face_auth_failed'; reason: 'low_confidence' | 'obstruction' | 'motion' | 'timeout' }
  | { type: 'face_auth_success'; confidence: number }
  | {
      type: 'user_authenticated';
      user: string;
      role: UserRole;
      face_confidence?: number;
      voice_verified?: boolean;
      gesture_verified?: boolean;
      permissions?: string[];
    };

/** Events HUD → Core */
export type HudToCoreEvent =
  | { type: 'ping' }
  | { type: 'user_event'; event: 'chat'; text: string }
  | { type: 'voice_start'; sample_rate: 16000; format: 'pcm_s16le'; channels: 1 }
  | { type: 'voice_stop' }
  | { type: 'stop_run' }
  | { type: 'approval_decision'; run_id: string; approval_id: string; decision: 'allow' | 'deny' }
  | { type: 'holomat_calibrate_start' }
  | { type: 'holomat_calibrate_abort' }
  /** Le HUD signale le vrai début/fin du son → l'orbe suit l'audio réel */
  | { type: 'voice'; action: 'playback'; phase: 'start' | 'end'; utterance_id: string | null }
  | { type: 'voice'; action: 'status'; probe?: boolean }
  | { type: 'voice'; action: 'speak'; text: string; language?: string; preset?: string }
  | { type: 'voice'; action: 'cancel' }
  | { type: 'voice'; action: 'transcribe'; audio_b64: string; filename?: string; language?: string }
  | { type: 'voice'; action: 'save_profile'; voice: Partial<ResolvedVoice>; user_id?: string }
  /** `check` force une sonde immédiate au lieu d'attendre le prochain tick */
  | { type: 'supervisor'; action: 'status' | 'check' }
  | { type: 'save_hud_preferences'; prefs: HudExperiencePreferences }
  | { type: 'save_gesture_profile'; profile: GestureProfile };

/** Facteurs d'auth session — jamais « visage seul = accès total » (§6.8) */
export interface SessionAuthFactors {
  face: boolean;
  voice: boolean;
  gesture: boolean;
  pin?: boolean;
}

export interface GestureBinding {
  id: string;
  label: string;
  action: string;
  enabled: boolean;
}

export interface GestureProfile {
  userId: string;
  dominantHand: 'left' | 'right';
  sensitivity: number; // 0–1
  bindings: GestureBinding[];
}

export interface HudExperiencePreferences {
  userId: string;
  displayName: string;
  assistantName: string;
  /** Préférences UI locales — pas le Provider Manager */
  themeAccent?: string;
  orbPosition: 'center' | 'free';
  showTranscript: boolean;
  cinematicBoot: boolean;
  bargeIn: boolean;
  /**
   * Locale / bilinguisme — chargé après face+voix (Hermes adapte TTS + réponses).
   * mode: mirror = langue de l’énoncé · preferred = toujours profil · sticky = override « passe en anglais »
   */
  locale: {
    preferredLanguage: 'fr' | 'en';
    secondaryLanguages: Array<'fr' | 'en'>;
    mode: 'mirror' | 'preferred' | 'sticky';
    /** Override temporaire (sticky) — null = suivre mode */
    stickyLanguage: 'fr' | 'en' | null;
    /** Preset TTS : jarvis_fr | jarvis_en | jarvis_soft (enfant) */
    voicePreset: 'jarvis_fr' | 'jarvis_en' | 'jarvis_soft';
    /** Id Holomat face (ex. samir_001) */
    faceId: string | null;
  };
  voice: {
    enabled: boolean;
    wakeWord: boolean;
    micDeviceId: string | null;
    outputDeviceId: string | null;
    ttsEnabled: boolean;
  };
  vision: {
    cameraDeviceId: string | null;
    holomatEnabled: boolean;
    /** Déverrouillage session multi-facteurs (Holomat + voix) */
    sessionUnlock: {
      enabled: boolean;
      requireFace: boolean;
      requireVoice: boolean;
      requireGesture: boolean;
      minConfidence: number; // 0–1
    };
  };
  killSwitch: {
    micMuted: boolean;
    cameraOff: boolean;
  };
}

export const DEFAULT_GESTURE_BINDINGS: GestureBinding[] = [
  { id: 'swipe_right', label: 'Balayage droite', action: 'next_panel', enabled: true },
  { id: 'swipe_left', label: 'Balayage gauche', action: 'prev_panel', enabled: true },
  { id: 'swipe_up', label: 'Balayage haut', action: 'stack_prev', enabled: true },
  { id: 'swipe_down', label: 'Balayage bas', action: 'stack_next', enabled: true },
  { id: 'open_hand', label: 'Paume ouverte', action: 'open_launcher', enabled: true },
  { id: 'pinch', label: 'Pincement', action: 'select_or_close', enabled: true },
  { id: 'point', label: 'Index levé', action: 'activate_voice', enabled: true },
];

export const DEFAULT_HUD_PREFS: HudExperiencePreferences = {
  userId: 'local',
  displayName: 'Samir',
  assistantName: 'JARVIS',
  orbPosition: 'center',
  showTranscript: true,
  cinematicBoot: true,
  bargeIn: true,
  locale: {
    preferredLanguage: 'fr',
    secondaryLanguages: ['en'],
    mode: 'mirror',
    stickyLanguage: null,
    voicePreset: 'jarvis_fr',
    faceId: null,
  },
  voice: {
    enabled: true,
    wakeWord: true,
    micDeviceId: null,
    outputDeviceId: null,
    ttsEnabled: true,
  },
  vision: {
    cameraDeviceId: null,
    holomatEnabled: true,
    sessionUnlock: {
      enabled: true,
      requireFace: true,
      requireVoice: true,
      requireGesture: false,
      minConfidence: 0.75,
    },
  },
  killSwitch: {
    micMuted: false,
    cameraOff: false,
  },
};

/** Placeholder — remplacer par vrai client WS Core / voice server */
export function createHudBridgeStub() {
  return {
    connected: false as boolean,
    send(_event: HudToCoreEvent) {
      // TODO: WebSocket → Core (jarvis_ai voice pipeline + Holomat Manager)
      console.debug('[hud-bridge stub] send', _event);
    },
    onEvent(_handler: (e: CoreToHudEvent) => void) {
      // TODO: subscribe Core → HUD
      return () => {};
    },
  };
}
