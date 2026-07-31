/**
 * Protocole vocal : wake → écoute commande → repos.
 *
 * Après le wake « Jarvis », une pause avant la question est normale :
 * la fenêtre d’écoute reste ouverte et la suite est acceptée sans redire Jarvis.
 * Hors fenêtre (veille) : on ignore TV / conversations latérales.
 */
import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { pauseWakeWord, resumeWakeWord } from '../bridge/audioBus';
import { isSttAvailable, startCommandStt, stopCommandStt } from '../bridge/stt';
import { interpretCommand } from '../bridge/chatPipeline';
import { acceptVoiceCommand, isWakeOnly } from '../bridge/voiceProtocol';
import { useChatFx } from '../bridge/useChatFx';
import { isCoreOnline, sendChatToCore } from './CoreBridge';

/** Fenêtre d’écoute après wake (pause Jarvis → question autorisée). */
const LISTEN_TIMEOUT_MS = 22000;
/** Après un « Jarvis » seul (STT), on prolonge encore. */
const LISTEN_EXTEND_MS = 16000;

export function VoiceChatBridge() {
  const {
    aiState, setAiState, addMessage, setLiveTranscript,
    addNotification, setRightPanel, micTestActive,
  } = useApp();
  const fx = useChatFx();
  const busy = useRef(false);
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Wake déjà validé pour cette session d’écoute (audioBus ou STT). */
  const wakeGranted = useRef(false);

  const clearListenTimer = () => {
    if (listenTimer.current) clearTimeout(listenTimer.current);
    listenTimer.current = null;
  };

  const armListenTimer = (ms: number) => {
    clearListenTimer();
    listenTimer.current = setTimeout(() => {
      if (!busy.current) {
        addNotification({
          type: 'info',
          title: 'Veille',
          message: 'Temps écoulé — redis « Jarvis » pour une commande.',
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
  };

  const keepListeningAfterWake = () => {
    wakeGranted.current = true;
    setLiveTranscript('Jarvis — je t’écoute…');
    armListenTimer(LISTEN_EXTEND_MS);
  };

  // Mic test : jamais de STT commande
  useEffect(() => {
    if (micTestActive) {
      stopCommandStt();
      pauseWakeWord();
      setLiveTranscript('');
      wakeGranted.current = false;
      if (aiState === 'listening') setAiState('idle');
    } else if (aiState === 'idle') {
      resumeWakeWord();
    }
  }, [micTestActive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (micTestActive) return;

    if (aiState !== 'listening') {
      if (aiState === 'idle') {
        stopCommandStt();
        resumeWakeWord();
        setLiveTranscript('');
        wakeGranted.current = false;
      }
      return;
    }

    // Entrée en écoute = wake déjà entendu (audioBus) → pause autorisée
    wakeGranted.current = true;
    armListenTimer(LISTEN_TIMEOUT_MS);

    pauseWakeWord();
    setRightPanel('console');
    setLiveTranscript('À l’écoute…');

    if (!isSttAvailable()) {
      addNotification({
        type: 'warning',
        title: 'STT',
        message: 'Speech Recognition indisponible (Chrome). Whisper Core plus tard.',
      });
      return;
    }

    const ok = startCommandStt({
      onInterim: (t) => {
        if (t) setLiveTranscript(t);
      },
      onFinal: (text) => {
        if (!text || busy.current) return;

        // « Jarvis » seul (pause avant la question) → rester en écoute
        if (isWakeOnly(text)) {
          keepListeningAfterWake();
          return;
        }

        const accepted = acceptVoiceCommand(text, {
          wakeAlreadyGranted: wakeGranted.current,
        });

        if (!accepted.ok) {
          if (accepted.reason === 'wake_only') {
            keepListeningAfterWake();
            return;
          }
          // Bruit / trop court : rester en écoute sans notifier
          if (wakeGranted.current) {
            setLiveTranscript('À l’écoute…');
          }
          return;
        }

        busy.current = true;
        clearListenTimer();
        setLiveTranscript('');
        stopCommandStt();

        const display = `Jarvis ${accepted.command}`;
        addMessage({ type: 'user', text: display, source: 'voice' });
        setAiState('processing');
        setRightPanel('console');

        const fxLocal = fx;

        if (isCoreOnline() && sendChatToCore(accepted.command)) {
          void interpretCommand(accepted.command, fxLocal);
          setTimeout(() => goStandby(), 10000);
          return;
        }

        const reply = interpretCommand(accepted.command, fxLocal);
        setTimeout(() => {
          setAiState('responding');
          addMessage({ type: 'ai', text: reply, source: 'local' });
          setTimeout(() => goStandby(), 1800);
        }, 350);
      },
    });

    if (!ok) {
      addNotification({ type: 'warning', title: 'STT', message: 'Reconnaissance vocale indisponible.' });
      goStandby();
    }

    return () => {
      clearListenTimer();
      stopCommandStt();
    };
  }, [aiState, micTestActive]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
