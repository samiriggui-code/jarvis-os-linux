/**
 * Policy approval → toast dual-CTA (Autoriser / Refuser).
 * Complète ApprovalCard surface quand la surface n'est pas au premier plan.
 */
import { getCoreClient } from '../bridge/coreClient';
import { toast } from './api';

const toastByApprovalId = new Map<string, string>();

export type ApprovalToastInput = {
  approvalId: string;
  /** Intention / action en attente (ex. home.control). */
  action: string;
  gravity?: string;
  reason?: string;
  runId?: string;
};

function sendDecision(approvalId: string, granted: boolean, runId?: string): void {
  try {
    const client = getCoreClient();
    client.send({
      type: 'surface',
      action: 'approval',
      approval_id: approvalId,
      granted,
    });
    if (runId) {
      client.send({
        type: 'approval_decision',
        run_id: runId,
        approval_id: approvalId,
        decision: granted ? 'allow' : 'deny',
      });
    }
  } catch {
    /* Core offline */
  }
}

/** Affiche (ou met à jour) un toast sticky Autoriser / Refuser. */
export function applyApprovalToast(input: ApprovalToastInput): string {
  const { approvalId, action, gravity, reason, runId } = input;
  const detail = [gravity ? `[${gravity}]` : null, reason].filter(Boolean).join(' ');
  const message = detail ? `${action} — ${detail}` : action;

  const decide = (granted: boolean) => {
    sendDecision(approvalId, granted, runId);
    const id = toastByApprovalId.get(approvalId);
    if (id) toast.dismiss(id);
    toastByApprovalId.delete(approvalId);
  };

  const existing = toastByApprovalId.get(approvalId);
  if (existing) {
    toast.update(existing, {
      type: 'warning',
      title: 'Autorisation requise',
      message,
      durationMs: null,
      action: { label: 'Autoriser', onClick: () => decide(true) },
      secondaryAction: { label: 'Refuser', onClick: () => decide(false) },
    });
    return existing;
  }

  const id = toast.action({
    type: 'warning',
    title: 'Autorisation requise',
    message,
    label: 'Autoriser',
    onClick: () => decide(true),
    secondaryLabel: 'Refuser',
    secondaryOnClick: () => decide(false),
  });
  toastByApprovalId.set(approvalId, id);
  return id;
}

export function dismissApprovalToast(approvalId: string): void {
  const id = toastByApprovalId.get(approvalId);
  if (id) toast.dismiss(id);
  toastByApprovalId.delete(approvalId);
}

/** Sync toast ↔ document surface (`pending.approvals`). */
export function syncApprovalToastsFromDocument(document: unknown): void {
  const doc = document as {
    pending?: { approvals?: Record<string, { intent?: string; gravity?: string; reason?: string }> };
  } | null;
  const pending = doc?.pending?.approvals ?? {};
  const live = new Set(Object.keys(pending));

  for (const [approvalId, rec] of Object.entries(pending)) {
    applyApprovalToast({
      approvalId,
      action: String(rec.intent ?? 'action'),
      gravity: rec.gravity ? String(rec.gravity) : undefined,
      reason: rec.reason ? String(rec.reason) : undefined,
    });
  }

  for (const approvalId of [...toastByApprovalId.keys()]) {
    if (!live.has(approvalId)) dismissApprovalToast(approvalId);
  }
}
