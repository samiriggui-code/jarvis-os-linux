/**
 * OrbSpatial — wrapper P6 autour de Orb.
 * L’orbe = présence JARVIS uniquement.
 * `veille` ne pilote PLUS le micro (§8.19.13 / brief étape 4) —
 * l’écoute est AuthMicIndicator.
 */
import React, { useMemo } from 'react';
import { Orb } from '../orb';

export function OrbSpatial({
  size = 148,
  state = 'idle',
  volume = 0.1,
  playbackVolume = 0,
  analyser = null,
  sensitivity = 1,
  veille = false,
}: {
  size?: number | string;
  state?: 'idle' | 'listening' | 'thinking' | 'processing' | 'responding' | 'speaking';
  volume?: number;
  playbackVolume?: number;
  analyser?: AnalyserNode | null;
  sensitivity?: number;
  /** Conservé pour compat : n’active plus la réaction micro. */
  veille?: boolean;
}) {
  void veille;

  const box =
    typeof size === 'number'
      ? { width: size, height: size }
      : { width: size, height: size };

  const halo = useMemo(
    () => ({
      position: 'absolute' as const,
      inset: '-8%',
      borderRadius: '50%',
      background:
        'radial-gradient(circle at 45% 40%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 45%, transparent 72%)',
      filter: 'blur(10px)',
      pointerEvents: 'none' as const,
      opacity: 0.7,
    }),
    [],
  );

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        ...box,
        filter: 'drop-shadow(0 8px 28px rgba(0, 0, 0, 0.28))',
      }}
    >
      <div aria-hidden style={halo} />
      <div style={{ position: 'relative', width: '100%', height: '100%', zIndex: 1 }}>
        <Orb
          state={state}
          volume={volume}
          playbackVolume={playbackVolume}
          analyser={analyser}
          sensitivity={sensitivity}
        />
      </div>
    </div>
  );
}

export default OrbSpatial;
