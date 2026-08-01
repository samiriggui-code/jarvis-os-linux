/**
 * Mission Control DEV — orchestrateur fenêtre app (§15.1.1).
 * Piloté par le Core (WS mission) — plus de simulation timer.
 */
import React, { useCallback } from 'react';
import { Code2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useMissionDevRuntime } from './hooks/useMissionDevRuntime';
import { missionDevProgressPct } from './lib/missionDevLogs';
import { MissionDevHeaderSection } from './sections/MissionDevHeaderSection';
import { MissionDevProgressSection } from './sections/MissionDevProgressSection';
import { MissionDevStreamSection } from './sections/MissionDevStreamSection';
import { MissionDevRecapSection } from './sections/MissionDevRecapSection';

const CURSOR_APP = {
  id: 'cursor',
  name: 'Cursor',
  color: '#22c55e',
  icon: Code2,
} as const;

export function MissionControlDev() {
  const {
    missionControlDev,
    advanceMissionDevStep,
    addMessage,
    closeMissionControlDev,
    launchApp,
  } = useApp();
  const { open, title, subtitle, projectName, steps, scenario } = missionControlDev;
  const pct = missionDevProgressPct(steps);

  const onHandoffToCursor = useCallback(() => {
    closeMissionControlDev();
    launchApp({
      id: CURSOR_APP.id,
      name: CURSOR_APP.name,
      color: CURSOR_APP.color,
      icon: CURSOR_APP.icon,
    });
  }, [closeMissionControlDev, launchApp]);

  const {
    visibleStreamLines,
    streamPage,
    allDone,
    liveLabel,
    uiPhase,
    pageItems,
    pageIndex,
    totalPages,
  } = useMissionDevRuntime(
    steps,
    projectName,
    scenario,
    advanceMissionDevStep,
    addMessage,
    onHandoffToCursor,
    open,
  );

  const showRecap = allDone || uiPhase === 'enumerate' || uiPhase === 'done';

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <MissionDevHeaderSection
        title={title}
        subtitle={subtitle}
        projectName={projectName}
        scenario={scenario}
      />

      <div className="px-3 sm:px-5 py-3 flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        <MissionDevProgressSection pct={pct} />

        {!showRecap && (
          <MissionDevStreamSection
            lines={visibleStreamLines}
            liveLabel={liveLabel}
            page={streamPage}
          />
        )}

        {showRecap && (
          <MissionDevRecapSection
            uiPhase={uiPhase}
            pageItems={pageItems}
            pageIndex={pageIndex}
            totalPages={totalPages}
          />
        )}
      </div>
    </div>
  );
}
