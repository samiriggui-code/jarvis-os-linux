/**
 * Client WebSocket → JARVIS Core
 * Chat + auth (request/response) + TTS piloté par le Core (voicebox).
 */
import { handleTtsEvent, initTtsCore, stopTtsPlayback } from './ttsCore';
import { initTtsDev, speakDev, stopDev } from './ttsDev';

/** Kiosk / Vite local → Core direct. Accès distant (Twingate, LAN) → même host `/ws` (nginx). */
function resolveWsUrl(): string {
  const fromEnv = import.meta.env.VITE_CORE_WS_URL as string | undefined;
  if (fromEnv) return fromEnv;
  if (typeof window === 'undefined') return 'ws://127.0.0.1:8765';
  const { protocol, hostname, host } = window.location;
  if (hostname === '127.0.0.1' || hostname === 'localhost') {
    return 'ws://127.0.0.1:8765';
  }
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${host}/ws`;
}

export type CoreClientHandlers = {
  onConnected?: (ok: boolean) => void;
  onNotification?: (message: string) => void;
  onOrbState?: (state: string) => void;
  onAuthStatus?: (payload: Record<string, unknown>) => void;
  onUserAuthenticated?: (payload: Record<string, unknown>) => void;
  onVoiceStatus?: (payload: Record<string, unknown>) => void;
  /**
   * Résultat du STT — `{ ok, text, duration }`. Bout de chaîne du pipeline
   * micro → Whisper → Core → HUD : sans lui, la parole est transcrite puis
   * jetée. Le contrat était déclaré dans `hudContracts.ts` mais rien ne le
   * consommait ; l'index d'architecture l'a signalé.
   */
  onVoiceTranscript?: (payload: Record<string, unknown>) => void;
  /** `phase: 'start' | 'end'` — encadre la lecture TTS, sert au barge-in. */
  onVoicePlayback?: (payload: Record<string, unknown>) => void;
  /** Échec côté voix (module absent, voicebox muet, profil refusé). */
  onVoiceError?: (payload: Record<string, unknown>) => void;
  /** État des sondes du superviseur — santé des briques. */
  onSupervisorStatus?: (payload: Record<string, unknown>) => void;
  /** Transition d'une brique surveillée (`unknown|loading|ready|degraded`). */
  onComponentState?: (payload: Record<string, unknown>) => void;
  /** Encadre la séquence de boot parlée : `phase: 'start' | 'end'`. */
  onBootState?: (payload: Record<string, unknown>) => void;
  onMissionDevStarted?: (payload: Record<string, unknown>) => void;
  onMissionDevProgress?: (payload: Record<string, unknown>) => void;
  onMissionDevFinished?: (payload: Record<string, unknown>) => void;
  onMissionDevError?: (payload: Record<string, unknown>) => void;
  onRaw?: (data: Record<string, unknown>) => void;
};

type Pending = {
  match: (data: Record<string, unknown>) => boolean;
  resolve: (data: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

class CoreClient {
  private ws: WebSocket | null = null;
  private handlers: CoreClientHandlers = {};
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private pending: Pending[] = [];
  /** Messages envoyés avant l'ouverture WS (ex. announce pendant le raccord). */
  private outboundQueue: Record<string, unknown>[] = [];
  private static readonly OUTBOUND_MAX = 32;
  /**
   * Passe à true au 1er event `tts_*`. Tant que le Core n'a pas montré qu'il
   * pilote la voix, on garde l'ancien comportement (parler sur
   * `display_notification`) — sinon un Core sans module voix rendrait le HUD
   * muet. Après le 1er event, le Core décide seul : plus de double lecture.
   */
  private coreDrivesTts = false;
  private listeners = new Set<(data: Record<string, unknown>) => void>();
  connected = false;
  /** Dernier état signalé aux abonnés. `null` = rien n'a encore été dit. */
  private lastNotified: boolean | null = null;

  constructor(url?: string) {
    this.url = url || resolveWsUrl();
  }

  setHandlers(h: CoreClientHandlers) {
    this.handlers = { ...this.handlers, ...h };
  }

  /**
   * Écoute brute, multi-abonnés. `setHandlers` n'a qu'UN emplacement par
   * événement : deux composants qui veulent `component_state` se l'arrachent,
   * et le dernier monté gagne. Ici chacun a le sien et se désabonne au
   * démontage — indispensable pour une scène qui va et vient (AuthScene).
   */
  subscribe(fn: (data: Record<string, unknown>) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /**
   * Ne previent QUE sur changement d'etat.
   *
   * `onclose` part a chaque echec, et la reconnexion reessaie toutes les
   * 2,5 s : sans ce filtre, un Core eteint produisait une notification
   * « Core hors ligne » toutes les 2,5 secondes, indefiniment. On n'en voyait
   * que deux ou trois a l'ecran — les precedentes avaient expire — ce qui
   * masquait l'ampleur du probleme et noyait toute autre notification.
   */
  private notifyConnection(ok: boolean) {
    if (this.lastNotified === ok) return;
    this.lastNotified = ok;
    this.handlers.onConnected?.(ok);
  }

  connect() {
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.intentionalClose = false;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.notifyConnection(true);
      console.debug('[core-ws] connected', this.url);
      this.flushOutbound();
      this.send({ type: 'ping' });
      this.send({ type: 'auth', action: 'status' });
    };

    ws.onclose = () => {
      this.connected = false;
      this.notifyConnection(false);
      this.ws = null;
      this.flushPending(new Error('Core déconnecté'));
      if (!this.intentionalClose) {
        this.reconnectTimer = setTimeout(() => this.connect(), 2500);
      }
    };

    ws.onerror = () => {
      console.warn('[core-ws] error — Core tourne ? python -m jarvis_core');
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as Record<string, unknown>;
        this.handlers.onRaw?.(data);
        this.listeners.forEach(fn => {
          // Un abonné qui lève ne doit pas priver les autres du message.
          try { fn(data); } catch (err) { console.warn('[core-ws] listener', err); }
        });
        this.resolvePending(data);
        this.dispatch(data);
      } catch {
        /* ignore */
      }
    };
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.flushPending(new Error('disconnect'));
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    stopTtsPlayback();
    stopDev();
  }

  send(payload: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    // Ne pas perdre l'annonce de boot / les signaux critiques pendant le
    // handshake WSS (lent via Traefik/mobile). Sans file, `announce` partait
    // dans le vide → le HUD affichait « NOYAU COGNITIF INJOIGNABLE » à 14 s
    // alors que le Core n'avait encore rien reçu.
    if (this.outboundQueue.length < CoreClient.OUTBOUND_MAX) {
      this.outboundQueue.push(payload);
    }
    this.connect();
    console.debug('[core-ws] queued (connecting)', payload.type ?? payload);
    return false;
  }

  private flushOutbound() {
    const queued = this.outboundQueue.splice(0);
    for (const payload of queued) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) break;
      this.ws.send(JSON.stringify(payload));
    }
  }

  /** Envoie et attend un message WS qui match le prédicat. */
  request(
    payload: Record<string, unknown>,
    match: (data: Record<string, unknown>) => boolean,
    timeoutMs = 8000,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Core hors ligne'));
        return;
      }
      const timer = setTimeout(() => {
        this.pending = this.pending.filter(p => p.resolve !== resolve);
        reject(new Error('Timeout Core WS'));
      }, timeoutMs);
      this.pending.push({ match, resolve, reject, timer });
      if (!this.send(payload)) {
        clearTimeout(timer);
        this.pending = this.pending.filter(p => p.resolve !== resolve);
        reject(new Error('Core hors ligne'));
      }
    });
  }

  sendChat(text: string) {
    return this.send({ type: 'user_event', event: 'chat', text });
  }

  sendAuth(action: string, extra: Record<string, unknown> = {}) {
    return this.send({ type: 'auth', action, ...extra });
  }

  sendVoice(action: string, extra: Record<string, unknown> = {}) {
    return this.send({ type: 'voice', action, ...extra });
  }

  /** Mission Control DEV — start / abort (§15). */
  sendMissionDev(action: 'start' | 'abort', extra: Record<string, unknown> = {}) {
    return this.send({ type: 'mission_dev', action, ...extra });
  }

  /** Barge-in : coupe le son local *et* prévient le Core. */
  stopSpeaking() {
    stopTtsPlayback();
    return this.send({ type: 'stop_run' });
  }

  private resolvePending(data: Record<string, unknown>) {
    const hit = this.pending.find(p => p.match(data));
    if (!hit) return;
    clearTimeout(hit.timer);
    this.pending = this.pending.filter(p => p !== hit);
    hit.resolve(data);
  }

  private flushPending(err: Error) {
    const list = this.pending.splice(0);
    list.forEach(p => {
      clearTimeout(p.timer);
      p.reject(err);
    });
  }

  private dispatch(data: Record<string, unknown>) {
    const cmd = data.command ?? data.type;

    // Voix pilotée par le Core (voicebox) — avant tout le reste.
    if (handleTtsEvent(data, payload => this.send(payload))) {
      this.coreDrivesTts = true;
      return;
    }

    if (data.type === 'voice_status') {
      this.handlers.onVoiceStatus?.(data);
      return;
    }

    // Les quatre suivants étaient émis par le Core et déclarés dans
    // `hudContracts.ts`, mais aucun ne franchissait ce point de dispatch : la
    // donnée arrivait sur le socket et disparaissait. Trouvés par
    // `architecture/build.py`, pas à la lecture.
    if (data.type === 'voice_transcript') {
      this.handlers.onVoiceTranscript?.(data);
      return;
    }

    if (data.type === 'voice_playback') {
      this.handlers.onVoicePlayback?.(data);
      return;
    }

    if (data.type === 'voice_error') {
      this.handlers.onVoiceError?.(data);
      return;
    }

    if (data.type === 'supervisor_status') {
      this.handlers.onSupervisorStatus?.(data);
      return;
    }

    if (cmd === 'display_notification' && typeof data.message === 'string') {
      this.handlers.onNotification?.(data.message);
      const tts = import.meta.env.VITE_TTS_STUB === 'true';
      if (tts && !this.coreDrivesTts) {
        const voice = import.meta.env.VITE_TTS_VOICE_NAME || undefined;
        void speakDev(data.message, { preferVoiceName: voice, rate: 0.92, pitch: 0.85 });
      }
      return;
    }

    if (cmd === 'set_orb_state' && typeof data.state === 'string') {
      this.handlers.onOrbState?.(data.state);
      return;
    }

    // Boot : le Core mène, l'écran suit. `component_state` peint les lignes,
    // `boot_state` borne la séquence. Sans ces deux-là le HUD redéroulerait
    // ses six vérifications sur minuteries, à son propre rythme.
    if (data.type === 'component_state') {
      this.handlers.onComponentState?.(data);
      return;
    }

    if (data.type === 'boot_state') {
      this.handlers.onBootState?.(data);
      return;
    }

    if (data.type === 'auth_status') {
      this.handlers.onAuthStatus?.(data);
      return;
    }

    if (data.type === 'user_authenticated') {
      this.handlers.onUserAuthenticated?.(data);
      return;
    }

    if (data.type === 'mission_dev_started') {
      this.handlers.onMissionDevStarted?.(data);
      return;
    }
    if (data.type === 'mission_dev_progress') {
      this.handlers.onMissionDevProgress?.(data);
      return;
    }
    if (data.type === 'mission_dev_finished') {
      this.handlers.onMissionDevFinished?.(data);
      return;
    }
    if (data.type === 'mission_dev_error') {
      this.handlers.onMissionDevError?.(data);
      return;
    }

    // FACE_* aussi via onRaw — dispatch optionnel si handlers étendus plus tard
  }
}

let singleton: CoreClient | null = null;

export function getCoreClient(): CoreClient {
  if (!singleton) {
    singleton = new CoreClient(resolveWsUrl());
  }
  return singleton;
}

export function bootCoreBridge() {
  initTtsDev();
  initTtsCore();
  return getCoreClient();
}
