/**
 * AuthVoiceWave — barre HUD minimaliste (Iron Man), pas un panneau « studio ».
 * Pilotée par `level` du parent (même bus que l’orbe).
 */
import React, { useEffect, useState } from 'react';

const BAR_COUNT = 28;

type Mode = 'idle' | 'listening' | 'processing' | 'ok' | 'denied' | 'speaking';

const COLORS: Record<Mode, string> = {
  idle: '#0A84FF',
  listening: '#0A84FF',
  processing: '#FF9F1C',
  speaking: '#0A84FF',
  ok: '#34C759',
  denied: '#FF3B30',
};

export function AuthVoiceWave({
  mode = 'listening',
  className,
  speakLevel = 0.55,
  level = 0,
}: {
  mode?: Mode;
  className?: string;
  speakLevel?: number;
  /** 0..1 micro live (parent). */
  level?: number;
}) {
  const [bars, setBars] = useState(() => Array(BAR_COUNT).fill(0.1));
  const color = COLORS[mode];

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = performance.now() / 1000;
      let next: number[];

      if (mode === 'denied') {
        next = Array(BAR_COUNT).fill(0.06);
      } else if (mode === 'ok') {
        next = Array(BAR_COUNT)
          .fill(0)
          .map((_, i) => 0.25 + 0.2 * Math.abs(Math.sin(t * 2 + i * 0.25)));
      } else if (mode === 'processing') {
        next = Array(BAR_COUNT)
          .fill(0)
          .map((_, i) => 0.12 + 0.45 * Math.abs(Math.sin(t * 5 + i * 0.4)));
      } else if (mode === 'speaking') {
        const base = Math.max(0.3, speakLevel);
        next = Array(BAR_COUNT)
          .fill(0)
          .map((_, i) => {
            const c = BAR_COUNT / 2;
            const dist = Math.abs(i - c) / c;
            return Math.min(1, base * (1 - dist * 0.45) + 0.2 * Math.random() * base);
          });
      } else {
        // listening / idle — envelope micro + forme centre
        const env = Math.max(0.06, Math.min(1, level * 1.6));
        next = Array(BAR_COUNT)
          .fill(0)
          .map((_, i) => {
            const c = BAR_COUNT / 2;
            const dist = Math.abs(i - c) / c;
            const shape = 1 - dist * 0.55;
            return Math.min(1, 0.08 + env * 0.92 * shape + Math.random() * 0.04 * env);
          });
      }

      setBars(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, level, speakLevel]);

  return (
    <div
      className={className}
      style={{
        width: '100%',
        maxWidth: 320,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: '0 8px',
      }}
    >
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 2.5,
            height: '100%',
            transform: `scaleY(${Math.max(0.08, h)})`,
            transformOrigin: 'center',
            borderRadius: 1,
            background: `linear-gradient(to bottom, transparent, ${color}, transparent)`,
            opacity: 0.35 + h * 0.65,
            boxShadow: h > 0.4 ? `0 0 6px ${color}88` : 'none',
          }}
        />
      ))}
    </div>
  );
}
