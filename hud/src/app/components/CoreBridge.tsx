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
