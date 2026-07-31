import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MC_ACCENT, MC_CYAN, mcMono, type MissionLogLine } from '../lib/mcTokens';

/**
 * Flux live Hermès — une page de lignes, PAS de scrollbar.
 * Quand la page est pleine → le parent passe en écran jaune puis nouvelle vue.
 */
export function MissionLiveFeed({
  lines,
  liveLabel,
  page,
}: {
  lines: MissionLogLine[];
  liveLabel: string;
  page: number;
}) {
  return (
    <div
      className="relative flex-1 min-h-0 rounded-xl overflow-hidden flex flex-col"
      style={{
        background: 'linear-gradient(165deg, rgba(0,18,36,0.85), rgba(4,6,18,0.92))',
        border: `1px solid ${MC_CYAN}28`,
        boxShadow: `inset 0 0 40px ${MC_CYAN}0c, 0 0 24px ${MC_ACCENT}12`,
      }}
    >
      <div
        className="px-3 py-1.5 flex items-center justify-between gap-2 flex-shrink-0"
        style={{ borderBottom: `1px solid ${MC_CYAN}18`, background: 'rgba(0,245,255,0.04)' }}
      >
        <span style={{ ...mcMono, fontSize: 8, color: `${MC_CYAN}99`, letterSpacing: '0.16em' }}>
          FLUX LIVE · VUE {page + 1}
        </span>
        <motion.span
          key={liveLabel}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="truncate"
          style={{ ...mcMono, fontSize: 9, color: '#fff', letterSpacing: '0.06em' }}
        >
          {liveLabel}
        </motion.span>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden px-3 py-2">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 11px, rgba(0,245,255,0.04) 11px, rgba(0,245,255,0.04) 12px)',
          }}
        />
        <div className="h-full overflow-hidden flex flex-col justify-start gap-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={`feed-page-${page}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col"
            >
              {lines.map((line, i) => {
                const isLast = i === lines.length - 1;
                const color =
                  line.tone === 'live' ? MC_CYAN
                    : line.tone === 'ok' ? '#4ade80'
                      : line.tone === 'sys' ? MC_ACCENT
                        : 'rgba(180,200,220,0.35)';
                return (
                  <motion.div
                    key={line.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.22 }}
                    className="break-all"
                    style={{
                      ...mcMono,
                      fontSize: 11,
                      color,
                      letterSpacing: '0.03em',
                      lineHeight: 1.65,
                      textShadow: line.tone === 'live' ? `0 0 8px ${MC_CYAN}66` : undefined,
                    }}
                  >
                    {line.text}
                    {isLast && line.tone === 'live' && (
                      <motion.span
                        animate={{ opacity: [1, 0.15, 1] }}
                        transition={{ duration: 0.7, repeat: Infinity }}
                      >
                        ▌
                      </motion.span>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
