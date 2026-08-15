import * as THREE from 'three';
import { childrenForNode } from './childrenForNode';
import {
  cameraDistanceForBounds,
  coreTerritoryBounds,
  layoutCoreTerritory,
} from './coreTerritoryLayout';
import { processWorldPosition } from './processWorldPositions';
import type { CoreL1Node } from './codeMapCoreL1';

export type StackFrame = {
  nodeId: string;
  position: THREE.Vector3;
  children: CoreL1Node[];
  childPositions: Map<string, THREE.Vector3>;
  bounds: { center: THREE.Vector3; radius: number };
  cameraDistance: number;
};

/**
 * Résout position + cadrage de CHAQUE palier d'une pile de navigation,
 * quelle que soit sa profondeur. Générique — ignore totalement "CORE" /
 * "architecture" : depth 1 se positionne via processWorldPosition, toute
 * profondeur suivante via le layout des enfants du palier précédent.
 * S'arrête proprement si un nœud n'a pas de position résolvable (pile
 * plus profonde que les données disponibles).
 */
export function resolveStackFrames(stack: string[]): StackFrame[] {
  const frames: StackFrame[] = [];
  let parentPosition: THREE.Vector3 | null = null;
  let parentId: string | null = null;

  for (const nodeId of stack) {
    let position: THREE.Vector3 | null = null;

    if (parentId === null) {
      const p = processWorldPosition(nodeId);
      if (p) position = new THREE.Vector3(p[0], p[1], p[2]);
    } else if (parentPosition) {
      const siblings = childrenForNode(parentId);
      const layout = layoutCoreTerritory(siblings, [parentPosition.x, parentPosition.y, parentPosition.z]);
      position = layout.get(nodeId) ?? null;
    }

    if (!position) break;

    const children = childrenForNode(nodeId);
    const childPositions = children.length
      ? layoutCoreTerritory(children, [position.x, position.y, position.z])
      : new Map<string, THREE.Vector3>();
    const bounds = children.length
      ? coreTerritoryBounds([position.x, position.y, position.z], childPositions.values())
      : { center: position.clone(), radius: 0.42 };
    const cameraDistance = cameraDistanceForBounds(bounds.radius);

    frames.push({ nodeId, position, children, childPositions, bounds, cameraDistance });
    parentPosition = position;
    parentId = nodeId;
  }

  return frames;
}
