/**
 * Composeur — façade du Layout Engine.
 *
 * L'agent exprime une intention (région, taille) — jamais des pixels (§P3).
 * Le moteur (`layout/engine.ts`) choisit grille, spans, containment.
 * Contrat : `layout/COMPOSITION.md`
 */

export { place, surfaceCanvasStyle, roleOf } from './layout/engine';
export type { PlacedNode, PlaceOptions } from './layout/engine';
