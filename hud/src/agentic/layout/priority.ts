/**
 * Priorité + échelle de dégradation du Layout Engine.
 *
 * Une seule échelle numérique (0–100) partout — c'est aussi celle déjà posée
 * (mais jamais lue) par `ComponentDefinition.priority` côté registre
 * production, ce qui fait de `LayoutNode.priority` un champ directement
 * réutilisable par un futur adaptateur V2, sans table de conversion.
 *
 * `SpatialPriority`/`allocateMetricSpans` viennent de `layout/motion.ts` (code
 * mort, zéro appelant) — relocalisés ici plutôt que supprimés : c'est la seule
 * logique d'allocation proportionnelle par priorité déjà écrite dans ce dépôt.
 * Pas câblés dans `solver.ts` (l'échelle de dégradation par paliers discrets
 * suffit à tous les scénarios requis) — gardés comme primitive pure documentée
 * pour un futur mode « répartir l'espace restant proportionnellement ».
 */

export type DegradeTier = 'preferred' | 'compact' | 'collapsed' | 'hidden';

export const DEGRADE_LADDER: readonly DegradeTier[] = ['preferred', 'compact', 'collapsed', 'hidden'];

export function nextLadderStep(tier: DegradeTier): DegradeTier | null {
  const idx = DEGRADE_LADDER.indexOf(tier);
  if (idx === -1 || idx === DEGRADE_LADDER.length - 1) return null;
  return DEGRADE_LADDER[idx + 1];
}

/* ── Relocalisé depuis motion.ts (code mort à l'origine) ──────────────────── */

/** Priorité spatiale qualitative — pont possible vers l'échelle numérique 0–100. */
export type SpatialPriority = 'high' | 'normal' | 'low' | 'minimized';

export function priorityWeight(p: SpatialPriority): number {
  switch (p) {
    case 'high':
      return 3;
    case 'normal':
      return 2;
    case 'low':
      return 1;
    case 'minimized':
      return 0;
  }
}

/**
 * Réalloue `totalCols` colonnes entre N métriques selon priorité.
 * high prend le surplus ; minimized → 0. Non utilisé par `solve()` en V1 —
 * conservé comme primitive testée pour un futur mode d'allocation proportionnelle.
 */
export function allocateMetricSpans(priorities: SpatialPriority[], totalCols = 12): number[] {
  const weights = priorities.map(priorityWeight);
  const active = weights.reduce((a, b) => a + b, 0);
  if (active <= 0) return priorities.map(() => 0);
  const raw = weights.map((w) => (w / active) * totalCols);
  const floors = raw.map((n) => Math.floor(n));
  let rem = totalCols - floors.reduce((a, b) => a + b, 0);
  const frac = raw.map((n, i) => ({ i, f: n - floors[i] })).sort((a, b) => b.f - a.f);
  const out = [...floors];
  for (let k = 0; k < rem; k++) out[frac[k % frac.length].i] += 1;
  for (let i = 0; i < out.length; i++) {
    if (weights[i] > 0 && out[i] < 2) out[i] = 2;
  }
  let sum = out.reduce((a, b) => a + b, 0);
  while (sum > totalCols) {
    const idx = out.indexOf(Math.max(...out));
    if (out[idx] <= 2) break;
    out[idx] -= 1;
    sum -= 1;
  }
  return out;
}
