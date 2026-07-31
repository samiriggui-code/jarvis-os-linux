import React from 'react';
import { AnimatePresence } from 'motion/react';
import type { MissionStep } from '../../../context/AppContext';
import type { MissionUiPhase } from '../hooks/useMissionRuntime';
import { MissionRecapPanel } from '../ui/MissionRecapPanel';

/**
 * Section récap — pages vertes successives, sans écran intermédiaire.
 */
export function MissionRecapSection({
  uiPhase,
  pageItems,
  pageIndex,
  totalPages,
}: {
  uiPhase: MissionUiPhase;
  pageItems: MissionStep[];
  pageIndex: number;
  totalPages: number;
}) {
  void uiPhase;

  return (
    <section className="flex-1 min-h-0 flex flex-col overflow-hidden" aria-label="Récapitulatif livrables">
      <AnimatePresence mode="wait">
        <MissionRecapPanel
          key={`recap-${pageIndex}`}
          items={pageItems}
          page={pageIndex}
          totalPages={totalPages}
        />
      </AnimatePresence>
    </section>
  );
}
