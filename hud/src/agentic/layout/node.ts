/**
 * LayoutNode — vocabulaire commun du Layout Engine.
 *
 * Contraintes DIMENSIONNELLES (px), jamais des spans de colonnes : le système
 * de colonnes est un détail de rendu (`gridRenderer.ts`), jamais le contrat du
 * moteur. `solve()` (`solver.ts`) ne connaît que ce fichier + `priority.ts`.
 *
 * Conçu pour être réutilisable en V2 : `region`/`children` existent déjà (non
 * utilisés par le solveur V1, sections plates dans la simulation) pour qu'un
 * futur adaptateur `SurfaceComponent → LayoutNode` soit une copie de champs,
 * jamais une refonte de ce type.
 *
 * Zéro import React/DOM/CSS — doit être testable en isolation totale.
 */

import type { Region } from '../protocol/surface';
import type { SectionChromeState } from './tokens';
import type { SizeClass } from './responsivePack';

export interface SizeConstraint {
  minWidth: number;
  preferredWidth: number;
  maxWidth?: number;
  minHeight: number;
  preferredHeight: number;
  maxHeight?: number;
  /**
   * Largeur/hauteur cible quand fixé — le solveur couple alors les deux
   * dimensions au lieu de les dériver indépendamment à chaque palier.
   * Ignoré à l'état `collapsed` (bandeau header-only, l'aspect n'a pas de sens).
   */
  aspectRatio?: number;
}

/**
 * Comportement d'un nœud à l'état `expanded`. `'fill'` = comportement V1
 * historique (pleine largeur, hauteur = min(preferredHeight, availableHeight)).
 * `'preserveAspect'` respecte `constraint.aspectRatio` (contain, centré).
 * `'center'|'horizontal'|'vertical'` : type déclaré, non implémenté en V1 —
 * retombent sur `'fill'` avec un avertissement dev-only (aucun composant de
 * cette passe n'en a besoin ; ne pas sur-construire par anticipation).
 */
export type ExpandBehavior = 'fill' | 'preserveAspect' | 'center' | 'horizontal' | 'vertical';

export interface LayoutNode {
  id: string;
  /** sim : `Sec.kind` · V2 : `SurfaceComponent.name`. */
  kind: string;
  chromeState: SectionChromeState;
  /** 0–100, une seule échelle numérique (même échelle que `ComponentDefinition.priority`). */
  priority: number;
  constraint: SizeConstraint;
  /** Lu uniquement si `chromeState === 'expanded'`. Non défini = `'fill'` (rétro-compatible à 100 %). */
  expandBehavior?: ExpandBehavior;
  /** Non lu par le solveur V1 — présent pour qu'un mapper V2 copie `SurfaceComponent.region` sans redesign. */
  region?: Region;
  /** Non lu par le solveur V1 — sections plates dans la simulation. */
  children?: string[];
  /** Sac de données d'affichage (titre, tone…). Jamais lu par le solveur, seulement par le rendu. */
  meta?: Record<string, unknown>;
}

/**
 * Table `SizeClass → SizeConstraint`, valeurs de départ approximant les
 * ratios actuels de `wantedSpan` à une largeur de viewport typique.
 * `xl` (expanded) est résolu dynamiquement par le solveur (remplit l'espace
 * disponible), pas par cette table.
 */
export const SIZE_CONSTRAINTS: Record<Exclude<SizeClass, 'xl'>, SizeConstraint> = {
  sm: { minWidth: 160, preferredWidth: 220, maxWidth: 320, minHeight: 90, preferredHeight: 130, maxHeight: 220 },
  md: { minWidth: 260, preferredWidth: 360, maxWidth: 520, minHeight: 140, preferredHeight: 200, maxHeight: 360 },
  lg: { minWidth: 380, preferredWidth: 520, maxWidth: 760, minHeight: 200, preferredHeight: 280, maxHeight: 480 },
};

export function constraintForSize(size: SizeClass): SizeConstraint {
  if (size === 'xl') {
    // Résolu par le solveur (remplit availableWidth/availableHeight) — cette
    // table sert seulement de point de départ raisonnable si consultée hors solveur.
    return { minWidth: 320, preferredWidth: 760, minHeight: 220, preferredHeight: 480 };
  }
  return SIZE_CONSTRAINTS[size];
}
