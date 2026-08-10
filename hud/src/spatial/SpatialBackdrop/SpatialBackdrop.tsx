/**
 * Fond lab spatial — dégradés / orbes / grille (light | night).
 * PAS d’icônes bureau / taskbar : uniquement l’atmosphère colorée.
 */
import React from 'react';
import type { SpatialMode } from '../theme/SpatialTheme';

const orbBase: React.CSSProperties = {
  position: 'absolute',
  borderRadius: '50%',
  willChange: 'transform',
};

export function SpatialBackdrop({ mode = 'night' }: { mode?: SpatialMode }) {
  const night = mode === 'night';

  return (
    <div
      aria-hidden
      className="spatial-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        background: night
          ? `
            radial-gradient(ellipse 90% 70% at 18% 12%, #1a3a6e 0%, transparent 55%),
            radial-gradient(ellipse 70% 60% at 88% 18%, #4a2a78 0%, transparent 50%),
            radial-gradient(ellipse 80% 50% at 50% 100%, #0d2848 0%, transparent 55%),
            linear-gradient(165deg, #0a1628 0%, #12101c 45%, #080a10 100%)
          `
          : `
            radial-gradient(ellipse 90% 70% at 15% 10%, #9ec9ff 0%, transparent 55%),
            radial-gradient(ellipse 70% 55% at 90% 20%, #ffd6a8 0%, transparent 50%),
            radial-gradient(ellipse 80% 45% at 50% 100%, #b8e0ff 0%, transparent 55%),
            linear-gradient(165deg, #c8ddf8 0%, #e8eef8 40%, #f4f7fb 100%)
          `,
      }}
    >
      <div
        className="spatial-backdrop__orb spatial-backdrop__orb--a"
        style={{
          ...orbBase,
          width: '58vmax',
          height: '58vmax',
          top: '-18%',
          left: '-12%',
          background: night
            ? 'radial-gradient(circle at 40% 40%, rgba(64,156,255,0.55) 0%, rgba(10,132,255,0.22) 38%, transparent 68%)'
            : 'radial-gradient(circle at 40% 40%, rgba(80,160,255,0.55) 0%, rgba(120,180,255,0.22) 38%, transparent 68%)',
        }}
      />
      <div
        className="spatial-backdrop__orb spatial-backdrop__orb--b"
        style={{
          ...orbBase,
          width: '48vmax',
          height: '48vmax',
          top: '8%',
          right: '-16%',
          background: night
            ? 'radial-gradient(circle at 50% 50%, rgba(168,120,255,0.42) 0%, rgba(90,60,200,0.16) 42%, transparent 70%)'
            : 'radial-gradient(circle at 50% 50%, rgba(255,170,100,0.4) 0%, rgba(255,140,80,0.16) 42%, transparent 70%)',
        }}
      />
      <div
        className="spatial-backdrop__orb spatial-backdrop__orb--c"
        style={{
          ...orbBase,
          width: '42vmax',
          height: '42vmax',
          bottom: '2%',
          left: '18%',
          background: night
            ? 'radial-gradient(circle at 50% 50%, rgba(90,220,210,0.28) 0%, rgba(40,160,180,0.1) 45%, transparent 72%)'
            : 'radial-gradient(circle at 50% 50%, rgba(120,200,255,0.35) 0%, rgba(80,160,220,0.12) 45%, transparent 72%)',
        }}
      />
      <div
        className="spatial-backdrop__orb spatial-backdrop__orb--d"
        style={{
          ...orbBase,
          width: '36vmax',
          height: '36vmax',
          bottom: '12%',
          right: '8%',
          background: night
            ? 'radial-gradient(circle at 40% 40%, rgba(255,140,90,0.22) 0%, rgba(200,80,120,0.1) 40%, transparent 68%)'
            : 'radial-gradient(circle at 40% 40%, rgba(255,190,140,0.35) 0%, rgba(255,160,120,0.12) 40%, transparent 68%)',
        }}
      />

      {/* Bokeh — détail pour le blur verre (pas des icônes) */}
      {(night
        ? [
            { t: '18%', l: '12%', s: 14, o: 0.55, c: '180,220,255' },
            { t: '28%', l: '72%', s: 22, o: 0.4, c: '200,170,255' },
            { t: '62%', l: '22%', s: 18, o: 0.45, c: '140,240,230' },
            { t: '70%', l: '68%', s: 28, o: 0.35, c: '255,190,140' },
            { t: '42%', l: '48%', s: 12, o: 0.5, c: '255,255,255' },
          ]
        : [
            { t: '16%', l: '14%', s: 16, o: 0.65, c: '255,255,255' },
            { t: '30%', l: '70%', s: 24, o: 0.45, c: '255,200,140' },
            { t: '58%', l: '24%', s: 18, o: 0.5, c: '120,180,255' },
            { t: '72%', l: '66%', s: 26, o: 0.4, c: '180,210,255' },
            { t: '40%', l: '46%', s: 12, o: 0.55, c: '255,255,255' },
          ]
      ).map((b, i) => (
        <div
          key={i}
          className={`spatial-backdrop__bokeh spatial-backdrop__bokeh--${i % 3}`}
          style={{
            position: 'absolute',
            top: b.t,
            left: b.l,
            width: b.s,
            height: b.s,
            borderRadius: '50%',
            background: `rgba(${b.c}, ${b.o})`,
            boxShadow: `0 0 ${b.s * 1.8}px rgba(${b.c}, ${b.o * 0.7})`,
          }}
        />
      ))}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: night ? 0.14 : 0.2,
          backgroundImage: `
            linear-gradient(${night ? 'rgba(255,255,255,0.06)' : 'rgba(20,40,80,0.07)'} 1px, transparent 1px),
            linear-gradient(90deg, ${night ? 'rgba(255,255,255,0.06)' : 'rgba(20,40,80,0.07)'} 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 85% 75% at 50% 40%, black 15%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 85% 75% at 50% 40%, black 15%, transparent 80%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: night
            ? 'radial-gradient(ellipse 75% 65% at 50% 40%, transparent 35%, rgba(0,0,0,0.45) 100%)'
            : 'radial-gradient(ellipse 75% 65% at 50% 40%, transparent 40%, rgba(80,110,150,0.18) 100%)',
        }}
      />

      <style>{`
        @keyframes spatial-orb-a {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(4%, 6%, 0) scale(1.06); }
        }
        @keyframes spatial-orb-b {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-5%, 4%, 0) scale(1.08); }
        }
        @keyframes spatial-orb-c {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(6%, -5%, 0) scale(1.05); }
        }
        @keyframes spatial-orb-d {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-4%, -6%, 0) scale(1.07); }
        }
        @keyframes spatial-bokeh {
          0%, 100% { transform: translate3d(0, 0, 0); opacity: 0.85; }
          50% { transform: translate3d(8px, -12px, 0); opacity: 1; }
        }
        .spatial-backdrop__orb--a { animation: spatial-orb-a 18s ease-in-out infinite; }
        .spatial-backdrop__orb--b { animation: spatial-orb-b 22s ease-in-out infinite; }
        .spatial-backdrop__orb--c { animation: spatial-orb-c 20s ease-in-out infinite; }
        .spatial-backdrop__orb--d { animation: spatial-orb-d 24s ease-in-out infinite; }
        .spatial-backdrop__bokeh--0 { animation: spatial-bokeh 9s ease-in-out infinite; }
        .spatial-backdrop__bokeh--1 { animation: spatial-bokeh 11s ease-in-out infinite 1.2s; }
        .spatial-backdrop__bokeh--2 { animation: spatial-bokeh 13s ease-in-out infinite 0.6s; }
        @media (prefers-reduced-motion: reduce) {
          .spatial-backdrop__orb,
          .spatial-backdrop__bokeh { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

export default SpatialBackdrop;
