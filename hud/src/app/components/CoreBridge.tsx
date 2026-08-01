/**
 * Monte le pont Core ↔ HUD (WS) + sync User Manager.
 */
import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { bootCoreBridge, getCoreClient } from '../bridge/coreClient';
import { startPeripheralWatch } from '../bridge/peripheralWatch';
import type { AuthUser } from '../bridge/authClient';

export function CoreBridge() {
  const { addNotification, setAiState, addMessage, setCoreAuth } = useApp();

  useEffect(() => {
    const client = bootCoreBridge();

    client.setHandlers({
      onConnected: (ok) => {
        setCoreAuth({ online: ok, ...(ok ? {} : { ready: false }) });
        addNotification({
          type: ok ? 'success' : 'warning',
          title: ok ? 'Core en ligne' : 'Core hors ligne',
          message: ok
            ? 'Lien WebSocket JARVIS Core établi.'
            : 'Relance python -m jarvis_core dans core/',
        });
      },
      onNotification: (message) => {
        addNotification({ type: 'info', title: 'JARVIS', message });
        if (message && !message.startsWith('JARVIS Core prêt') && !message.startsWith('Core en ligne')) {
          addMessage({ type: 'ai', text: message, source: 'core' });
          setAiState('responding');
          setTimeout(() => setAiState('idle'), 1800);
        }
      },
      onOrbState: (state) => {
        if (state === 'thinking' || state === 'processing') setAiState('processing');
        else if (state === 'speaking') setAiState('responding');
        else if (state === 'listening') setAiState('listening');
        else setAiState('idle');
      },
      onAuthStatus: (payload) => {
        setCoreAuth({
          ready: true,
          online: true,
          firstRun: payload.first_run === true,
          userCount: Number(payload.user_count ?? 0),
        });
        console.debug('[core-auth]', payload);
      },
      onUserAuthenticated: (payload) => {
        const user = payload.user as AuthUser | undefined;
        if (user) setCoreAuth({ user, firstRun: false });
        addNotification({
          type: 'success',
          title: 'Identité confirmée',
          message: `${user?.username ?? 'user'} · ${user?.role ?? '?'}`,
        });
      },

      /**
       * Bout de chaîne du pipeline vocal : micro → Whisper → Core → ici.
       * Sans ce branchement la transcription arrivait sur le socket et
       * disparaissait — la parole était comprise, jamais affichée.
       */
      onVoiceTranscript: (payload) => {
        const texte = String(payload.text ?? '').trim();
        if (payload.ok && texte) {
          addMessage({ type: 'user', text: texte, source: 'voice' });
          return;
        }
        // Un échec silencieux ferait croire à un micro sourd. La raison vient
        // du Core (`no_speech`, `stt_unavailable`…), on la montre telle quelle.
        addNotification({
          type: 'warning',
          title: 'Transcription',
          message: String(payload.reason || payload.error || 'aucune parole détectée'),
        });
      },

      /** Le Core parle : l'orbe suit, et le barge-in sait quoi interrompre. */
      onVoicePlayback: (payload) => {
        setAiState(payload.phase === 'start' ? 'responding' : 'idle');
      },

      onVoiceError: (payload) => {
        addNotification({
          type: 'error',
          title: 'Voix',
          message: String(payload.error ?? 'erreur inconnue'),
        });
      },

      onSupervisorStatus: (payload) => {
        // Pas de notification : ces transitions sont fréquentes et le HUD a
        // déjà `component_state` pour les peindre. On trace, sans bruit.
        console.debug('[supervisor]', payload);
      },
    });

    if (import.meta.env.VITE_CORE_WS !== 'false') {
      client.connect();
    }

    // Monté ici et pas dans AuthScene : un câble qui se débranche pendant
    // une session doit s'entendre aussi, pas seulement pendant l'écran
    // d'authentification.
    const stopPeripherals = startPeripheralWatch();

    return () => { stopPeripherals(); /* le WS, lui, reste ouvert */ };
  }, [addNotification, setAiState, addMessage, setCoreAuth]);

  return null;
}

export function sendChatToCore(text: string): boolean {
  return getCoreClient().sendChat(text);
}

export function isCoreOnline(): boolean {
  return getCoreClient().connected;
}
