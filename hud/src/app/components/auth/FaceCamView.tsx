/**
 * Aperçu caméra + barre de progression (auth / lock).
 * Holomat tourne ailleurs (faceAuthLive) — ici affichage seul.
 */
import React from 'react';
import { CameraPreview } from '../CameraPreview';

export function FaceCamView({
  progress = 0,
  label = 'HOLOMAT',
  active = true,
}: {
  progress?: number;
  label?: string;
  active?: boolean;
}) {
  const p = Math.max(0, Math.min(100, progress));
  return (
    <div
      className="relative overflow-hidden rounded-xl select-none"
      style={{
        width: 'min(92vw, 420px)',
        height: 280,
        background: '#000',
        border: '1px solid rgba(0,229,255,0.35)',
      }}
    >
      <CameraPreview active={active} className="absolute inset-0" opacity={1} mirrored />
      <div
        className="absolute top-2 left-2 px-1.5 py-0.5 rounded pointer-events-none"
        style={{
          fontFamily: 'Share Tech Mono, monospace',
          fontSize: 7,
          letterSpacing: '0.14em',
          color: '#00e5ff',
          background: 'rgba(0,0,0,0.55)',
        }}
      >
        {label}
      </div>
      <div className="absolute left-2 right-2 bottom-2 pointer-events-none">
        <div
          style={{
            fontFamily: 'Share Tech Mono, monospace',
            fontSize: 8,
            color: 'rgba(0,229,255,0.7)',
            marginBottom: 4,
            letterSpacing: '0.1em',
          }}
        >
          {Math.round(p)}%
        </div>
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,229,255,0.12)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${p}%`, background: '#00e5ff', transition: 'width 0.15s linear' }}
          />
        </div>
      </div>
    </div>
  );
}
