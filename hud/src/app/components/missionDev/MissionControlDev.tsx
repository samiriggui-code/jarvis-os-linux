/**
 * Mission Control DEV — surface agentique (jalons + ResultPanel).
 * Plus de monologue : le Core avance les steps ; l’UI les affiche.
 * Une phrase audio courte par jalon terminé (côté Core).
 */
import React, { useCallback, useState } from 'react';
import { Code2, Square } from 'lucide-react';
import { useApp, type MissionDevStep } from '../../context/AppContext';
import { useMissionDevRuntime } from './hooks/useMissionDevRuntime';
import { missionDevProgressPct } from './lib/missionDevLogs';
import { AgentSurface } from '../../../agentic/AgentSurface';
import { getCoreClient } from '../../bridge/coreClient';
import { ACCENT, DANGER, SUCCESS, bodyFont, monoFont, orbFont } from '../hudTheme';
import { tokens } from '../../../ui/tokens';

const CURSOR_APP = {
  id: 'cursor',
  name: 'Cursor',
  color: '#22c55e',
  icon: Code2,
} as const;

function StepRow({ step }: { step: MissionDevStep }) {
  const color =
    step.status === 'done' ? SUCCESS
    : step.status === 'running' ? ACCENT
    : step.status === 'error' ? DANGER
    : tokens.color.textMuted;
  const statusLabel =
    step.status === 'done' ? 'Terminé'
    : step.status === 'running' ? 'En cours'
    : step.status === 'error' ? 'Erreur'
    : 'En attente';
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg"
      style={{
        background: step.status === 'running' ? tokens.color.accentSoft : 'transparent',
        border: `1px solid ${color}33`,
      }}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      <span style={{ ...bodyFont, color: tokens.color.text, fontSize: 14, flex: 1 }}>{step.label}</span>
      <span style={{ ...monoFont, color, fontSize: 9, letterSpacing: '0.02em' }}>
        {statusLabel}
      </span>
    </div>
  );
}

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
  const [aborting, setAborting] = useState(false);

  const onHandoffToCursor = useCallback(() => {
    closeMissionControlDev();
    launchApp({
      id: CURSOR_APP.id,
      name: CURSOR_APP.name,
      color: CURSOR_APP.color,
      icon: CURSOR_APP.icon,
    });
  }, [closeMissionControlDev, launchApp]);

  const { allDone, liveLabel } = useMissionDevRuntime(
    steps,
    projectName,
    scenario,
    advanceMissionDevStep,
    addMessage,
    onHandoffToCursor,
    open,
  );

  const abort = () => {
    setAborting(true);
    try {
      getCoreClient().send({ type: 'mission_dev', action: 'abort' });
    } catch { /* */ }
    closeMissionControlDev();
  };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden" style={{ background: tokens.color.surface }}>
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
        <div>
          <p style={{ ...orbFont, color: ACCENT, fontSize: 12, letterSpacing: '-0.01em', margin: 0 }}>
            Mission Control · Dev
          </p>
          <p style={{ ...bodyFont, color: tokens.color.text, fontSize: 18, margin: '4px 0 0' }}>
            {title || 'Orchestration'}
          </p>
          <p style={{ ...monoFont, color: tokens.color.textMuted, fontSize: 10, marginTop: 4 }}>
            {projectName} · {scenario || 'cursor'} · {Math.round(pct)}%
          </p>
          {liveLabel ? (
            <p style={{ ...monoFont, color: ACCENT, fontSize: 10, marginTop: 6 }}>{liveLabel}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={abort}
          disabled={aborting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer"
          style={{
            ...monoFont,
            fontSize: 9,
            color: DANGER,
            border: `1px solid rgba(255,59,48,0.4)`,
            background: tokens.color.surfaceRaised,
          }}
        >
          <Square className="w-3 h-3" /> Abandonner
        </button>
      </div>

      <div className="px-4 pb-2">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${ACCENT}, ${SUCCESS})` }}
          />
        </div>
      </div>

      <div className="px-4 flex flex-col gap-2 pb-3 flex-1 min-h-0 overflow-auto">
        {steps.map(s => <StepRow key={s.id} step={s} />)}
        <div className="mt-2 min-h-[120px] relative flex-1">
          <AgentSurface
            surfaceId="mission-control-dev"
            composeQuestion={
              `Compose une surface Mission Control DEV pour le projet « ${projectName} » : `
              + 'ResultPanel avec le résumé des jalons (mémoire, Hermès, agent, cursor, git, prêt).'
            }
            fallback={
              <div
                className="h-full flex items-center justify-center p-4 rounded-xl"
                style={{
                  border: `1px dashed ${tokens.color.borderActive}`,
                  ...monoFont,
                  color: tokens.color.textMuted,
                  fontSize: 11,
                }}
              >
                Jalons ci-dessus · Composer pour enrichir
              </div>
            }
          />
        </div>
      </div>

      {allDone && (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={onHandoffToCursor}
            className="w-full py-2.5 rounded-xl cursor-pointer"
            style={{
              ...orbFont,
              fontSize: 11,
              letterSpacing: '0.01em',
              color: '#022c22',
              background: `linear-gradient(90deg, ${SUCCESS}, #4ade80)`,
              border: 'none',
            }}
          >
            Ouvrir Cursor
          </button>
        </div>
      )}
    </div>
  );
}
