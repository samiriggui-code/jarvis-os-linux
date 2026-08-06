/**
 * Mission Control — runtime piloté par le Core (WS mission_dev_*).
 * Plus de simulation timer : progression = mission_dev_progress.
 */
import { useEffect, useRef, useState } from 'react';
import type { MissionDevStep, MissionDevStepStatus } from '../../../context/AppContext';
import { getCoreClient } from '../../../bridge/coreClient';
import type { MissionDevLogLine } from '../lib/mcDevTokens';

export const STREAM_PAGE_SIZE = 6;
export const RECAP_PAGE_SIZE = 3;

export type MissionDevUiPhase = 'stream' | 'enumerate' | 'done';

type AddMessage = (msg: { type: 'ai'; text: string; source?: 'system' | 'core' }) => void;

function toneForLog(status: string): MissionDevLogLine['tone'] {
  if (status === 'done') return 'ok';
  if (status === 'running') return 'live';
  if (status === 'error') return 'sys';
  return 'dim';
}

/**
 * Écoute Core → avance les steps / logs / récap / handoff Cursor.
 */
export function useMissionDevRuntime(
  steps: MissionDevStep[],
  projectName: string,
  scenario: string | null,
  advanceMissionDevStep: (id: string, status: MissionDevStepStatus) => void,
  addMessage: AddMessage,
  // Non optionnel : un parametre optionnel ne peut pas preceder un requis.
  // Les appelants passent deja les deux positionnellement.
  onHandoffToCursor: ((projectName: string) => void) | undefined,
  /** true une fois la mission ouverte et le start envoyé */
  active: boolean,
) {
  const allDone = steps.length > 0 && steps.every(s => s.status === 'done');
  const running = steps.find(s => s.status === 'running');
  const doneSteps = steps.filter(s => s.status === 'done');

  const [allLines, setAllLines] = useState<MissionDevLogLine[]>([]);
  const [streamPageStart, setStreamPageStart] = useState(0);
  const [uiPhase, setUiPhase] = useState<MissionDevUiPhase>('stream');
  const [cursor, setCursor] = useState(0);
  const [pageStart, setPageStart] = useState(0);
  const [coreDriven, setCoreDriven] = useState(false);

  const handoffDone = useRef(false);
  const enumKey = useRef<string | null>(null);
  const onHandoffRef = useRef(onHandoffToCursor);
  onHandoffRef.current = onHandoffToCursor;
  const advanceRef = useRef(advanceMissionDevStep);
  advanceRef.current = advanceMissionDevStep;
  const addMsgRef = useRef(addMessage);
  addMsgRef.current = addMessage;

  const streamPage = Math.floor(streamPageStart / STREAM_PAGE_SIZE);
  const visibleStreamLines = allLines.slice(
    streamPageStart,
    streamPageStart + STREAM_PAGE_SIZE,
  );
  const pageIndex = Math.floor(pageStart / RECAP_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(doneSteps.length / RECAP_PAGE_SIZE));
  const pageItems = doneSteps.slice(pageStart, Math.min(cursor, pageStart + RECAP_PAGE_SIZE));

  // Reset à l'ouverture
  useEffect(() => {
    if (!active) return;
    handoffDone.current = false;
    enumKey.current = null;
    setAllLines([
      { id: 'sys-0', text: ':: MISSION CONTROL DEV · canal Core', tone: 'sys' },
      { id: 'sys-1', text: `:: cible · ${projectName || 'projet'}`, tone: 'dim' },
    ]);
    setStreamPageStart(0);
    setCursor(0);
    setPageStart(0);
    setUiPhase('stream');
    setCoreDriven(false);
  }, [active, projectName]);

  // Start / stop Core
  useEffect(() => {
    if (!active) return;
    const client = getCoreClient();
    if (!client.connected) {
      addMsgRef.current({
        type: 'ai',
        text: 'Core hors ligne — Mission Control DEV nécessite jarvis_core.',
        source: 'system',
      });
      setAllLines(prev => [
        ...prev,
        { id: `err-${Date.now()}`, text: '!! Core offline — lance python -m jarvis_core', tone: 'sys' },
      ]);
      return;
    }
    client.sendMissionDev('start', {
      scenario: scenario || 'cursor',
      project_name: projectName || undefined,
    });
    setCoreDriven(true);
    return () => {
      client.sendMissionDev('abort');
    };
  }, [active, projectName, scenario]);

  // Écoute events Core
  useEffect(() => {
    if (!active) return;
    const client = getCoreClient();
    const onProgress = (data: Record<string, unknown>) => {
      const stepId = String(data.step_id || '');
      const status = String(data.status || '') as MissionDevStepStatus;
      const log = data.log != null ? String(data.log) : null;
      if (stepId && (status === 'running' || status === 'done' || status === 'error')) {
        advanceRef.current(stepId, status);
      }
      if (log) {
        setAllLines(prev => [
          ...prev,
          {
            id: `${stepId}-${status}-${Date.now()}`,
            text: log,
            tone: toneForLog(status),
          },
        ]);
      }
    };
    const onStarted = (data: Record<string, unknown>) => {
      setCoreDriven(true);
      setAllLines(prev => [
        ...prev,
        {
          id: `started-${Date.now()}`,
          text: `:: mission_dev_started · ${String(data.project_name || projectName)}`,
          tone: 'ok',
        },
      ]);
    };
    const onFinished = (data: Record<string, unknown>) => {
      const ok = data.ok !== false;
      const name = String(data.project_name || projectName || 'projet');
      if (!ok) {
        addMsgRef.current({
          type: 'ai',
          text: `Mission DEV interrompue — ${String(data.error || 'abort')}.`,
          source: 'core',
        });
        return;
      }
      // Récap local après steps done
      setUiPhase('enumerate');
    };
    const onError = (data: Record<string, unknown>) => {
      addMsgRef.current({
        type: 'ai',
        text: `Mission DEV erreur — ${String(data.error || 'inconnu')}.`,
        source: 'core',
      });
      setAllLines(prev => [
        ...prev,
        { id: `err-${Date.now()}`, text: `!! ${String(data.error || 'error')}`, tone: 'sys' },
      ]);
    };

    client.setHandlers({
      onMissionDevStarted: onStarted,
      onMissionDevProgress: onProgress,
      onMissionDevFinished: onFinished,
      onMissionDevError: onError,
    });
    return () => {
      client.setHandlers({
        onMissionDevStarted: undefined,
        onMissionDevProgress: undefined,
        onMissionDevFinished: undefined,
        onMissionDevError: undefined,
      });
    };
  }, [active, projectName]);

  // Pagination flux
  useEffect(() => {
    if (allDone || uiPhase !== 'stream') return;
    if (allLines.length <= streamPageStart + STREAM_PAGE_SIZE) return;
    setStreamPageStart(s => s + STREAM_PAGE_SIZE);
  }, [allLines.length, streamPageStart, allDone, uiPhase]);

  // Récap + handoff quand tous les steps sont done
  useEffect(() => {
    if (!allDone) return;
    const key = `${projectName}|${steps.map(s => `${s.id}:${s.status}`).join('|')}`;
    if (enumKey.current === key) return;
    enumKey.current = key;

    setUiPhase('enumerate');
    setCursor(0);
    setPageStart(0);

    const names = steps.filter(s => s.status === 'done').map(s => s.label);
    addMsgRef.current({
      type: 'ai',
      text: `Mission terminée. Projet ${projectName || 'projet'}. Voici ce qui a été créé.`,
      source: 'core',
    });

    const timers: number[] = [];
    let i = 0;
    let start = 0;
    const tick = (delay: number) => {
      timers.push(window.setTimeout(() => {
        if (i >= names.length) {
          setUiPhase('done');
          timers.push(window.setTimeout(() => {
            if (handoffDone.current) return;
            handoffDone.current = true;
            onHandoffRef.current?.(projectName || 'projet');
          }, 1200));
          return;
        }
        if (i - start >= RECAP_PAGE_SIZE) {
          start = i;
          setPageStart(start);
        }
        setCursor(i + 1);
        i += 1;
        tick(700);
      }, delay));
    };
    tick(500);
    return () => timers.forEach(t => clearTimeout(t));
  }, [allDone, steps, projectName]);

  const liveLabel = running
    ? running.label
    : allDone
      ? 'MISSION COMPLÈTE'
      : coreDriven
        ? 'CORE · EN COURS…'
        : 'EN ATTENTE CORE…';

  return {
    visibleStreamLines,
    streamPage,
    allDone,
    running,
    liveLabel,
    uiPhase,
    pageItems,
    pageIndex,
    totalPages,
    coreDriven,
  };
}
