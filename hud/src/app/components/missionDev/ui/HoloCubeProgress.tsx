import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { MC_CYAN, mcMono, mcOrb } from '../lib/mcDevTokens';
import { tokens } from '../../../../ui/tokens';
import { SUCCESS } from '../../hudTheme';

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
                    ? `linear-gradient(145deg, ${tokens.color.success}, ${SUCCESS} 55%, ${MC_CYAN})`
                    : `linear-gradient(145deg, ${MC_CYAN}, ${MC_CYAN} 70%, ${MC_CYAN})`
                  : tokens.color.accentSoft,
                border: `1px solid ${on ? (done ? `${SUCCESS}99` : `${MC_CYAN}77`) : tokens.color.border}`,
                boxShadow: on
                  ? `inset 0 0 4px rgba(255,255,255,0.25)`
                  : 'inset 0 0 4px rgba(0,0,0,0.25)',
              }}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5 px-0.5">
        <span style={{ ...mcMono, fontSize: 8, color: tokens.color.textMuted, letterSpacing: '0.02em' }}>
          Holo · Cubes
        </span>
        <span
          style={{
            ...mcOrb,
            fontSize: 11,
            color: done ? tokens.color.success : MC_CYAN,
          }}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}
