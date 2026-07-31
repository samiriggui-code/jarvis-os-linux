import React from 'react';
import { AnimatePresence } from 'motion/react';
import { MissionLiveFeed } from '../ui/MissionLiveFeed';
import type { MissionLogLine } from '../lib/mcTokens';

/**
 * Section flux Hermès — pas de scrollbar.
 * Page pleine → nouvelle vue directe (pas d’écran intermédiaire).
 */
export function MissionStreamSection({
  lines,
  liveLabel,
  page,
}: {
  lines: MissionLogLine[];
  liveLabel: string;
  page: number;
  /** @deprecated flash jaune retiré — prop ignorée si présente */
  flashing?: boolean;
}) {
  return (
    <section className="flex-1 min-h-0 flex flex-col overflow-hidden" aria-label="Flux live Hermès">
      <AnimatePresence mode="wait">
        <MissionLiveFeed
          key={`stream-${page}`}
          lines={lines}
          liveLabel={liveLabel}
          page={page}
        />
      </AnimatePresence>
    </section>
  );
}
