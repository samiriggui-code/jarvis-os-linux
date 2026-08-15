/** REUSE — `agentic/library/Primitives.tsx::StatusBadge` (existe déjà exactement), enveloppé à props plates. */
import { StatusBadge } from '../../library/Primitives';
import { adaptLibraryComponent } from '../shared/adaptLibraryComponent';

const Adapted = adaptLibraryComponent(StatusBadge, 'unknown');

export interface StatusIndicatorProps {
  status: string;
  label?: string;
}

export function StatusIndicator({ status, label }: StatusIndicatorProps) {
  return <Adapted props={{ status, label }} />;
}

export default StatusIndicator;
