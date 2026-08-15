/**
 * `profileForWidth` — colonnes de rendu dynamiques selon largeur réelle
 * (phone → 4K). Ne sert plus qu'à la quantification CSS Grid côté rendu
 * (`layout/gridRenderer.ts`) : ce n'est plus l'entrée d'espace disponible du
 * Layout Engine (`layout/solver.ts`), qui travaille en px réels
 * (`availableWidth`/`availableHeight`), jamais en budget de colonnes/lignes.
 *
 * L'ancien packer (`packSections`/`wantedSpan`, sans priorité ni min/max/
 * dégradation) a été remplacé par `layout/solver.ts` — voir
 * `docs`/le plan d'implémentation Layout Engine V1.
 */

export type SizeClass = 'sm' | 'md' | 'lg' | 'xl';

export type GridProfile = {
  /** Nom breakpoint (debug HUD) */
  bp: 'phone' | 'tablet' | 'laptop' | 'desktop' | 'qhd' | 'uhd';
  cols: number;
  gap: number;
};

/**
 * Profil de grille selon largeur du canevas (px CSS, pas devicePixelRatio).
 * 4K / UltraWide → beaucoup plus de colonnes → plus de sections côte à côte.
 */
export function profileForWidth(width: number, zoomPercent = 100): GridProfile {
  // Zoom HUD : >100% = moins de colonnes (cartes plus larges) ; <100% = denser
  const w = width / (zoomPercent / 100);

  if (w < 420) return { bp: 'phone', cols: 2, gap: 8 };
  if (w < 720) return { bp: 'tablet', cols: 4, gap: 8 };
  if (w < 1100) return { bp: 'laptop', cols: 6, gap: 10 };
  if (w < 1600) return { bp: 'desktop', cols: 12, gap: 12 };
  if (w < 2560) return { bp: 'qhd', cols: 16, gap: 12 };
  // 4K / 5K / ultrawide
  return { bp: 'uhd', cols: 24, gap: 14 };
}
