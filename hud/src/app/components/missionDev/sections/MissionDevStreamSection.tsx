import React from 'react';
import { AnimatePresence } from 'motion/react';
import { MissionDevLiveFeed } from '../ui/MissionDevLiveFeed';
import type { MissionDevLogLine } from '../lib/mcDevTokens';

/**
 * Section flux Hermès — pas de scrollbar.
 * Page pleine → nouvelle vue directe (pas d’écran intermédiaire).
 */
export function MissionDevStreamSection({
  lines,
  liveLabel,
  page,
}: {
  lines: MissionDevLogLine[];
  liveLabel: string;
  page: number;
  /** @deprecated flash jaune retiré — prop ignorée si présente */
  flashing?: boolean;
}) {
  return (
    <section className="flex-1 min-h-0 flex flex-col overflow-hidden" aria-label="Flux live Hermès">
      <AnimatePresence mode="wait">
        <MissionDevLiveFeed
          key={`stream-${page}`}
          lines={lines}
          liveLabel={liveLabel}
          page={page}
        />
      </AnimatePresence>
    </section>
  );
}
