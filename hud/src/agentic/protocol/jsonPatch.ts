/**
 * JSON Patch (RFC 6902) — mises à jour incrémentales de la surface.
 *
 * Pourquoi patcher plutôt que renvoyer le document entier : un `SURFACE_DELTA`
 * qui ne touche qu'une prop laisse le reste de l'objet **identique par
 * référence**. React ne remonte donc que le composant concerné — les autres ne
 * se réinitialisent pas, ne rejouent pas leur animation d'entrée, et un canvas
 * ne perd pas son contexte WebGL.
 *
 * C'est le point du §544 : « mises à jour incrémentales — jamais reconstruire
 * toute l'UI ».
 *
 * Implémentation volontairement partielle : `add`, `replace`, `remove`. Les
 * opérations `move`, `copy` et `test` de la RFC ne servent pas à une surface et
 * ouvriraient des cas d'erreur pour rien. Une opération inconnue est rejetée,
 * jamais ignorée en silence.
 */

import type { PatchOp, SurfaceDocument } from './surface';

/**
 * Décode un segment de JSON Pointer.
 *
 * L'ordre compte : `~1` avant `~0`. L'inverse transformerait `~01` en `/`
 * au lieu de `~1`. C'est le piège classique de la RFC 6901.
 */
const decodeSegment = (segment: string): string =>
  segment.replace(/~1/g, '/').replace(/~0/g, '~');

const parsePointer = (pointer: string): string[] => {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) {
    throw new Error(`pointeur invalide (doit commencer par « / ») : ${pointer}`);
  }
  return pointer.slice(1).split('/').map(decodeSegment);
};

type Container = Record<string, unknown> | unknown[];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Copie superficielle d'un conteneur.
 *
 * Superficielle et pas profonde : c'est précisément ce qui préserve
 * l'identité des branches non touchées, donc ce qui évite les remontages.
 */
const shallowCopy = (node: Container): Container =>
  Array.isArray(node) ? [...node] : { ...node };

/**
 * Applique une opération en recopiant uniquement le chemin traversé.
 *
 * Le reste de l'arbre est partagé avec le document d'origine — d'où des
 * comparaisons par référence toujours vraies pour ce qui n'a pas bougé.
 */
const applyOne = (doc: unknown, op: PatchOp): unknown => {
  const path = parsePointer(op.path);
  if (path.length === 0) {
    if (op.op !== 'replace') throw new Error('seul « replace » est admis sur la racine');
    return op.value;
  }

  if (!isObject(doc) && !Array.isArray(doc)) {
    throw new Error(`chemin « ${op.path} » : la racine n'est pas un conteneur`);
  }

  const root = shallowCopy(doc as Container);
  let cursor: Container = root;

  // Descente jusqu'au parent de la cible, en recopiant au passage.
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const child = (cursor as Record<string, unknown>)[key];
    if (child === undefined || (!isObject(child) && !Array.isArray(child))) {
      throw new Error(`chemin « ${op.path} » : segment « ${key} » absent ou terminal`);
    }
    const copy = shallowCopy(child as Container);
    (cursor as Record<string, unknown>)[key] = copy;
    cursor = copy;
  }

  const last = path[path.length - 1];

  if (Array.isArray(cursor)) {
    // `-` désigne la fin du tableau (RFC 6902 §4.1).
    const index = last === '-' ? cursor.length : Number(last);
    if (!Number.isInteger(index) || index < 0 || index > cursor.length) {
      throw new Error(`chemin « ${op.path} » : index « ${last} » hors bornes`);
    }
    if (op.op === 'add') cursor.splice(index, 0, op.value);
    else if (op.op === 'replace') {
      if (index >= cursor.length) throw new Error(`« ${op.path} » : rien à remplacer`);
      cursor[index] = op.value;
    } else if (op.op === 'remove') {
      if (index >= cursor.length) throw new Error(`« ${op.path} » : rien à supprimer`);
      cursor.splice(index, 1);
    } else {
      throw new Error(`opération non supportée : ${(op as PatchOp).op}`);
    }
    return root;
  }

  const target = cursor as Record<string, unknown>;
  if (op.op === 'add' || op.op === 'replace') {
    // La RFC distingue les deux ; ici `replace` exige que la clé existe, ce qui
    // transforme une faute de frappe de l'agent en erreur plutôt qu'en création
    // silencieuse d'une prop fantôme.
    if (op.op === 'replace' && !(last in target)) {
      throw new Error(`« ${op.path} » : clé absente, « replace » refusé`);
    }
    target[last] = op.value;
  } else if (op.op === 'remove') {
    if (!(last in target)) throw new Error(`« ${op.path} » : clé absente, rien à supprimer`);
    delete target[last];
  } else {
    throw new Error(`opération non supportée : ${(op as PatchOp).op}`);
  }

  return root;
};

/**
 * Applique une suite d'opérations. **Tout ou rien.**
 *
 * Si une opération échoue, le document d'origine est renvoyé intact et l'erreur
 * remonte. Un patch à moitié appliqué produirait une interface incohérente que
 * personne ne pourrait diagnostiquer — mieux vaut refuser et resynchroniser.
 */
export const applyPatch = (doc: SurfaceDocument, ops: PatchOp[]): SurfaceDocument => {
  let next: unknown = doc;
  for (const op of ops) {
    next = applyOne(next, op);
  }
  return next as SurfaceDocument;
};
