/**
 * Orbe CSS légère — kiosk Celeron (pas de Three.js / WebGL en boucle).
 */
import React from 'react';

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'processing' | 'responding';

const COLORS: Record<string, string> = {
  idle: '#0A84FF',
  listening: '#0A84FF',
  thinking: '#a78bfa',
  processing: '#a78bfa',
  speaking: '#22c55e',
  responding: '#22c55e',
};

export function OrbLite({
  state = 'idle',
  size = 160,
}: {
  state?: OrbState | string;
  size?: number;
}) {
  const color = COLORS[state] || COLORS.idle;
  const pulse =
    state === 'listening' || state === 'speaking' || state === 'responding'
      ? '1.8s'
      : state === 'thinking' || state === 'processing'
        ? '1.2s'
        : '3.2s';

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div
        style={{
          position: 'absolute',
          inset: '18%',
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, ${color}55, ${color}18 45%, transparent 70%)`,
          boxShadow: `0 0 ${Math.round(size * 0.22)}px ${color}55`,
          animation: `jarvis-orb-lite ${pulse} ease-in-out infinite`,
        }}
      />
      <div
        style={{
          width: '38%',
          height: '38%',
          borderRadius: '50%',
          background: `radial-gradient(circle at 40% 35%, #e0fbff, ${color} 70%)`,
          boxShadow: `0 0 16px ${color}`,
        }}
      />
      <style>{`
        @keyframes jarvis-orb-lite {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.08); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
