import type { MissionDevStep } from '../../context/AppContext';

export function missionDevProgressPct(steps: MissionDevStep[]) {
  if (!steps.length) return 0;
  const done = steps.filter(s => s.status === 'done').length;
  const running = steps.some(s => s.status === 'running') ? 0.4 : 0;
  return Math.min(100, Math.round(((done + running) / steps.length) * 100));
}

export function logLinesForStep(step: MissionDevStep, projectName: string): string[] {
  const p = projectName || 'projet';
  const map: Record<string, string[]> = {
    memory: [
      `>> alloc mémoire · ${p}`,
      `>> schema DB.projects.insert(…)`,
      `>> index vectoriel prêt`,
    ],
    hermes: [
      `>> Hermès · analyse intent`,
      `>> route → agent.dev`,
      `>> policy check · info`,
    ],
    'agent-dev': [
      `>> Agent Dev · scaffold`,
      `>> workspace · ${p}/`,
      `>> deps resolve (sim)`,
    ],
    cursor: [
      `>> Cursor · open workspace`,
      `>> context pack · ${p}`,
      `>> rules + agents.md`,
    ],
    git: [
      `>> git init`,
      `>> remote · ready`,
      `>> branch main`,
    ],
    ready: [
      `>> handshake complete`,
      `>> ${p} · prêt développement`,
    ],
  };
  return map[step.id] || [`>> ${step.label}`];
}
