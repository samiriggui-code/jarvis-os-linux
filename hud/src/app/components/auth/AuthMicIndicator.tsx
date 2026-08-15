/**
 * AuthMicIndicator — même wave EQ que VoiceBar (veille HUD).
 * Remplace l’ancien pastille micro seule. API inchangée pour AuthScene /
 * LockScene / FirstSetup / AdminAuth.
 */
import React, { useEffect, useState } from 'react';
import { Mic, Check } from 'lucide-react';
import { subscribeWakeWord } from '../../bridge/audioBus';
import { tokens } from '../../../ui/tokens';
import { ACCENT, DANGER, MUTED, SUCCESS } from '../hudTheme';

type Mode = 'idle' | 'listening' | 'processing' | 'ok' | 'denied' | 'speaking';
type WaveMode = 'standby' | 'speaking' | 'processing';

const BAR_COUNT = 14;

function cleanHeard(raw?: string): string {
  const t = (raw || '')
    .replace(/[«»"']/g, '')
    .replace(/\u2026/g, '...')
    .trim();
  if (!t) return '';
  if (/^[.\s…·•\-–—]+$/.test(t)) return '';
  if (/^\.{1,6}$/.test(t)) return '';
  if (t.length < 2) return '';
  return t;
}

function toWaveMode(mode: Mode): WaveMode {
  if (mode === 'processing') return 'processing';
  if (mode === 'listening' || mode === 'speaking') return 'speaking';
  return 'standby';
}

function barHeights(wave: WaveMode, level: number, t: number): number[] {
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const phase = i * 0.55;
    if (wave === 'standby') {
      const base = 0.22 + 0.08 * Math.sin(i * 0.9);
      return base + level * 0.12;
    }
    if (wave === 'processing') {
      const w = 0.35 + 0.45 * Math.abs(Math.sin(t * 2.1 + phase));
      return Math.min(1, w * (0.75 + level * 0.35));
    }
    const w = 0.25 + 0.75 * Math.abs(Math.sin(t * 5.2 + phase * 1.3));
    return Math.min(1, w * (0.35 + level * 0.9));
  });
}

export function AuthMicIndicator({
  mode = 'listening',
  level = 0,
  heard,
  phase,
  className,
}: {
  mode?: Mode;
  level?: number;
  heard?: string;
  phase?: string;
  className?: string;
}) {
  const [wakeFlash, setWakeFlash] = useState(false);
  const [tick, setTick] = useState(0);
  const heardClean = cleanHeard(heard);
  const env = Math.max(0, Math.min(1, level));
  const waveMode = toWaveMode(mode);
  const active = waveMode !== 'standby';

  useEffect(() => {
    let t: number | undefined;
    const unsub = subscribeWakeWord(() => {
      setWakeFlash(true);
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => setWakeFlash(false), 520);
    });
    return () => {
      unsub();
      if (t) window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now() / 1000), 50);
    return () => window.clearInterval(id);
  }, []);

  const accent =
    mode === 'denied' ? DANGER
    : mode === 'ok' ? SUCCESS
    : wakeFlash ? SUCCESS
    : ACCENT;

  const label =
    mode === 'denied' ? 'Échec'
    : mode === 'ok' ? 'OK'
    : wakeFlash ? 'Wake'
    : mode === 'speaking' ? 'Parole'
    : mode === 'processing' || phase === 'reconstruction' ? 'Analyse'
    : mode === 'listening' || phase === 'camera_on' || phase === 'obstruction' ? 'Écoute'
    : 'Micro';

  const heights = barHeights(waveMode, Math.max(0.08, env), tick);

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
                transition:
                  waveMode === 'standby'
                    ? 'height 0.4s ease, opacity 0.3s'
                    : 'height 0.08s linear',
              }}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className={className}
      style={{
        width: 'min(100%, 320px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 44,
        }}
      >
        {renderBars('left')}
        <div
          style={{
            position: 'relative',
            width: 40,
            height: 40,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.10)',
            border: `1.5px solid ${accent}`,
            backdropFilter: 'blur(16px) saturate(140%)',
            WebkitBackdropFilter: 'blur(16px) saturate(140%)',
            boxShadow: active
              ? `0 0 14px ${accent}88, 0 0 28px ${accent}33, inset 0.5px 0.5px 0 rgba(255,255,255,0.35)`
              : `0 0 8px ${accent}44, inset 0.5px 0.5px 0 rgba(255,255,255,0.25)`,
            transform: wakeFlash ? 'scale(1.08)' : 'scale(1)',
            transition: 'box-shadow 0.25s, border-color 0.25s, transform 180ms ease-out',
          }}
          title={label}
        >
          {mode === 'ok' ? (
            <Check size={16} color={SUCCESS} strokeWidth={2.6} />
          ) : (
            <Mic size={16} color={accent} strokeWidth={2.4} />
          )}
        </div>
        {renderBars('right')}
      </div>

      <p
        style={{
          margin: 0,
          fontFamily: tokens.font.body,
          fontSize: 9,
          fontWeight: 500,
          color: MUTED,
          letterSpacing: '0.02em',
        }}
      >
        {label}
      </p>
      {heardClean ? (
        <p
          style={{
            margin: 0,
            fontFamily: tokens.font.body,
            fontSize: 9,
            color: accent,
            textAlign: 'center',
            maxWidth: 220,
            opacity: 0.85,
            lineHeight: 1.25,
          }}
        >
          « {heardClean} »
        </p>
      ) : null}
    </div>
  );
}

/** Alias rétrocompat — AuthVoiceWave / AuthMicCapsule → indicateur EQ. */
export function AuthMicCapsule(props: {
  mode?: Mode;
  level?: number;
  speakLevel?: number;
  heard?: string;
  className?: string;
  phase?: string;
}) {
  return <AuthMicIndicator {...props} />;
}

export function AuthVoiceWave(props: {
  mode?: Mode;
  className?: string;
  speakLevel?: number;
  level?: number;
  heard?: string;
  phase?: string;
}) {
  return <AuthMicIndicator {...props} />;
}

export default AuthMicIndicator;
