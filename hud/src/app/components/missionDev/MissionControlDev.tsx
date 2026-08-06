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

const orb = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };
const raj = { fontFamily: 'Rajdhani, sans-serif' };

const CURSOR_APP = {
  id: 'cursor',
  name: 'Cursor',
  color: '#22c55e',
  icon: Code2,
} as const;

function StepRow({ step }: { step: MissionDevStep }) {
  const color =
    step.status === 'done' ? '#22c55e'
    : step.status === 'running' ? '#00f5ff'
    : step.status === 'error' ? '#ef4444'
    : 'rgba(255,255,255,0.28)';
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg"
      style={{
        background: step.status === 'running' ? 'rgba(0,245,255,0.06)' : 'transparent',
        border: `1px solid ${color}33`,
      }}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: color, boxShadow: step.status === 'running' ? `0 0 8px ${color}` : undefined }}
      />
      <span style={{ ...raj, color: 'rgba(255,255,255,0.85)', fontSize: 14, flex: 1 }}>{step.label}</span>
      <span style={{ ...mono, color, fontSize: 9, letterSpacing: '0.08em' }}>
        {step.status.toUpperCase()}
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
    <div className="h-full min-h-0 flex flex-col overflow-hidden" style={{ background: 'rgba(0,8,20,0.4)' }}>
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
        <div>
          <p style={{ ...orb, color: '#00f5ff', fontSize: 12, letterSpacing: '0.2em', margin: 0 }}>
            MISSION CONTROL · DEV
          </p>
          <p style={{ ...raj, color: 'rgba(255,255,255,0.9)', fontSize: 18, margin: '4px 0 0' }}>
            {title || 'Orchestration'}
          </p>
          <p style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 4 }}>
            {projectName} · {scenario || 'cursor'} · {Math.round(pct)}%
          </p>
          {liveLabel ? (
            <p style={{ ...mono, color: '#00f5ff', fontSize: 10, marginTop: 6 }}>{liveLabel}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={abort}
          disabled={aborting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer"
          style={{
            ...mono,
            fontSize: 9,
            color: '#f87171',
            border: '1px solid rgba(248,113,113,0.4)',
            background: 'rgba(40,0,0,0.35)',
          }}
        >
          <Square className="w-3 h-3" /> ABORT
        </button>
      </div>

      <div className="px-4 pb-2">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#00f5ff,#22c55e)' }}
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
                  border: '1px dashed rgba(0,245,255,0.2)',
                  ...mono,
                  color: 'rgba(255,255,255,0.35)',
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
              ...orb,
              fontSize: 11,
              letterSpacing: '0.14em',
              color: '#022c22',
              background: 'linear-gradient(90deg,#22c55e,#4ade80)',
              border: 'none',
            }}
          >
            OUVRIR CURSOR
          </button>
        </div>
      )}
    </div>
  );
}
