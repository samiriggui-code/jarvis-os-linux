/**
 * Consommateur HUD de `tool_event` + snapshot Core.
 * Le journal reste dans le Core ; ici on visualise seulement.
 */
import { useEffect, useState } from 'react';
import { getCoreClient } from './coreClient';

export interface ToolTimelineEntry {
  type?: string;
  event?: string;
  intent?: string;
  stage?: string;
  owner?: string;
  tool?: string;
  toolset?: string;
  run_id?: string;
  status?: string;
  duration_ms?: number;
  summary?: string;
  device_id?: string;
  route?: Record<string, unknown>;
}

type Listener = (events: ToolTimelineEntry[]) => void;

const MAX = 80;
let events: ToolTimelineEntry[] = [];
const listeners = new Set<Listener>();
let booted = false;

function emit() {
  listeners.forEach((fn) => fn(events));
}

function push(entry: ToolTimelineEntry) {
  const key = `${entry.run_id || ''}:${entry.event || entry.stage || ''}:${entry.intent || ''}:${entry.tool || ''}`;
  const last = events[events.length - 1];
  const lastKey = last
    ? `${last.run_id || ''}:${last.event || last.stage || ''}:${last.intent || ''}:${last.tool || ''}`
    : '';
  if (key && key === lastKey) {
    events = [...events.slice(0, -1), entry];
  } else {
    events = [...events, entry].slice(-MAX);
  }
  emit();
}

export function getToolTimeline(): ToolTimelineEntry[] {
  return events;
}

export function subscribeToolTimeline(fn: Listener): () => void {
  listeners.add(fn);
  fn(events);
  return () => { listeners.delete(fn); };
}

function asEntry(raw: unknown): ToolTimelineEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    type: 'tool_event',
    event: typeof o.event === 'string' ? o.event : undefined,
    intent: typeof o.intent === 'string' ? o.intent : undefined,
    stage: typeof o.stage === 'string' ? o.stage : undefined,
    owner: typeof o.owner === 'string' ? o.owner : undefined,
    tool: typeof o.tool === 'string' ? o.tool : undefined,
    toolset: typeof o.toolset === 'string' ? o.toolset : undefined,
    run_id: typeof o.run_id === 'string' ? o.run_id : undefined,
    status: typeof o.status === 'string' ? o.status : undefined,
    duration_ms: typeof o.duration_ms === 'number' ? o.duration_ms : undefined,
    summary: typeof o.summary === 'string' ? o.summary : undefined,
    device_id: typeof o.device_id === 'string' ? o.device_id : undefined,
    route: o.route && typeof o.route === 'object' ? o.route as Record<string, unknown> : undefined,
  };
}

export function bootToolTimelineStore(): void {
  if (booted) return;
  booted = true;
  getCoreClient().subscribe((data) => {
    if (data.type === 'tool_event') {
      const entry = asEntry(data);
      if (entry) push(entry);
      return;
    }
    if (data.type === 'tool_timeline_snapshot' || data.type === 'tool_timeline') {
      const list = Array.isArray(data.events) ? data.events : [];
      events = list.map(asEntry).filter((e): e is ToolTimelineEntry => e !== null).slice(-MAX);
      emit();
    }
  });
}

export function requestToolTimelineSnapshot(): void {
  getCoreClient().send({ type: 'tool_timeline', action: 'snapshot', limit: 50 });
}

export function useToolTimeline(): ToolTimelineEntry[] {
  const [list, setList] = useState<ToolTimelineEntry[]>(events);
  useEffect(() => subscribeToolTimeline(setList), []);
  return list;
}
