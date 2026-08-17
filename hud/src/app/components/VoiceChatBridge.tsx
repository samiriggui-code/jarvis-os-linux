/**
 * Protocole vocal TX/RX — conversation fluide.
 *
 * 1. Wake « Jarvis » ouvre la conversation.
 * 2. Tant que la conversation est ouverte : pas besoin de redire Jarvis.
 * 3. Après réponse : retour écoute (pas veille immédiate).
 * 4. Pendant TTS : STT coupé (anti-écho) — pas de barge-in micro pendant qu'il parle.
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
import { isTtsPlaying, stopTtsPlayback } from '../bridge/ttsCore';
import { silenceAuthNarration } from '../context/AppContext';

/** Silence avant retour veille (conversation ouverte). */
const CONVERSATION_IDLE_MS = 90_000;
/** Fenêtre courte juste après wake si rien dit. */
const FIRST_LISTEN_MS = 25_000;
/** Grace après fin TTS avant de rouvrir le STT (Chrome + anti-écho). */
const POST_TTS_STT_MS = 700;
/** Si pas de voice_playback end, forcer la réécoute. */
const RELISTEN_FALLBACK_MS = 8_000;

export function VoiceChatBridge() {
  const {
    aiState, setAiState, addMessage, setLiveTranscript,
    addNotification, setRightPanel, micTestActive, sessionUnlocked,
  } = useApp();
  const fx = useChatFx();
  const busy = useRef(false);
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relistenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sttRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Conversation ouverte : pas de préfixe Jarvis requis. */
  const conversationOpen = useRef(false);
  const wakeGranted = useRef(false);
  /** Attente fin TTS pour réécouter. */
  const awaitingRelisten = useRef(false);

  const clearListenTimer = () => {
    if (listenTimer.current) clearTimeout(listenTimer.current);
    listenTimer.current = null;
  };

  const clearRelistenTimer = () => {
    if (relistenTimer.current) clearTimeout(relistenTimer.current);
    relistenTimer.current = null;
  };

  const clearSttRetry = () => {
    if (sttRetryTimer.current) clearTimeout(sttRetryTimer.current);
    sttRetryTimer.current = null;
  };

  const armIdleTimer = (ms: number) => {
    clearListenTimer();
    listenTimer.current = setTimeout(() => {
      if (!busy.current && !awaitingRelisten.current && !isTtsPlaying()) {
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
    clearRelistenTimer();
    clearSttRetry();
    stopCommandStt();
    setLiveTranscript('');
    setAiState('idle');
    resumeWakeWord();
    busy.current = false;
    wakeGranted.current = false;
    conversationOpen.current = false;
    awaitingRelisten.current = false;
  };

  const enterListening = (msg = 'À votre écoute…') => {
    conversationOpen.current = true;
    wakeGranted.current = true;
    busy.current = false;
    awaitingRelisten.current = false;
    clearRelistenTimer();
    setAiState('listening');
    setLiveTranscript(msg);
    armIdleTimer(CONVERSATION_IDLE_MS);
  };

  /** Après une réponse Core : toujours revenir en écoute (vert), pas veille. */
  const scheduleRelisten = (delayMs = POST_TTS_STT_MS) => {
    if (!conversationOpen.current || micTestActive) return;
    awaitingRelisten.current = true;
    clearRelistenTimer();
    relistenTimer.current = setTimeout(() => {
      if (!conversationOpen.current || micTestActive) return;
      if (isTtsPlaying()) {
        scheduleRelisten(POST_TTS_STT_MS);
        return;
      }
      enterListening();
    }, delayMs);
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
      awaitingRelisten.current = false;
      if (aiState === 'listening') setAiState('idle');
    } else if (aiState === 'idle' && !conversationOpen.current) {
      resumeWakeWord();
    }
  }, [micTestActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // chat_reply / fin TTS → réécoute (jamais rester bloqué en veille)
  useEffect(() => {
    if (!sessionUnlocked) return;
    return getCoreClient().subscribe((data) => {
      if (data.type === 'chat_reply' && data.text) {
        if (!data.interim) {
          addMessage({ type: 'ai', text: String(data.text), source: 'core' });
          if (conversationOpen.current) {
            awaitingRelisten.current = true;
            // Filet si voice_playback end ne vient jamais
            clearRelistenTimer();
            relistenTimer.current = setTimeout(() => {
              if (conversationOpen.current && !micTestActive && !isTtsPlaying()) {
                enterListening();
              }
            }, RELISTEN_FALLBACK_MS);
          }
        }
      }
      if (data.type === 'voice_playback' && conversationOpen.current) {
        const phase = String((data as { phase?: string }).phase || '');
        if (phase === 'start') {
          awaitingRelisten.current = true;
          stopCommandStt();
          setLiveTranscript('');
        }
        if (phase === 'end') {
          scheduleRelisten(POST_TTS_STT_MS);
        }
      }
      if (data.type === 'tts_skipped' && conversationOpen.current) {
        scheduleRelisten(400);
      }
    });
  }, [sessionUnlocked, micTestActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fin de réponse → réécoute fluide (conversation ouverte)
  useEffect(() => {
    if (!sessionUnlocked || micTestActive) return;
    if (aiState !== 'idle') return;
    if (!conversationOpen.current) return;
    if (awaitingRelisten.current || isTtsPlaying()) {
      scheduleRelisten(POST_TTS_STT_MS);
      return;
    }
    const t = setTimeout(() => {
      if (conversationOpen.current && !busy.current && !micTestActive) {
        enterListening();
      }
    }, 450);
    return () => clearTimeout(t);
  }, [aiState, sessionUnlocked, micTestActive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (micTestActive || !sessionUnlocked) return;

    // Pendant processing / responding / TTS : micro STT OFF (anti-écho)
    if (aiState === 'processing' || aiState === 'responding' || isTtsPlaying()) {
      stopCommandStt();
      pauseWakeWord();
      return;
    }

    if (aiState !== 'listening') {
      if (aiState === 'idle' && !conversationOpen.current) {
        stopCommandStt();
        resumeWakeWord();
        setLiveTranscript('');
        wakeGranted.current = false;
      }
      return;
    }

    wakeGranted.current = true;
    if (!conversationOpen.current) conversationOpen.current = true;
    armIdleTimer(conversationOpen.current ? CONVERSATION_IDLE_MS : FIRST_LISTEN_MS);
    pauseWakeWord();
    setRightPanel('console');
    setLiveTranscript('À votre écoute…');

    if (!isSttAvailable()) {
      addNotification({
        type: 'warning',
        title: 'STT',
        message: 'Speech Recognition indisponible (Chrome).',
      });
      return;
    }

    const startStt = (attempt = 0) => {
      clearSttRetry();
      const ok = startCommandStt({
        onInterim: (t) => {
          if (t) setLiveTranscript(t);
        },
        onFinal: (text) => {
          if (!text) return;
          // Ignore pendant TTS / attente réécoute
          if (isTtsPlaying() || awaitingRelisten.current) {
            setLiveTranscript('À votre écoute…');
            return;
          }

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

          const cmd = accepted.command.trim();
          busy.current = true;
          clearListenTimer();
          setLiveTranscript('');
          stopCommandStt();

          addMessage({ type: 'user', text: cmd, source: 'voice' });
          setAiState('processing');
          setRightPanel('console');
          conversationOpen.current = true;
          wakeGranted.current = true;
          awaitingRelisten.current = true;

          const fxLocal = fx;

          if (isCoreOnline() && sendChatToCore(cmd)) {
            void interpretCommand(cmd, fxLocal, { deferToCore: true });
            busy.current = false;
            armIdleTimer(CONVERSATION_IDLE_MS);
            // Filet réécoute si pas de TTS
            clearRelistenTimer();
            relistenTimer.current = setTimeout(() => {
              if (conversationOpen.current && !micTestActive && !isTtsPlaying()) {
                enterListening();
              }
            }, RELISTEN_FALLBACK_MS);
            return;
          }

          const reply = interpretCommand(cmd, fxLocal);
          setAiState('responding');
          addMessage({ type: 'ai', text: reply, source: 'local' });
          setTimeout(() => {
            busy.current = false;
            enterListening();
          }, 1600);
        },
      });

      if (!ok) {
        // Ne PAS goStandby : Chrome rate souvent le start juste après TTS.
        if (attempt < 5) {
          sttRetryTimer.current = setTimeout(() => startStt(attempt + 1), 400 + attempt * 200);
        } else {
          addNotification({
            type: 'warning',
            title: 'Micro',
            message: 'Écoute difficile — redis « Jarvis » ou clique le micro.',
          });
          setLiveTranscript('Redis « Jarvis »…');
        }
      }
    };

    startStt(0);

    return () => {
      clearSttRetry();
      stopCommandStt();
    };
  }, [aiState, micTestActive, sessionUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessionUnlocked) return;
    const onActivateVoice = () => {
      if (micTestActive) return;
      pauseWakeWord();
      bargeIn();
      enterListening('Index levé — parlez.');
    };
    window.addEventListener('jarvis:activate-voice', onActivateVoice);
    return () => window.removeEventListener('jarvis:activate-voice', onActivateVoice);
  }, [sessionUnlocked, micTestActive]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
