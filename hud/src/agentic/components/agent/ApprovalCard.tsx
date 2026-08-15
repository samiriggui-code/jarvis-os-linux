/** REUSE — `agentic/library/ApprovalCard.tsx` (existe déjà exactement). Typiquement monté dans `visual/glass::GlassOverlay`. */
import { ApprovalCard as LibraryApprovalCard } from '../../library/ApprovalCard';
import { adaptLibraryComponent } from '../shared/adaptLibraryComponent';

const Adapted = adaptLibraryComponent(LibraryApprovalCard, 'pending');

export interface ApprovalCardProps {
  approvalId: string;
  action: string;
  gravity: string;
  reason?: string;
  onIntent?: (action: string, payload?: Record<string, unknown>) => void;
}

export function ApprovalCard({ approvalId, action, gravity, reason, onIntent }: ApprovalCardProps) {
  return <Adapted props={{ approvalId, action, gravity, reason }} onIntent={onIntent} />;
}

export default ApprovalCard;
