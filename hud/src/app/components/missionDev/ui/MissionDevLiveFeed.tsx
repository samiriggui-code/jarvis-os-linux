import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MC_ACCENT, MC_CYAN, mcMono, type MissionDevLogLine } from '../lib/mcDevTokens';
import { tokens } from '../../../../ui/tokens';

/**
 * Flux live Hermès — une page de lignes, PAS de scrollbar.
 * Quand la page est pleine → le parent passe en écran jaune puis nouvelle vue.
 */
export function MissionDevLiveFeed({
  lines,
  liveLabel,
  page,
}: {
  lines: MissionDevLogLine[];
  liveLabel: string;
  page: number;
}) {
  return (
    <div
      className="relative flex-1 min-h-0 rounded-xl overflow-hidden flex flex-col"
      style={{
        background: tokens.color.surfaceRaised,
        border: `1px solid ${tokens.color.border}`,
        backdropFilter: tokens.glass,
      }}
    >
      <div
        className="px-3 py-1.5 flex items-center justify-between gap-2 flex-shrink-0"
        style={{ borderBottom: `1px solid ${tokens.color.border}`, background: tokens.color.accentSoft }}
      >
        <span style={{ ...mcMono, fontSize: 8, color: tokens.color.textMuted, letterSpacing: '0.02em' }}>
          Flux live · Vue {page + 1}
        </span>
        <motion.span
          key={liveLabel}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="truncate"
          style={{ ...mcMono, fontSize: 9, color: tokens.color.text, letterSpacing: '0.01em' }}
        >
          {liveLabel}
        </motion.span>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden px-3 py-2">
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
                    : line.tone === 'ok' ? tokens.color.success
                      : line.tone === 'sys' ? MC_ACCENT
                        : tokens.color.textMuted;
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
                      letterSpacing: '0.01em',
                      lineHeight: 1.65,
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
