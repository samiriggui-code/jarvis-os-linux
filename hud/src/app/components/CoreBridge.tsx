import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { bootCoreBridge, getCoreClient } from '../bridge/coreClient';
import { startPeripheralWatch } from '../bridge/peripheralWatch';
import { bindHudCommands } from '../bridge/hudCommands';
import { getAppById } from '../apps/catalog';
import type { AuthUser } from '../bridge/authClient';

export function CoreBridge() {
  const {
    addNotification, setAiState, addMessage, setCoreAuth, sessionUnlocked,
    lockSession, closeApp, openApps, activeAppId, launchApp,
  } = useApp();

  useEffect(() => {
    const client = bootCoreBridge();

    client.setHandlers({
      onConnected: (ok) => {
        setCoreAuth({ online: ok, ...(ok ? {} : { ready: false }) });
        // Session HUD déjà ouverte (refresh) : coupe toute narration boot/auth.
        if (ok && sessionUnlocked) {
          try {
            client.send({ type: 'boot', action: 'skip' });
            client.send({ type: 'auth', action: 'sequence_stop' });
            client.send({ type: 'voice', action: 'cancel' });
            client.sendAuth('status');
          } catch { /* */ }
        }
        addNotification({
          type: ok ? 'success' : 'warning',
          title: ok ? 'Core en ligne' : 'Core hors ligne',
          message: ok
            ? 'Lien WebSocket JARVIS Core établi.'
            : 'Relance python -m jarvis_core dans core/',
        });
      },
      onOrbState: (state) => {
        if (state === 'thinking' || state === 'processing') setAiState('processing');
        else if (state === 'speaking') setAiState('responding');
        else if (state === 'listening') setAiState('listening');
        else setAiState('idle'); // VoiceChatBridge rouvre l'écoute si conversation ouverte
      },
      onNotification: (message) => {
        addNotification({ type: 'info', title: 'JARVIS', message });
        if (message && !message.startsWith('JARVIS Core prêt') && !message.startsWith('Core en ligne')) {
          addMessage({ type: 'ai', text: message, source: 'core' });
          setAiState('responding');
          // Ne force plus idle à 1.8s — laisse TTS + VoiceChatBridge gérer le TX/RX
        }
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

      onVoiceTranscript: (payload) => {
        const texte = String(payload.text ?? '').trim();
        if (payload.ok && texte) {
          addMessage({ type: 'user', text: texte, source: 'voice' });
          return;
        }
        addNotification({
          type: 'warning',
          title: 'Transcription',
          message: String(payload.reason || payload.error || 'aucune parole détectée'),
        });
      },

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
        console.debug('[supervisor]', payload);
      },
    });

    if (import.meta.env.VITE_CORE_WS !== 'false') {
      client.connect();
    }

    const stopPeripherals = startPeripheralWatch();

    return () => { stopPeripherals(); /* le WS, lui, reste ouvert */ };
  }, [addNotification, setAiState, addMessage, setCoreAuth, sessionUnlocked]);

  // Actions quotidiennes Core → HUD (verrouiller, mute, espaces…).
  useEffect(() => {
    return bindHudCommands({
      lockSession,
      closeApp,
      closeAllSpaces: () => {
        openApps.forEach(a => closeApp(a.id));
      },
      openSpace: (appId: string) => {
        const app = getAppById(appId);
        if (!app) return;
        launchApp({ id: app.id, name: app.name, color: app.color, icon: app.icon });
      },
      activeAppId,
      openAppIds: openApps.map(a => a.id),
      startEnrollment: () => {
        try {
          window.dispatchEvent(new CustomEvent('jarvis:start-enrollment'));
        } catch { /* */ }
      },
    });
  }, [lockSession, closeApp, openApps, activeAppId, launchApp]);

  return null;
}

export function sendChatToCore(text: string): boolean {
  return getCoreClient().sendChat(text);
}

export function isCoreOnline(): boolean {
  return getCoreClient().connected;
}
