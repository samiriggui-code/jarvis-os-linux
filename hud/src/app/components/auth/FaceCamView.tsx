/**
 * Aperçu caméra + barre de progression (auth / lock).
 * Holomat tourne ailleurs (faceAuthLive) — ici affichage seul.
 * `fill` = remplit le parent (colonne auth équilibrée) ; sinon carré legacy.
 */
import React from 'react';
import { CameraPreview } from '../CameraPreview';
import { tokens } from '../../../ui/tokens';

export function FaceCamView({
  progress = 0,
  label = 'Holomat',
  active = true,
  size,
  fill = false,
}: {
  progress?: number;
  label?: string;
  active?: boolean;
  /** Côté du carré CSS — défaut clamp(220px, min(42vw, 44dvh), 320px). Ignoré si fill. */
  size?: string | number;
  /** Remplit le conteneur parent (évité pour auth — préfère le carré explicite). */
  fill?: boolean;
}) {
  const p = Math.max(0, Math.min(100, progress));
  const side = size ?? 'clamp(220px, min(42vw, 44dvh), 320px)';
  return (
    <div
      className={`relative overflow-hidden rounded-2xl select-none ${fill ? 'w-full h-full' : 'shrink-0'}`}
      style={
        fill
          ? {
              width: '100%',
              height: '100%',
              background: tokens.color.void,
              border: `1px solid ${tokens.color.border}`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 16px 40px -18px rgba(0,0,0,0.45)',
            }
          : {
              width: side,
              height: side,
              aspectRatio: '1 / 1',
              background: tokens.color.void,
              border: `1px solid ${tokens.color.border}`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 16px 40px -18px rgba(0,0,0,0.45)',
            }
      }
    >
      <CameraPreview active={active} className="absolute inset-0" opacity={1} mirrored />
      <div
        className="absolute top-2 left-2 px-1.5 py-0.5 rounded pointer-events-none"
        style={{
          fontFamily: tokens.font.body,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.02em',
          color: tokens.color.accent,
          background: tokens.color.surfaceRaised,
          backdropFilter: tokens.glass,
        }}
      >
        {label}
      </div>
      <div className="absolute left-2 right-2 bottom-2 pointer-events-none">
        <div
          style={{
            fontFamily: tokens.font.mono,
            fontSize: 10,
            color: tokens.color.textMuted,
            marginBottom: 4,
            letterSpacing: '0.01em',
          }}
        >
          {Math.round(p)}%
        </div>
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: tokens.color.accentSoft }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${p}%`, background: tokens.color.accent, transition: 'width 0.15s linear' }}
          />
        </div>
      </div>
    </div>
  );
}
