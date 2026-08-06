/**
 * Protocole vocal TX/RX — conversation fluide.
 *
 * 1. Wake « Jarvis » ouvre la conversation.
 * 2. Tant que la conversation est ouverte : pas besoin de redire Jarvis.
 * 3. Après réponse : retour écoute (pas veille immédiate).
 * 4. Barge-in : parler pendant qu’il répond coupe le TTS et traite la suite.
 * 5. Silence prolongé → veille (redis « Jarvis »).
 */
import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { pauseWakeWord, resumeWakeWord } from '../bridge/audioBus';
import { isSttAvailable, startCommandStt, stopCommandStt } from '../bridge/stt';
import { interpretCommand } from '../bridge/chatPipeline';
import { acceptVoiceCommand, isWakeOnly } from '../bridge/voiceProtocol';
import { useChatFx } from '../bridge/useChatFx';
import { isCoreOnline, sendChatToCore } from './CoreBridge';
import { getCoreClient } from '../bridge/coreClient';
import { stopTtsPlayback } from '../bridge/ttsCore';
import { silenceAuthNarration } from '../context/AppContext';

/** Silence avant retour veille (conversation ouverte). */
const CONVERSATION_IDLE_MS = 90_000;
/** Fenêtre courte juste après wake si rien dit. */
const FIRST_LISTEN_MS = 25_000;

export function VoiceChatBridge() {
  const {
    aiState, setAiState, addMessage, setLiveTranscript,
    addNotification, setRightPanel, micTestActive, sessionUnlocked,
  } = useApp();
  const fx = useChatFx();
  const busy = useRef(false);
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Conversation ouverte : pas de préfixe Jarvis requis. */
  const conversationOpen = useRef(false);
  const wakeGranted = useRef(false);

  const clearListenTimer = () => {
    if (listenTimer.current) clearTimeout(listenTimer.current);
    listenTimer.current = null;
  };

  const armIdleTimer = (ms: number) => {
    clearListenTimer();
    listenTimer.current = setTimeout(() => {
      if (!busy.current) {
        addNotification({
          type: 'info',
          title: 'Veille',
          message: 'Conversation en pause — redis « Jarvis ».',
        });
        goStandby();
      }
    }, ms);
  };

  const goStandby = () => {
    clearListenTimer();
    stopCommandStt();
    setLiveTranscript('');
    setAiState('idle');
    resumeWakeWord();
    busy.current = false;
    wakeGranted.current = false;
    conversationOpen.current = false;
  };

  const enterListening = (msg = 'À votre écoute…') => {
    conversationOpen.current = true;
    wakeGranted.current = true;
    busy.current = false;
    setAiState('listening');
    setLiveTranscript(msg);
    armIdleTimer(CONVERSATION_IDLE_MS);
  };

  const bargeIn = () => {
    try {
      stopTtsPlayback();
      silenceAuthNarration();
      getCoreClient().send({ type: 'voice', action: 'cancel' });
    } catch { /* */ }
  };

  // Mic test
  useEffect(() => {
    if (micTestActive) {
      stopCommandStt();
      pauseWakeWord();
      setLiveTranscript('');
      wakeGranted.current = false;
      if (aiState === 'listening') setAiState('idle');
    } else if (aiState === 'idle' && !conversationOpen.current) {
      resumeWakeWord();
    }
  }, [micTestActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fin TTS Core → reprendre l’écoute si conversation ouverte
  useEffect(() => {
    if (!sessionUnlocked) return;
    return getCoreClient().subscribe((data) => {
      if (data.type === 'chat_reply' && data.text) {
        addMessage({ type: 'ai', text: String(data.text), source: 'core' });
      }
      // playback end / orb idle après parole
      if (
        conversationOpen.current
        && !busy.current
        && data.type === 'voice_playback'
      ) {
        const phase = String((data as { phase?: string }).phase || '');
        if (phase === 'end') {
          // Laisse un court battement puis réécoute
          setTimeout(() => {
            if (conversationOpen.current && !busy.current && !micTestActive) {
              enterListening();
            }
          }, 400);
        }
      }
    });
  }, [sessionUnlocked, micTestActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fin de réponse → réécoute fluide (conversation ouverte)
  useEffect(() => {
    if (!sessionUnlocked || micTestActive) return;
    if (aiState !== 'idle') return;
    if (!conversationOpen.current) return;
    const t = setTimeout(() => {
      if (conversationOpen.current && !busy.current && !micTestActive) {
        enterListening();
      }
    }, 450);
    return () => clearTimeout(t);
  }, [aiState, sessionUnlocked, micTestActive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (micTestActive || !sessionUnlocked) return;

    if (aiState !== 'listening') {
      if (aiState === 'idle' && !conversationOpen.current) {
        stopCommandStt();
        resumeWakeWord();
        setLiveTranscript('');
        wakeGranted.current = false;
      }
      // Pendant processing/responding : STT reste actif pour barge-in
      if (aiState !== 'processing' && aiState !== 'responding') {
        return;
      }
    }

    if (aiState === 'listening') {
      wakeGranted.current = true;
      if (!conversationOpen.current) conversationOpen.current = true;
      armIdleTimer(conversationOpen.current ? CONVERSATION_IDLE_MS : FIRST_LISTEN_MS);
      pauseWakeWord();
      setRightPanel('console');
      setLiveTranscript((t) => t || 'À votre écoute…');
    }

    if (!isSttAvailable()) {
      if (aiState === 'listening') {
        addNotification({
          type: 'warning',
          title: 'STT',
          message: 'Speech Recognition indisponible (Chrome).',
        });
      }
      return;
    }

    const ok = startCommandStt({
      onInterim: (t) => {
        if (t) setLiveTranscript(t);
      },
      onFinal: (text) => {
        if (!text) return;

        if (isWakeOnly(text)) {
          conversationOpen.current = true;
          wakeGranted.current = true;
          enterListening('Jarvis — je vous écoute…');
          return;
        }

        const accepted = acceptVoiceCommand(text, {
          wakeAlreadyGranted: wakeGranted.current || conversationOpen.current,
        });

        if (!accepted.ok) {
          if (accepted.reason === 'wake_only') {
            enterListening('Jarvis — je vous écoute…');
            return;
          }
          if (conversationOpen.current || wakeGranted.current) {
            setLiveTranscript('À votre écoute…');
          }
          return;
        }

        // Barge-in si JARVIS parlait / réfléchissait
        if (busy.current || aiState === 'responding' || aiState === 'processing') {
          bargeIn();
        }

        busy.current = true;
        clearListenTimer();
        setLiveTranscript('');
        // Garde STT pour la suite — on ne stoppe que le traitement parallèle

        const display = accepted.command;
        addMessage({ type: 'user', text: display, source: 'voice' });
        setAiState('processing');
        setRightPanel('console');
        conversationOpen.current = true;
        wakeGranted.current = true;

        const fxLocal = fx;

        if (isCoreOnline() && sendChatToCore(accepted.command)) {
          void interpretCommand(accepted.command, fxLocal, { deferToCore: true });
          // Ne PAS goStandby : CoreBridge / TTS end → re-écoute
          busy.current = false;
          armIdleTimer(CONVERSATION_IDLE_MS);
          return;
        }

        const reply = interpretCommand(accepted.command, fxLocal);
        setAiState('responding');
        addMessage({ type: 'ai', text: reply, source: 'local' });
        setTimeout(() => {
          busy.current = false;
          enterListening();
        }, 1600);
      },
    });

    if (!ok && aiState === 'listening') {
      addNotification({ type: 'warning', title: 'STT', message: 'Reconnaissance vocale indisponible.' });
      goStandby();
    }

    return () => {
      // Ne coupe pas le timer conversation au cleanup partiel
      stopCommandStt();
    };
  }, [aiState, micTestActive, sessionUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
