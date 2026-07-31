import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { MC_CYAN, mcMono, mcOrb } from '../lib/mcTokens';

const CUBE_COUNT = 24;

/** Barre de progression en petits cubes holographiques. */
export function HoloCubeProgress({ pct }: { pct: number }) {
  const done = pct >= 100;
  const filled = useMemo(
    () => Math.round((Math.min(100, Math.max(0, pct)) / 100) * CUBE_COUNT),
    [pct],
  );

  return (
    <div className="flex-shrink-0">
      <div className="flex items-center gap-1 w-full">
        {Array.from({ length: CUBE_COUNT }, (_, i) => {
          const on = i < filled;
          const isHead = on && i === filled - 1 && !done;
          return (
            <motion.div
              key={i}
              initial={false}
              animate={{
                opacity: on ? 1 : 0.35,
                scale: isHead ? [1, 1.15, 1] : 1,
              }}
              transition={{
                opacity: { duration: 0.2 },
                scale: isHead ? { duration: 0.7, repeat: Infinity } : { duration: 0.2 },
              }}
              className="flex-1 min-w-0 aspect-square max-h-3 rounded-[2px]"
              style={{
                background: on
                  ? done
                    ? 'linear-gradient(145deg, #4ade80, #22c55e 55%, #00f5ff)'
                    : `linear-gradient(145deg, ${MC_CYAN}, #a855f7 70%, #f43f5e)`
                  : 'rgba(0, 245, 255, 0.06)',
                border: `1px solid ${on ? (done ? '#22c55e99' : `${MC_CYAN}77`) : 'rgba(0,245,255,0.12)'}`,
                boxShadow: on
                  ? `0 0 8px ${done ? '#22c55e66' : `${MC_CYAN}55`}, inset 0 0 4px rgba(255,255,255,0.35)`
                  : 'inset 0 0 4px rgba(0,0,0,0.45)',
              }}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5 px-0.5">
        <span style={{ ...mcMono, fontSize: 8, color: 'rgba(0,245,255,0.45)', letterSpacing: '0.14em' }}>
          HOLO · CUBES
        </span>
        <span
          style={{
            ...mcOrb,
            fontSize: 11,
            color: done ? '#4ade80' : MC_CYAN,
            textShadow: `0 0 10px ${done ? '#22c55e88' : `${MC_CYAN}88`}`,
          }}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}
