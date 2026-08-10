/**
 * Orbe sur fond Spatial — halo soft + mix-blend pour fusionner avec les orbes backdrop.
 * Mode veille : réagit au micro puis retombe en idle.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Orb } from '../orb';
import { useMicOrbAnalyser } from './useMicOrbAnalyser';
import { tryPrimeMic } from '../../bridge/mediaDevices';

export function useOrbVeilleReactive(enabled = true) {
  const [micOk, setMicOk] = useState(false);
  const { micAnalyser, micLevel } = useMicOrbAnalyser(enabled && micOk);
  const [peakHold, setPeakHold] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void tryPrimeMic().then((ok) => {
      if (alive) setMicOk(!!ok);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  useEffect(() => {
    setPeakHold((h) => {
      if (micLevel > 0.1) return Math.max(micLevel, h * 0.92);
      return h * 0.88;
    });
  }, [micLevel]);

  const active = peakHold > 0.08 || micLevel > 0.1;
  return {
    analyser: micAnalyser,
    /** Toujours idle / listening — jamais thinking permanent en veille. */
    state: (active ? 'listening' : 'idle') as 'idle' | 'listening',
    volume: active ? Math.min(0.85, 0.18 + Math.max(micLevel, peakHold) * 0.9) : 0.07 + micLevel * 0.15,
    micLevel,
  };
}

export function OrbSpatial({
  size = 148,
  state = 'idle',
  volume = 0.1,
  playbackVolume = 0,
  analyser = null,
  sensitivity = 1,
  veille = false,
}: {
  /** px fixe, ou CSS length (ex. clamp(...)) */
  size?: number | string;
  state?: 'idle' | 'listening' | 'thinking' | 'processing' | 'responding' | 'speaking';
  volume?: number;
  playbackVolume?: number;
  analyser?: AnalyserNode | null;
  sensitivity?: number;
  /** Si true : force idle + réaction micro (ignore state/volume externes sauf speaking). */
  veille?: boolean;
}) {
  const veilleRx = useOrbVeilleReactive(veille);
  const liveState = veille
    ? state === 'speaking' || state === 'responding'
      ? state
      : veilleRx.state
    : state;
  const liveVolume = veille
    ? state === 'speaking' || state === 'responding'
      ? volume
      : veilleRx.volume
    : volume;
  const liveAnalyser = veille ? veilleRx.analyser ?? analyser : analyser;

  const box =
    typeof size === 'number'
      ? { width: size, height: size }
      : { width: size, height: size };

  const halo = useMemo(
    () => ({
      position: 'absolute' as const,
      inset: '-6%',
      borderRadius: '50%',
      background:
        'radial-gradient(circle at 45% 40%, rgba(10,132,255,0.18) 0%, rgba(10,132,255,0.08) 45%, transparent 72%)',
      filter: 'blur(8px)',
      mixBlendMode: 'normal' as const,
      pointerEvents: 'none' as const,
      opacity: 0.55,
    }),
    [],
  );

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        ...box,
        mixBlendMode: 'normal',
        filter: 'drop-shadow(0 2px 10px rgba(10, 40, 90, 0.22))',
      }}
    >
      <div aria-hidden style={halo} />
      <div style={{ position: 'relative', width: '100%', height: '100%', zIndex: 1 }}>
        <Orb
          state={liveState}
          volume={liveVolume}
          playbackVolume={playbackVolume}
          analyser={liveAnalyser}
          sensitivity={sensitivity}
        />
      </div>
    </div>
  );
}

export default OrbSpatial;
