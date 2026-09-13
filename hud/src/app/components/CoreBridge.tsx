import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { bootCoreBridge, getCoreClient } from '../bridge/coreClient';
import { startPeripheralWatch } from '../bridge/peripheralWatch';
import { bindHudCommands } from '../bridge/hudCommands';
import { bootToolTimelineStore, requestToolTimelineSnapshot } from '../bridge/toolTimelineStore';
import { bootVerificationStore } from '../bridge/verificationStore';
import { bootVisionSceneStore } from '../bridge/visionSceneStore';
import { getAppById } from '../apps/catalog';
import type { AuthUser } from '../bridge/authClient';
import { applyCoreNotification, applyApprovalToast, syncApprovalToastsFromDocument, toast } from '../toast';

export function CoreBridge() {
  const {
    setAiState, addMessage, setCoreAuth, sessionUnlocked,
    lockSession, closeApp, openApps, activeAppId, launchApp, requestDashboard,
  } = useApp();

  useEffect(() => {
    const client = bootCoreBridge();
    bootVerificationStore();
    bootToolTimelineStore();
    bootVisionSceneStore();

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
        if (ok) {
          try { requestToolTimelineSnapshot(); } catch { /* */ }
        }
        if (ok) toast.success('Core en ligne', 'Lien WebSocket JARVIS Core établi.');
        else toast.warning('Core hors ligne', 'Relance python -m jarvis_core dans core/');
      },
      onOrbState: (state) => {
        if (state === 'thinking' || state === 'processing') setAiState('processing');
        else if (state === 'speaking') setAiState('responding');
        else if (state === 'listening') setAiState('listening');
        else setAiState('idle'); // VoiceChatBridge rouvre l'écoute si conversation ouverte
      },
      onNotification: (payload) => {
        applyCoreNotification(payload);
        if (payload.message && !payload.message.startsWith('JARVIS Core prêt') && !payload.message.startsWith('Core en ligne')) {
          addMessage({ type: 'ai', text: payload.message, source: 'core' });
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
        toast.success('Identité confirmée', `${user?.username ?? 'user'} · ${user?.role ?? '?'}`);
      },

      onVoiceTranscript: (payload) => {
        const texte = String(payload.text ?? '').trim();
        if (payload.ok && texte) {
          addMessage({ type: 'user', text: texte, source: 'voice' });
          return;
        }
        toast.warning('Transcription', String(payload.reason || payload.error || 'aucune parole détectée'));
      },

      onVoicePlayback: (payload) => {
        setAiState(payload.phase === 'start' ? 'responding' : 'idle');
      },

      onVoiceError: (payload) => {
        toast.error('Voix', String(payload.error ?? 'erreur inconnue'));
      },

      onSupervisorStatus: (payload) => {
        console.debug('[supervisor]', payload);
      },
    });

    if (import.meta.env.VITE_CORE_WS !== 'false') {
      client.connect();
    }

    const stopPeripherals = startPeripheralWatch();

    // Policy approvals → toast dual-CTA (en complément de ApprovalCard surface).
    const unsubApprovals = client.subscribe((data) => {
      const kind = data.type;
      if (kind === 'approval_request') {
        applyApprovalToast({
          approvalId: String(data.approval_id ?? ''),
          action: String(data.preview ?? data.intent ?? 'action'),
          runId: data.run_id ? String(data.run_id) : undefined,
        });
        return;
      }
      if (kind === 'SURFACE_SNAPSHOT') {
        const doc =
          (data.payload as { document?: unknown } | undefined)?.document ??
          (data as { document?: unknown }).document;
        if (doc) syncApprovalToastsFromDocument(doc);
      }
    });

    return () => { unsubApprovals(); stopPeripherals(); /* le WS, lui, reste ouvert */ };
  }, [setAiState, addMessage, setCoreAuth, sessionUnlocked]);

  // Actions quotidiennes Core → HUD (verrouiller, mute, espaces…).
  useEffect(() => {
    return bindHudCommands({
      lockSession,
      closeApp,
      closeAllSpaces: () => {
        openApps.forEach(a => closeApp(a.id));
      },
      openSpace: (appId: string) => {
        if (appId === 'hub') {
          requestDashboard();
          return;
        }
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
  }, [lockSession, closeApp, openApps, activeAppId, launchApp, requestDashboard]);

  return null;
}

export function sendChatToCore(text: string): boolean {
  return getCoreClient().sendChat(text);
}

export function isCoreOnline(): boolean {
  return getCoreClient().connected;
}
