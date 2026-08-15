import type { GraphNode } from '../types';
import { ArchitectureAgenticPanel } from './ui/ArchitectureAgenticPanel';

/** Compat — ancien API `{ focusNode }` → panneau inspect. */
export function ArchitecturePanels({ focusNode }: { focusNode?: GraphNode | null }) {
  const focusState = focusNode
    ? ({ mode: 'inspect', processId: focusNode.id } as const)
    : ({ mode: 'overview' } as const);
  return <ArchitectureAgenticPanel focusState={focusState} focusNode={focusNode} />;
}

export { ArchitectureAgenticPanel } from './ui/ArchitectureAgenticPanel';
