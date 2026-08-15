/** REUSE — `agentic/library/VerificationCard.tsx` (existe déjà exactement). */
import { VerificationCard as LibraryVerificationCard } from '../../library/VerificationCard';
import { adaptLibraryComponent } from '../shared/adaptLibraryComponent';

const Adapted = adaptLibraryComponent(LibraryVerificationCard, 'pending');

export interface VerificationCardProps {
  proposition?: string;
  action_requested?: string;
  action_executed?: string;
  result_observed?: string;
  result_validated?: string;
  outcome?: 'verified' | 'disputed' | 'pending' | string;
}

export function VerificationCard(props: VerificationCardProps) {
  return <Adapted props={{ ...props }} state={props.outcome ?? 'pending'} />;
}

export default VerificationCard;
