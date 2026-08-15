/**
 * Contrat de composition Agentic HUD — résumé exécutable.
 * Source narrative : message Samir « AGENTIC HUD — CONTRAT DE SIMULATION ».
 *
 * CONTENU > CONTAINMENT > LAYOUT > ESTHÉTIQUE
 * Agent = quoi / priorité · Layout Engine = où / taille / grille · Motion = transitions
 * Jamais de coords pixel côté agent · Jamais de scroll dans la surface HUD.
 */

export const LAYOUT_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const LAYOUT_RADIUS = {
  sm: 10,
  md: 14,
  lg: 18,
} as const;

/** Densité informationnelle d’une section / d’un tile. */
export type InfoDensity = 'compact' | 'standard' | 'detailed' | 'focus';

/** États section (conteneur interactif). */
export type SectionChromeState = 'normal' | 'collapsed' | 'expanded';

export type LayoutRole =
  | 'metric' // carte KPI — colonne égale
  | 'panel' // panneau contenu
  | 'detail' // focus détail
  | 'chrome' // header / badge — hug
  | 'fill'; // occupe l’espace restant de la section

/** Colonnes CSS grid (12). */
export function spanForRole(role: LayoutRole, density: InfoDensity, sectionExpanded: boolean): number {
  if (role === 'chrome') return 0; // fit-content, hors span
  if (role === 'metric') {
    if (density === 'focus') return sectionExpanded ? 8 : 6;
    if (density === 'detailed') return 4;
    return 4; // 3 métriques = 12
  }
  if (role === 'detail') return sectionExpanded ? 12 : 8;
  if (role === 'fill') return 12;
  // panel
  if (density === 'compact') return 4;
  if (density === 'detailed' || density === 'focus') return 8;
  return 6;
}
