/**
 * Mission Control — orchestrateur fenêtre app (§15).
 * Piloté par le Core (WS mission) — plus de simulation timer.
 */
import React, { useCallback } from 'react';
import { Code2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useMissionRuntime } from './hooks/useMissionRuntime';
import { missionProgressPct } from './lib/missionLogs';
import { MissionHeaderSection } from './sections/MissionHeaderSection';
import { MissionProgressSection } from './sections/MissionProgressSection';
import { MissionStreamSection } from './sections/MissionStreamSection';
import { MissionRecapSection } from './sections/MissionRecapSection';

const CURSOR_APP = {
  id: 'cursor',
  name: 'Cursor',
  color: '#22c55e',
  icon: Code2,
} as const;

export function MissionControl() {
  const {
    missionControl,
    advanceMissionStep,
    addMessage,
    closeMissionControl,
    launchApp,
  } = useApp();
  const { open, title, subtitle, projectName, steps, scenario } = missionControl;
  const pct = missionProgressPct(steps);

  const onHandoffToCursor = useCallback(() => {
    closeMissionControl();
    launchApp({
      id: CURSOR_APP.id,
      name: CURSOR_APP.name,
      color: CURSOR_APP.color,
      icon: CURSOR_APP.icon,
    });
  }, [closeMissionControl, launchApp]);

  const {
    visibleStreamLines,
    streamPage,
    allDone,
    liveLabel,
    uiPhase,
    pageItems,
    pageIndex,
    totalPages,
  } = useMissionRuntime(
    steps,
    projectName,
    scenario,
    advanceMissionStep,
    addMessage,
    onHandoffToCursor,
    open,
  );

  const showRecap = allDone || uiPhase === 'enumerate' || uiPhase === 'done';

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <MissionHeaderSection
        title={title}
        subtitle={subtitle}
        projectName={projectName}
        scenario={scenario}
      />

      <div className="px-3 sm:px-5 py-3 flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        <MissionProgressSection pct={pct} />

        {!showRecap && (
          <MissionStreamSection
            lines={visibleStreamLines}
            liveLabel={liveLabel}
            page={streamPage}
          />
        )}

        {showRecap && (
          <MissionRecapSection
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
