import React from 'react';
import { AnimatePresence } from 'motion/react';
import type { MissionDevStep } from '../../../context/AppContext';
import type { MissionDevUiPhase } from '../hooks/useMissionDevRuntime';
import { MissionDevRecapPanel } from '../ui/MissionDevRecapPanel';

/**
 * Section récap — pages vertes successives, sans écran intermédiaire.
 */
export function MissionDevRecapSection({
  uiPhase,
  pageItems,
  pageIndex,
  totalPages,
}: {
  uiPhase: MissionDevUiPhase;
  pageItems: MissionDevStep[];
  pageIndex: number;
  totalPages: number;
}) {
  void uiPhase;

  return (
    <section className="flex-1 min-h-0 flex flex-col overflow-hidden" aria-label="Récapitulatif livrables">
      <AnimatePresence mode="wait">
        <MissionDevRecapPanel
          key={`recap-${pageIndex}`}
          items={pageItems}
          page={pageIndex}
          totalPages={totalPages}
        />
      </AnimatePresence>
    </section>
  );
}
