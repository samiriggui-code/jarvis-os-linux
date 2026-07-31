import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Type, Volume2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ensureMic } from '../bridge/mediaDevices';
import { getAudioLevel, startAudioBus, subscribeAudioLevel } from '../bridge/audioBus';
import { interpretCommand } from '../bridge/chatPipeline';
import { useChatFx } from '../bridge/useChatFx';
import { isCoreOnline, sendChatToCore } from './CoreBridge';

const mono = { fontFamily: 'Share Tech Mono, monospace' };
const raj = { fontFamily: 'Rajdhani, sans-serif' };

const BAR_COUNT = 32;

/**
 * Barre vocale — mode voix = affichage seul (wake « Jarvis »).
 * Clic micro / saisie texte = mode recovery uniquement (§6.5.1).
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
    return subscribeAudioLevel(() => { /* VoiceBar lit via interval */ });
  }, []);

  useEffect(() => {
    if (isListening) {
      intervalRef.current = setInterval(() => {
        const level = getAudioLevel();
        setBars(Array(BAR_COUNT).fill(0).map((_, i) => {
          const center = BAR_COUNT / 2;
          const dist = Math.abs(i - center) / center;
          const shape = 1 - dist * 0.5;
          return 0.1 + level * 0.9 * shape + Math.random() * 0.06 * level;
        }));
      }, 50);
    } else if (aiState === 'responding') {
      intervalRef.current = setInterval(() => {
        setBars(Array(BAR_COUNT).fill(0).map((_, i) => {
          const t = Date.now() / 120;
          return 0.22 + 0.5 * Math.abs(Math.sin(t + i * 0.45) * Math.cos(t * 0.7 + i * 0.2));
        }));
      }, 50);
    } else if (aiState === 'processing') {
      intervalRef.current = setInterval(() => {
        setBars(Array(BAR_COUNT).fill(0).map((_, i) => {
          const t = Date.now() / 250;
          return 0.12 + 0.35 * Math.abs(Math.sin(t + i * 0.3));
        }));
      }, 60);
    } else {
      intervalRef.current = setInterval(() => {
        const level = getAudioLevel();
        setBars(Array(BAR_COUNT).fill(0).map((_, i) => {
          const t = Date.now() / 900;
          const center = BAR_COUNT / 2;
          const dist = Math.abs(i - center) / center;
          return 0.06 + (0.12 * Math.abs(Math.sin(t)) + level * 0.55) * (1 - dist * 0.7);
        }));
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
      void startAudioBus().then(ok => {
        if (!ok) {
          void ensureMic().then(stream => {
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
    idle: '#00f5ff',
    listening: '#22c55e',
    processing: '#f59e0b',
    responding: '#a855f7',
  }[aiState];

  return (
    <div
      className="w-full flex items-center px-3 gap-2 rounded-full"
      style={{
        height: 42,
        background: 'rgba(1, 10, 24, 0.72)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${stateColor}38`,
        boxShadow: `0 0 20px ${stateColor}20, inset 0 0 14px rgba(0,0,0,0.35)`,
        transition: 'border-color 0.35s, box-shadow 0.35s',
      }}
    >
      {recovery ? (
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => setTextMode(!textMode)}
          className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer flex-shrink-0"
          style={{
            background: textMode ? 'rgba(168,85,247,0.15)' : 'rgba(0,245,255,0.05)',
            border: `1px solid ${textMode ? 'rgba(168,85,247,0.4)' : 'rgba(0,245,255,0.15)'}`,
          }}
          title="Saisie texte (recovery)"
        >
          {textMode ? (
            <Type className="w-3.5 h-3.5" style={{ color: '#a855f7' }} />
          ) : (
            <Volume2 className="w-3.5 h-3.5" style={{ color: '#00f5ff' }} />
          )}
        </motion.button>
      ) : (
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.15)' }}
          title="Mode voix — dis « Jarvis »"
        >
          <Volume2 className="w-3.5 h-3.5" style={{ color: '#00f5ff' }} />
        </div>
      )}

      <AnimatePresence mode="wait">
        {!textMode || !recovery ? (
          <motion.div
            key="voice"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center gap-3"
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
                    background: `linear-gradient(to bottom, ${stateColor}00, ${stateColor}, ${stateColor}00)`,
                    opacity: 0.35 + h * 0.65,
                    boxShadow: h > 0.45 ? `0 0 6px ${stateColor}90` : 'none',
                  }}
                />
              ))}
            </div>

            <AnimatePresence>
              {transcript && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="flex-shrink-0 max-w-48"
                >
                  <span style={{ ...raj, color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>{transcript}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            key="text"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center gap-2"
          >
            <div
              className="flex-1 flex items-center gap-2 rounded-lg px-3 py-1"
              style={{ background: 'rgba(0,8,25,0.6)', border: '1px solid rgba(168,85,247,0.2)' }}
            >
              <span style={{ ...mono, color: 'rgba(168,85,247,0.5)', fontSize: '11px' }}>{'>'}</span>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
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
                style={{ ...raj, color: 'rgba(255,255,255,0.85)', fontSize: '12px' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span style={{ ...mono, color: stateColor, fontSize: '8px', letterSpacing: '0.1em', textShadow: `0 0 8px ${stateColor}80` }}>
          {{ idle: 'VEILLE', listening: 'ÉCOUTE', processing: 'ANALYSE', responding: 'RÉPONSE' }[aiState]}
        </span>
        {recovery ? (
          <motion.button
            onClick={toggleListening}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            className="relative w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
            style={{
              background: isListening
                ? 'rgba(34, 197, 94, 0.15)'
                : isProcessing
                ? 'rgba(245, 158, 11, 0.1)'
                : 'rgba(0, 245, 255, 0.08)',
              border: `1.5px solid ${stateColor}`,
              boxShadow: `0 0 12px ${stateColor}40`,
            }}
            title="Forcer écoute (recovery)"
          >
            {isListening && (
              <motion.div
                animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="absolute inset-0 rounded-full"
                style={{ border: `1.5px solid rgba(34,197,94,0.5)` }}
              />
            )}
            {isListening ? (
              <Mic className="w-3.5 h-3.5" style={{ color: '#22c55e' }} />
            ) : isProcessing ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <div className="w-3 h-3 rounded-full border-2 border-transparent" style={{ borderTopColor: '#f59e0b', borderRightColor: '#f59e0b40' }} />
              </motion.div>
            ) : (
              <Mic className="w-3.5 h-3.5" style={{ color: '#00f5ff' }} />
            )}
          </motion.button>
        ) : (
          <div
            className="relative w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              background: isListening
                ? 'rgba(34, 197, 94, 0.15)'
                : isProcessing
                ? 'rgba(245, 158, 11, 0.1)'
                : 'rgba(0, 245, 255, 0.08)',
              border: `1.5px solid ${stateColor}`,
              boxShadow: `0 0 12px ${stateColor}40`,
            }}
            title="Dis « Jarvis »"
          >
            {isListening && (
              <motion.div
                animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="absolute inset-0 rounded-full"
                style={{ border: `1.5px solid rgba(34,197,94,0.5)` }}
              />
            )}
            {isListening ? (
              <Mic className="w-3.5 h-3.5" style={{ color: '#22c55e' }} />
            ) : isProcessing ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <div className="w-3 h-3 rounded-full border-2 border-transparent" style={{ borderTopColor: '#f59e0b', borderRightColor: '#f59e0b40' }} />
              </motion.div>
            ) : (
              <Mic className="w-3.5 h-3.5" style={{ color: '#00f5ff' }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
