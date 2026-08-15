/** REUSE — `agentic/library/ActionRequest.tsx` (existe déjà exactement). */
import { ActionRequest as LibraryActionRequest } from '../../library/ActionRequest';
import { adaptLibraryComponent } from '../shared/adaptLibraryComponent';

const Adapted = adaptLibraryComponent(LibraryActionRequest, 'idle');

export interface ActionRequestProps {
  label: string;
  action: string;
  detail?: string;
  onIntent?: (action: string, payload?: Record<string, unknown>) => void;
}

export function ActionRequest({ label, action, detail, onIntent }: ActionRequestProps) {
  return <Adapted props={{ label, action, detail }} onIntent={onIntent} />;
}

export default ActionRequest;
