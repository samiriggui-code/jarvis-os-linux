import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Type, Volume2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ensureMic } from '../bridge/mediaDevices';
import { getAudioLevel, startAudioBus, subscribeAudioLevel } from '../bridge/audioBus';
import { interpretCommand } from '../bridge/chatPipeline';
import { useChatFx } from '../bridge/useChatFx';
import { isCoreOnline, sendChatToCore } from './CoreBridge';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { tokens } from '../../ui/tokens';
import { visionBody, visionCaption } from './visionChrome';

const BAR_COUNT = 32;

/**
 * Barre vocale — mode voix = affichage seul (wake « Jarvis »).
 * Clic micro / saisie texte = mode recovery uniquement (§6.5.1).
 * Chrome Vision : glass pill, pas de glow cyber.
 */
export function VoiceBar() {
  const {
    aiState, setAiState, addNotification, liveTranscript, addMessage, setRightPanel,
    inputMode,
  } = useApp();
  const fx = useChatFx();
  const recovery = inputMode === 'recovery';
  const [textMode, setTextMode] = useState(false);
  const [input, setInput] = useState('');
  const [bars, setBars] = useState(() => Array(BAR_COUNT).fill(0.12));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isListening = aiState === 'listening';
  const isProcessing = aiState === 'processing' || aiState === 'responding';
  const transcript = liveTranscript;

  useEffect(() => {
    if (!recovery) setTextMode(false);
  }, [recovery]);

  useEffect(() => {
    void startAudioBus();
    return subscribeAudioLevel(() => {});
  }, []);

  useEffect(() => {
    if (isListening) {
      intervalRef.current = setInterval(() => {
        const level = getAudioLevel();
        setBars(
          Array(BAR_COUNT)
            .fill(0)
            .map((_, i) => {
              const center = BAR_COUNT / 2;
              const dist = Math.abs(i - center) / center;
              const shape = 1 - dist * 0.5;
              return 0.1 + level * 0.9 * shape + Math.random() * 0.06 * level;
            }),
        );
      }, 50);
    } else if (aiState === 'responding') {
      intervalRef.current = setInterval(() => {
        setBars(
          Array(BAR_COUNT)
            .fill(0)
            .map((_, i) => {
              const t = Date.now() / 120;
              return 0.22 + 0.5 * Math.abs(Math.sin(t + i * 0.45) * Math.cos(t * 0.7 + i * 0.2));
            }),
        );
      }, 50);
    } else if (aiState === 'processing') {
      intervalRef.current = setInterval(() => {
        setBars(
          Array(BAR_COUNT)
            .fill(0)
            .map((_, i) => {
              const t = Date.now() / 250;
              return 0.12 + 0.35 * Math.abs(Math.sin(t + i * 0.3));
            }),
        );
      }, 60);
    } else {
      intervalRef.current = setInterval(() => {
        const level = getAudioLevel();
        setBars(
          Array(BAR_COUNT)
            .fill(0)
            .map((_, i) => {
              const t = Date.now() / 900;
              const center = BAR_COUNT / 2;
              const dist = Math.abs(i - center) / center;
              return 0.06 + (0.12 * Math.abs(Math.sin(t)) + level * 0.55) * (1 - dist * 0.7);
            }),
        );
      }, 80);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [aiState, isListening]);

  const toggleListening = () => {
    if (!recovery) return;
    if (isListening) {
      setAiState('idle');
    } else if (!isProcessing) {
      void startAudioBus().then((ok) => {
        if (!ok) {
          void ensureMic().then((stream) => {
            if (!stream) {
              addNotification({
                type: 'warning',
                title: 'Micro',
                message: 'Autorise le micro dans le navigateur.',
              });
            }
          });
          return;
        }
        setAiState('listening');
        addNotification({
          type: 'info',
          title: 'Écoute (recovery)',
          message: 'Micro forcé — en mode voix, dis « Jarvis ».',
        });
      });
    }
  };

  const stateColor = {
    idle: tokens.color.accent,
    listening: tokens.color.success,
    processing: tokens.color.warning,
    responding: tokens.color.accent,
  }[aiState];

  const stateLabel = {
    idle: 'Veille',
    listening: 'Écoute',
    processing: 'Analyse',
    responding: 'Réponse',
  }[aiState];

  return (
    <GlassPanel
      level="floating"
      radius="pill"
      padding="xs"
      style={{
        width: '100%',
        height: 48,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      {recovery ? (
        <button
          type="button"
          onClick={() => setTextMode(!textMode)}
          className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer flex-shrink-0"
          style={{
            background: textMode ? tokens.color.accentSoft : 'rgba(255,255,255,0.06)',
            border: `1px solid ${tokens.color.border}`,
          }}
          title="Saisie texte (recovery)"
        >
          {textMode ? (
            <Type className="w-3.5 h-3.5" style={{ color: tokens.color.accent }} />
          ) : (
            <Volume2 className="w-3.5 h-3.5" style={{ color: tokens.color.textMuted }} />
          )}
        </button>
      ) : (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${tokens.color.border}` }}
          title="Mode voix — dis « Jarvis »"
        >
          <Volume2 className="w-3.5 h-3.5" style={{ color: tokens.color.textMuted }} />
        </div>
      )}

      <AnimatePresence mode="wait">
        {!textMode || !recovery ? (
          <motion.div
            key="voice"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center gap-3 min-w-0"
          >
            <div className="flex-1 flex items-center justify-center gap-[3px] h-7 overflow-hidden">
              {bars.map((h, i) => (
                <motion.div
                  key={i}
                  animate={{ scaleY: Math.max(0.08, h) }}
                  transition={{ duration: 0.09, ease: 'linear' }}
                  className="rounded-full origin-center flex-shrink-0"
                  style={{
                    width: 2.5,
                    height: '100%',
                    background: stateColor,
                    opacity: 0.25 + h * 0.55,
                  }}
                />
              ))}
            </div>
            {transcript ? (
              <span style={{ ...visionBody, color: tokens.color.text, maxWidth: 180 }} className="truncate">
                {transcript}
              </span>
            ) : null}
          </motion.div>
        ) : (
          <motion.div
            key="text"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center min-w-0"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !input.trim()) return;
                const text = input.trim();
                setInput('');
                setRightPanel('console');
                addMessage({ type: 'user', text, source: 'text' });
                setAiState('processing');
                if (isCoreOnline() && sendChatToCore(text)) {
                  void interpretCommand(text, fx);
                  return;
                }
                const reply = interpretCommand(text, fx);
                setTimeout(() => {
                  setAiState('responding');
                  addMessage({ type: 'ai', text: reply, source: 'local' });
                  setTimeout(() => setAiState('idle'), 1500);
                }, 400);
              }}
              placeholder="Saisie recovery…"
              className="flex-1 outline-none bg-transparent"
              style={{ ...visionBody, color: tokens.color.text }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <span style={{ ...visionCaption, color: stateColor, textTransform: 'none', letterSpacing: 0 }}>
        {stateLabel}
      </span>

      {recovery ? (
        <button
          type="button"
          onClick={toggleListening}
          className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer flex-shrink-0"
          style={{
            background: tokens.color.accentSoft,
            border: `1px solid ${stateColor}`,
          }}
          title="Forcer écoute (recovery)"
        >
          <Mic className="w-3.5 h-3.5" style={{ color: stateColor }} />
        </button>
      ) : (
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${tokens.color.border}`,
          }}
          title="Dis « Jarvis »"
        >
          <Mic className="w-3.5 h-3.5" style={{ color: tokens.color.textMuted }} />
        </div>
      )}
    </GlassPanel>
  );
}
