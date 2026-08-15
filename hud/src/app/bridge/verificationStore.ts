/**
 * Consommateur HUD de `surface_result.verification` (Core §7).
 * Store unique : l'événement arrive souvent avant qu'AgentSurface ne monte.
 */
import { useEffect, useState } from 'react';
import { getCoreClient } from './coreClient';
import type { VerificationCardProps } from '../../agentic/library/VerificationCard';

export type VerificationHudState = VerificationCardProps & {
  intent?: string;
  mission_id?: string;
  stage?: string;
};

type Listener = (state: VerificationHudState | null) => void;

let current: VerificationHudState | null = null;
const listeners = new Set<Listener>();
let booted = false;

export function mapVerificationPayload(raw: Record<string, unknown>): VerificationHudState {
  const validated = raw.validated === true;
  const outcomeRaw = String(raw.card_outcome || raw.outcome || '').toLowerCase();
  let outcome: VerificationCardProps['outcome'] = 'pending';
  if (validated || outcomeRaw === 'verified' || outcomeRaw === 'validated') {
    outcome = 'verified';
  } else if (outcomeRaw === 'disputed' || outcomeRaw === 'failed') {
    outcome = 'disputed';
  }

  return {
    proposition: String(raw.proposition || '').trim() || undefined,
    action_requested: String(raw.action_requested || raw.action_demanded || raw.intent || '').trim() || undefined,
    action_executed: String(raw.action_executed || raw.claimed_result || '').trim() || undefined,
    result_observed: String(raw.result_observed || raw.observed || '').trim() || undefined,
    result_validated: String(raw.result_validated || (validated ? raw.stage : '') || '').trim() || undefined,
    outcome,
    intent: String(raw.intent || '').trim() || undefined,
    mission_id: String(raw.mission_id || '').trim() || undefined,
    stage: String(raw.stage || '').trim() || undefined,
  };
}

function setState(next: VerificationHudState | null) {
  current = next;
  listeners.forEach((fn) => fn(current));
}

export function getVerification(): VerificationHudState | null {
  return current;
}

export function subscribeVerification(fn: Listener): () => void {
  listeners.add(fn);
  fn(current);
  return () => { listeners.delete(fn); };
}

export function bootVerificationStore(): void {
  if (booted) return;
  booted = true;
  getCoreClient().subscribe((data) => {
    if (data.type !== 'surface_result' && data.type !== 'terminal_result') return;
    const raw = data.verification;
    if (!raw || typeof raw !== 'object') return;
    setState(mapVerificationPayload(raw as Record<string, unknown>));
  });
}

export function useVerification(): VerificationHudState | null {
  const [state, set] = useState<VerificationHudState | null>(current);
  useEffect(() => subscribeVerification(set), []);
  return state;
}
