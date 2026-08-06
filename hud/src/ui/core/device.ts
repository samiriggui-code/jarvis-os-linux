/**
 * Palier machine — décidé une fois, à la construction.
 *
 * Un module, une décision. Tout ce qui a un budget (densité de particules,
 * pixel ratio, framerate cible, effets de flou) lit ici, pour que les valeurs
 * ne puissent pas dériver les unes des autres.
 *
 * Le HUD ne tourne pas sur des téléphones : il tourne en kiosque sur le NUC,
 * parfois sur une tablette murale, parfois sur un portable de dev. Le vrai axe
 * n'est donc pas « mobile / desktop » mais « combien de fragments cette machine
 * peut peindre ». On le déduit du GPU annoncé, des cœurs, de la mémoire et de
 * la surface à remplir — pas de la largeur de fenêtre seule.
 */

export type DeviceTier = 'low' | 'medium' | 'high';

export interface DeviceProfile {
  tier: DeviceTier;
  /** Pixel ratio à appliquer aux canvas — jamais `devicePixelRatio` brut. */
  dpr: number;
  /** Écart minimal entre frames (ms) pour les couches d'ambiance. `0` = libre. */
  ambientFrameBudget: number;
  /** Le pointeur est-il un vrai pointeur fin (souris) ? */
  hasFinePointer: boolean;
  /** L'utilisateur a demandé moins de mouvement au niveau système. */
  reducedMotion: boolean;
}

const readTier = (): DeviceTier => {
  if (typeof window === 'undefined') return 'medium';

  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const coarsePointer = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  // Un 4K en plein écran quadruple la charge de remplissage à densité égale.
  const pixels = window.innerWidth * window.innerHeight;

  // `saveData` et une mémoire très basse sont les seuls indices exposés au web
  // d'un appareil bridé ; iOS n'expose pas son mode économie d'énergie.
  const saveData =
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

  if (saveData || memory <= 2 || cores <= 2 || (coarsePointer && pixels < 1_200_000)) {
    return 'low';
  }
  if (cores >= 8 && memory >= 8 && pixels < 4_000_000) return 'high';
  return 'medium';
};

const readReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TIER_DPR: Record<DeviceTier, [min: number, max: number]> = {
  // Sous 1.0 le rendu reste acceptable pour des halos doux, mais le HUD
  // affiche aussi des traits fins : on ne descend pas en dessous de 1.
  low: [1, 1],
  medium: [1, 1.25],
  high: [1, 1.5],
};

const TIER_AMBIENT_BUDGET: Record<DeviceTier, number> = {
  low: 1000 / 30,
  medium: 1000 / 45,
  high: 0,
};

let cached: DeviceProfile | null = null;

/**
 * Profil machine, calculé une fois et mémorisé.
 *
 * Une machine ne change pas de palier en cours de session, et reconstruire les
 * tampons à chaque redimensionnement coûte plus cher que l'écart qu'on
 * corrigerait. Seul `reducedMotion` est relu, parce qu'il peut réellement
 * changer pendant la session et que c'est une promesse d'accessibilité.
 */
export const getDeviceProfile = (): DeviceProfile => {
  if (!cached) {
    const tier = readTier();
    const [dprMin, dprMax] = TIER_DPR[tier];
    cached = {
      tier,
      dpr:
        typeof window === 'undefined'
          ? 1
          : Math.min(Math.max(window.devicePixelRatio || 1, dprMin), dprMax),
      ambientFrameBudget: TIER_AMBIENT_BUDGET[tier],
      hasFinePointer:
        typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches,
      reducedMotion: readReducedMotion(),
    };
  }
  return { ...cached, reducedMotion: readReducedMotion() };
};

/**
 * Met une valeur à l'échelle du palier.
 * `scaleForTier({ low: 40, medium: 90, high: 160 })`
 */
export const scaleForTier = <T>(values: Record<DeviceTier, T>): T =>
  values[getDeviceProfile().tier];

/** Réinitialise le cache — utilisé par les tests et le rechargement à chaud. */
export const resetDeviceProfile = (): void => {
  cached = null;
};
