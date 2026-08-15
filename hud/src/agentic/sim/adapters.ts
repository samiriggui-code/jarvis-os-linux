/**
 * Sec → LayoutNode — SEUL endroit de mapping spécifique à la simulation.
 * Volontairement hors de `layout/node.ts` : un futur adaptateur
 * `SurfaceComponent → LayoutNode` (V2, production) doit pouvoir vivre à côté
 * sans jamais toucher au modèle lui-même.
 */

import type { Sec } from './AgenticDemoStage';
import { constraintForSize, type LayoutNode } from '../layout/node';
import { CAPABILITIES_BY_KIND, capabilitiesToNode } from '../components/capabilities';

/**
 * Priorité statique par id — déterministe, pas calculée (V1 n'a pas
 * d'heuristique). Ancrée sur l'exemple de la demande : Terminal 90, CPU 80,
 * RAM 70, Network 40 — étendue au reste du catalogue de la démo.
 */
const PRIORITY_BY_ID: Record<string, number> = {
  term: 90,
  metrics: 85,
  cpu: 80,
  app: 75,
  ram: 70,
  fleet: 60,
  cam: 55,
  gpu: 50,
  net: 40,
  ha: 35,
  voice: 30,
  disk: 20,
};

const DEFAULT_PRIORITY = 50;

export function secToNode(s: Sec): LayoutNode {
  const meta = { title: s.title, subtitle: s.subtitle, tone: s.tone, entering: s.entering };
  const caps = CAPABILITIES_BY_KIND[s.kind];
  if (caps) {
    return capabilitiesToNode(s.id, s.kind, caps, s.state, meta);
  }
  return {
    id: s.id,
    kind: s.kind,
    chromeState: s.state,
    priority: PRIORITY_BY_ID[s.id] ?? DEFAULT_PRIORITY,
    constraint: constraintForSize(s.size),
    meta,
  };
}
