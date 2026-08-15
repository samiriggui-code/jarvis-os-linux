/** REUSE — `agentic/library/Primitives.tsx::DialogCard` (existe déjà exactement, renommé sémantiquement). */
import { DialogCard } from '../../library/Primitives';
import { adaptLibraryComponent } from '../shared/adaptLibraryComponent';

const Adapted = adaptLibraryComponent(DialogCard, 'idle');

export interface ConfirmationCardProps {
  dialogId: string;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolved?: boolean;
  onIntent?: (action: string, payload?: Record<string, unknown>) => void;
}

export function ConfirmationCard({ dialogId, title, body, confirmLabel, cancelLabel, resolved, onIntent }: ConfirmationCardProps) {
  return (
    <Adapted
      props={{ dialogId, title, body, confirmLabel, cancelLabel }}
      state={resolved ? 'resolved' : 'idle'}
      onIntent={onIntent}
    />
  );
}

export default ConfirmationCard;
