/** REUSE — `agentic/library/ToolCall.tsx` (existe déjà exactement). */
import { ToolCall as LibraryToolCall } from '../../library/ToolCall';
import { adaptLibraryComponent } from '../shared/adaptLibraryComponent';

const Adapted = adaptLibraryComponent(LibraryToolCall, 'started');

export interface ToolCallProps {
  intent: string;
  owner: string;
  status: string;
  duration_ms?: number;
  summary?: string;
}

export function ToolCall({ intent, owner, status, duration_ms, summary }: ToolCallProps) {
  return <Adapted props={{ intent, owner, status, duration_ms, summary }} state={status} />;
}

export default ToolCall;
