/**
 * Dataset L1 CORE — CodeMap réel (contains-only V1).
 * Regénérer : cd hud && npm run graph3d:core-l1
 */
import raw from './codeMapCoreL1.json';

export type CoreL1Node = {
  id: string;
  name: string;
  path: string;
  kind: 'directory' | 'file';
  descendantFiles: number;
  /** sqrt(descendantFiles + 1) — compression visuelle, stats réelles intactes. */
  visualWeight: number;
};

const DATA = raw as {
  schemaVersion: string;
  processId: string;
  processLabel: string;
  fileCount: number;
  visualWeightNote: string;
  nodes: CoreL1Node[];
};

export function coreL1Nodes(): CoreL1Node[] {
  return DATA.nodes;
}

export function coreL1Directories(): CoreL1Node[] {
  return DATA.nodes.filter((n) => n.kind === 'directory');
}

export function coreL1FileCount(): number {
  return DATA.fileCount;
}

export function coreL1Label(): string {
  return DATA.processLabel;
}
