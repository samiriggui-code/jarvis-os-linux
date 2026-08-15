/**
 * Enfants réels de N'IMPORTE QUEL nœud CodeMap (pas seulement CORE L1).
 * Regénéré par Cursor via l'export Python — voir codeMapChildren.json.
 */
import raw from './codeMapChildren.json';
import type { CoreL1Node } from './codeMapCoreL1';

type ChildNode = CoreL1Node & { primaryProcess: string };

const DATA = raw as {
  schemaVersion: string;
  childrenByParentId: Record<string, ChildNode[]>;
};

/** parentId = id process ("core") ou id CodeMap ("repo:core/jarvis_core/architecture"). */
export function childrenOf(parentId: string): ChildNode[] {
  return DATA.childrenByParentId[parentId] ?? [];
}

export function hasChildren(parentId: string): boolean {
  return childrenOf(parentId).length > 0;
}
