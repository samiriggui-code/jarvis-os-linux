import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mic } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ensureMic } from '../bridge/mediaDevices';
import { getAudioLevel, startAudioBus, subscribeAudioLevel } from '../bridge/audioBus';
import { interpretCommand } from '../bridge/chatPipeline';
import { useChatFx } from '../bridge/useChatFx';
import { isCoreOnline, sendChatToCore } from './CoreBridge';
import { Orb } from './orb';
import { OrbLite } from './orb/OrbLite';
import { useOrbHud } from './orb/useOrbHud';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';
import { getDevicePolicy } from '../../ui/core/devicePolicy';
import { tokens } from '../../ui/tokens';

/**
 * VoiceBar — micro + wave EQ (concept Apex bas).
 * États texte = TopBar uniquement (Veille / Parole / Réflexion).
 * `centerSlot="orb"` : orbe P6 à la place de l’icône micro (mode agentic).
 */

const BAR_COUNT = 14; // par côté

type WaveMode = 'standby' | 'speaking' | 'processing';

function mapWaveMode(aiState: string, listening: boolean): WaveMode {
  if (aiState === 'processing') return 'processing';
  if (aiState === 'responding' || listening) return 'speaking';
  return 'standby';
}

function barHeights(mode: WaveMode, level: number, t: number): number[] {
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const phase = i * 0.55;
    if (mode === 'standby') {
      const base = 0.22 + 0.08 * Math.sin(i * 0.9);
      return base + level * 0.12;
    }
    if (mode === 'processing') {
      const wave = 0.35 + 0.45 * Math.abs(Math.sin(t * 2.1 + phase));
      return Math.min(1, wave * (0.75 + level * 0.35));
    }
    const wave = 0.25 + 0.75 * Math.abs(Math.sin(t * 5.2 + phase * 1.3));
    return Math.min(1, wave * (0.35 + level * 0.9));
  });
}

export function VoiceBar({
  centerSlot = 'mic',
  simVoice = false,
}: {
  /** mic = bouton micro ; orb = orbe réduite (mode surface agentic). */
  centerSlot?: 'mic' | 'orb';
  /** Enveloppe voix pour faire vibrer l’orbe centrale. */
  simVoice?: boolean;
}) {
  const {
    aiState, setAiState, addNotification, liveTranscript, addMessage, setRightPanel,
    inputMode,
  } = useApp();
  const { orbState, volume, playbackVolume } = useOrbHud();
  const { mode: themeMode } = useSpatialTheme();
  const lite = getDevicePolicy().persona === 'kiosk';
  const fx = useChatFx();
  const recovery = inputMode === 'recovery';
  const [textMode, setTextMode] = useState(false);
  const [input, setInput] = useState('');
  const [level, setLevel] = useState(0.08);
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoPhaseRef = useRef<number>(-1);

  const isListening = aiState === 'listening';
  const mode = mapWaveMode(aiState, isListening);
  const active = mode !== 'standby';

  useEffect(() => {
    if (!recovery) setTextMode(false);
  }, [recovery]);

  useEffect(() => {
    void startAudioBus();
    return subscribeAudioLevel(() => {});
  }, []);

  useEffect(() => {
    const demo =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('voiceDemo') === '1';

    intervalRef.current = setInterval(() => {
      const t = Date.now() / 1000;
      setTick(t);
      if (demo) {
        const phase = Math.floor(t / 3) % 3;
        if (phase !== demoPhaseRef.current) {
          demoPhaseRef.current = phase;
          setAiState(
            (phase === 0 ? 'idle' : phase === 1 ? 'responding' : 'processing') as
              | 'idle'
              | 'responding'
              | 'processing',
          );
        }
        if (phase === 0) setLevel(0.1);
        else if (phase === 1) setLevel(0.55 + 0.35 * Math.abs(Math.sin(t * 6)));
        else setLevel(0.35 + 0.25 * Math.abs(Math.sin(t * 2.4)));
        return;
      }
      const mic = getAudioLevel();
      if (isListening) setLevel(0.25 + mic * 0.75);
      else if (aiState === 'responding') {
        setLevel(0.35 + 0.4 * Math.abs(Math.sin(Date.now() / 180)));
      } else if (aiState === 'processing') {
        setLevel(0.28 + 0.22 * Math.abs(Math.sin(Date.now() / 380)));
      } else setLevel(0.08 + mic * 0.2);
    }, 50);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [aiState, isListening, setAiState]);

  const waveMode = mode;
  const heights = barHeights(waveMode, level, tick);
  const accent =
    waveMode === 'processing'
      ? tokens.color.danger
      : waveMode === 'speaking'
        ? tokens.color.success
        : tokens.color.accent;

  const toggleListening = () => {
    if (!recovery) return;
    if (isListening) {
      setAiState('idle');
      return;
    }
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
    });
  };

  const submitText = () => {
    if (!input.trim()) return;
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
  };

  const showText = recovery && textMode;
  const transcript = liveTranscript?.trim() || '';

  const renderBars = (side: 'left' | 'right') => {
    const ordered = side === 'left' ? [...heights].reverse() : heights;
    return (
      <div
        aria-hidden
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3.2,
          height: 36,
          flex: 1,
          justifyContent: side === 'left' ? 'flex-end' : 'flex-start',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: 1,
            borderTop: `1px dashed ${accent}`,
            opacity: waveMode === 'standby' ? 0.18 : 0.45,
            pointerEvents: 'none',
          }}
        />
        {ordered.map((h, i) => (
          <div
            key={`${side}-${i}`}
            style={{
              width: 2.5,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 2.5,
                height: `${Math.max(12, h * 100)}%`,
                borderRadius: 2,
                background: accent,
                opacity: waveMode === 'standby' ? 0.3 : 0.85,
                boxShadow: waveMode === 'standby' ? 'none' : `0 0 6px ${accent}66`,
                transition: waveMode === 'standby' ? 'height 0.4s ease, opacity 0.3s' : 'height 0.08s linear',
              }}
            />
          </div>
        ))}
      </div>
    );
  };

  const orbCenter = (
    <div
      style={{
        width: 52,
        height: 52,
        flexShrink: 0,
        borderRadius: '50%',
        overflow: 'visible',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.45))',
      }}
      title="JARVIS"
    >
      {lite ? (
        <OrbLite state={orbState} size={52} />
      ) : (
        <Orb
          state={orbState}
          volume={volume}
          playbackVolume={playbackVolume}
          size={52}
          lightMode={themeMode === 'light'}
          simVoice={simVoice}
        />
      )}
    </div>
  );

  const micCenter = (
    <button
      type="button"
      data-jarvis-always-interactive
      onClick={() => {
        if (!recovery) return;
        if (showText) submitText();
        else toggleListening();
      }}
      onContextMenu={(e) => {
        if (!recovery) return;
        e.preventDefault();
        setTextMode((v) => !v);
      }}
      title={recovery ? 'Clic : micro · clic droit : texte' : 'Dis « Jarvis »'}
      style={{
        position: 'relative',
        width: 40,
        height: 40,
        borderRadius: '50%',
        flexShrink: 0,
        cursor: recovery ? 'pointer' : 'default',
        background: 'rgba(255,255,255,0.10)',
        border: `1.5px solid ${accent}`,
        backdropFilter: 'blur(16px) saturate(140%)',
        WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        boxShadow: active
          ? `0 0 14px ${accent}88, 0 0 28px ${accent}33, inset 0.5px 0.5px 0 rgba(255,255,255,0.35)`
          : `0 0 8px ${accent}44, inset 0.5px 0.5px 0 rgba(255,255,255,0.25)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: waveMode === 'standby' ? 0.9 : 1,
        transition: 'box-shadow 0.25s, border-color 0.25s, background 0.25s',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          boxShadow: `inset 0 0 10px ${accent}33`,
          pointerEvents: 'none',
        }}
      />
      <Mic className="w-4 h-4" style={{ color: accent, position: 'relative', zIndex: 1 }} />
    </button>
  );

  return (
    <div
      className="flex flex-col items-center"
      style={{ width: 'min(100%, 420px)', margin: '0 auto', pointerEvents: 'auto' }}
    >
      <AnimatePresence mode="wait">
        {showText ? (
          <motion.div
            key="in"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              width: '100%',
              marginBottom: 6,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitText();
              }}
              placeholder="Écrire…"
              className="flex-1 min-w-0 bg-transparent outline-none"
              style={{
                fontFamily: tokens.font.body,
                fontSize: 12,
                color: tokens.color.text,
                borderBottom: `1px solid ${accent}44`,
                padding: '4px 2px',
              }}
            />
          </motion.div>
        ) : transcript ? (
          <motion.span
            key="tr"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="truncate"
            style={{
              fontFamily: tokens.font.body,
              fontSize: 11,
              color: tokens.color.text,
              maxWidth: 280,
              opacity: 0.85,
              marginBottom: 4,
            }}
            title={transcript}
          >
            {transcript}
          </motion.span>
        ) : null}
      </AnimatePresence>

      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: centerSlot === 'orb' ? 56 : 44,
        }}
      >
        {renderBars('left')}
        {centerSlot === 'orb' ? orbCenter : micCenter}
        {renderBars('right')}
      </div>
    </div>
  );
}
