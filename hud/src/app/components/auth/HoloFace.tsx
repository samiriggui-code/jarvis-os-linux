import React from 'react';
import { motion } from 'motion/react';

export type HoloFacePhase = 'idle' | 'scanning' | 'ok' | 'denied' | 'listening';

/**
 * Holovisage géométrique façon cyber-face (inspiration NOD32 / HUD Iron Man) —
 * SVG animé, pas une photo. Couleur suit la phase auth.
 */
export function HoloFace({ phase = 'idle', progress = 0 }: { phase?: HoloFacePhase; progress?: number }) {
  const color =
    phase === 'ok' ? '#22c55e' :
    phase === 'denied' ? '#ef4444' :
    phase === 'listening' ? '#0A84FF' :
    '#0A84FF';

  const pulse = phase === 'scanning' || phase === 'listening';

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Hex ambient */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${color}18 0%, transparent 55%)`,
        }}
        animate={pulse ? { opacity: [0.5, 1, 0.5] } : { opacity: 0.7 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />

      <svg viewBox="0 0 200 220" className="relative z-10 w-[78%] h-[78%]" fill="none">
        <defs>
          <linearGradient id="holoStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="50%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.35" />
          </linearGradient>
          <filter id="holoGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer shield — NOD32-like angular crest */}
        <motion.path
          d="M100 12 L168 42 L178 118 L100 208 L22 118 L32 42 Z"
          stroke="url(#holoStroke)"
          strokeWidth="1.4"
          fill={`${color}08`}
          filter="url(#holoGlow)"
          animate={pulse ? { opacity: [0.7, 1, 0.7] } : { opacity: 1 }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <path
          d="M100 28 L152 52 L160 112 L100 186 L40 112 L48 52 Z"
          stroke={color}
          strokeWidth="0.6"
          strokeOpacity="0.35"
          fill="none"
        />

        {/* Face plate */}
        <motion.path
          d="M100 48 L138 68 L142 118 Q142 155 100 172 Q58 155 58 118 L62 68 Z"
          stroke={color}
          strokeWidth="1.5"
          fill={`${color}0c`}
          filter="url(#holoGlow)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />

        {/* Brow / forehead circuit */}
        <path d="M72 78 H128 M78 86 H122" stroke={color} strokeWidth="1" strokeOpacity="0.55" />
        <circle cx="100" cy="74" r="2.2" fill={color} opacity="0.9" />

        {/* Eyes — glowing slits */}
        <motion.ellipse
          cx="82" cy="108" rx="11" ry="7"
          stroke={color} strokeWidth="1.6" fill={`${color}22`}
          animate={pulse ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
        <motion.ellipse
          cx="118" cy="108" rx="11" ry="7"
          stroke={color} strokeWidth="1.6" fill={`${color}22`}
          animate={pulse ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0.15 }}
        />
        <motion.circle
          cx="82" cy="108" r="3.5"
          fill={color}
          animate={phase === 'scanning' ? { cx: [79, 85, 79] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <motion.circle
          cx="118" cy="108" r="3.5"
          fill={color}
          animate={phase === 'scanning' ? { cx: [115, 121, 115] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        />

        {/* Nose bridge */}
        <path d="M100 118 L100 138" stroke={color} strokeWidth="1.2" strokeOpacity="0.7" />
        <path d="M100 138 L92 146 M100 138 L108 146" stroke={color} strokeWidth="1" strokeOpacity="0.5" />

        {/* Mouth plate */}
        <path
          d="M78 158 Q100 168 122 158"
          stroke={color}
          strokeWidth="1.5"
          strokeOpacity={phase === 'ok' ? 1 : 0.65}
          fill="none"
        />
        {phase === 'ok' && (
          <path d="M84 156 Q100 164 116 156" stroke={color} strokeWidth="1" fill="none" />
        )}

        {/* Side vents / jaw bolts */}
        {[
          [54, 100], [54, 120], [54, 140],
          [146, 100], [146, 120], [146, 140],
        ].map(([x, y], i) => (
          <rect key={i} x={x - 3} y={y - 1.5} width="6" height="3" rx="0.5" fill={color} opacity="0.45" />
        ))}

        {/* Scan clip rect */}
        {phase === 'scanning' && (
          <motion.rect
            x="58" width="84" height="3"
            fill={color}
            opacity="0.85"
            initial={{ y: 55 }}
            animate={{ y: [55, 165, 55] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        )}
      </svg>

      {/* Corner brackets */}
      <div className="absolute top-2.5 left-2.5 w-5 h-5 border-t border-l" style={{ borderColor: color, opacity: 0.75 }} />
      <div className="absolute top-2.5 right-2.5 w-5 h-5 border-t border-r" style={{ borderColor: color, opacity: 0.75 }} />
      <div className="absolute bottom-2.5 left-2.5 w-5 h-5 border-b border-l" style={{ borderColor: color, opacity: 0.75 }} />
      <div className="absolute bottom-2.5 right-2.5 w-5 h-5 border-b border-r" style={{ borderColor: color, opacity: 0.75 }} />

      {phase === 'scanning' && (
        <div className="absolute bottom-3 left-4 right-4 z-20">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ width: `${progress}%`, background: color, boxShadow: `0 0 10px ${color}` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
