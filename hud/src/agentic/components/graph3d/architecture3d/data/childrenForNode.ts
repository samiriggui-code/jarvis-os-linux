import { coreL1Nodes, type CoreL1Node } from './codeMapCoreL1';
import { childrenOf } from './codeMapChildren';

/**
 * Enfants d'un nœud, quelle que soit sa profondeur — process ou nœud
 * CodeMap. 'core' utilise le dataset déjà validé visuellement
 * (codeMapCoreL1, export dédié) ; tout le reste utilise le dataset
 * générique childrenByParentId (codeMapChildren).
 *
 * Note pipeline : les deux exports Python ne sont pas encore parfaitement
 * unifiés (codeMapCoreL1 place les fichiers "vrac" de jarvis_core/
 * directement sous CORE ; codeMapChildren garde jarvis_core/ comme
 * dossier à part). Écart connu, pas résolu ici — hors périmètre moteur.
 */
export function childrenForNode(nodeId: string): CoreL1Node[] {
  if (nodeId === 'core') return coreL1Nodes();
  return childrenOf(nodeId);
}