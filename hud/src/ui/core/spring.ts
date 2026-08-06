/**
 * Intégrateur ressort — sans dépendance.
 *
 * Le HUD embarque déjà `motion`, mais celui-ci pilote des composants React et
 * redéclenche du rendu. Pour ce qui s'écrit dans le DOM à chaque frame (fond
 * ambiant, révélation de texte, halo d'orbe), on veut une valeur physique nue
 * que la boucle partagée fait avancer, sans jamais repasser par React.
 *
 * Euler semi-implicite : stable aux pas de temps qui nous intéressent, et
 * exactement le même vocabulaire (`tension` / `friction` / `mass`) que les
 * bibliothèques à ressorts habituelles, pour que les réglages se transposent.
 */

export interface SpringConfig {
  /** Raideur. Plus haut = plus rapide, plus nerveux. */
  tension: number;
  /** Amortissement. Plus haut = moins de rebond. */
  friction: number;
  mass: number;
  /** Distance sous laquelle le ressort est considéré arrivé. */
  precision: number;
}

export const SPRING_PRESETS = {
  /** Réponse d'interface courante. */
  default: { tension: 170, friction: 26, mass: 1, precision: 0.001 },
  /** Lent et lourd — dérives de fond, changements d'ambiance. */
  ambient: { tension: 28, friction: 18, mass: 1.4, precision: 0.0005 },
  /** Vif sans rebond — révélations de texte. */
  reveal: { tension: 210, friction: 30, mass: 1, precision: 0.001 },
  /** Réactif au signal vocal. */
  voice: { tension: 320, friction: 22, mass: 0.7, precision: 0.001 },
} as const satisfies Record<string, SpringConfig>;

export class Spring {
  value: number;
  target: number;
  velocity = 0;
  private config: SpringConfig;

  constructor(initial = 0, config: SpringConfig = SPRING_PRESETS.default) {
    this.value = initial;
    this.target = initial;
    this.config = config;
  }

  setConfig(config: Partial<SpringConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Vise une nouvelle valeur ; le ressort y va à sa vitesse. */
  to(target: number): void {
    this.target = target;
  }

  /** Saute à la valeur sans animer — mouvement réduit, remise à zéro, premier rendu. */
  set(value: number): void {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  get settled(): boolean {
    return (
      Math.abs(this.target - this.value) < this.config.precision &&
      Math.abs(this.velocity) < this.config.precision
    );
  }

  /**
   * Avance d'un pas.
   * @param deltaMs delta en millisecondes (celui que fournit le ticker).
   * @returns la nouvelle valeur.
   */
  step(deltaMs: number): number {
    const { tension, friction, mass, precision } = this.config;

    // Sous-échantillonnage : au-delà de ~16 ms par pas, un ressort raide
    // diverge. On subdivise plutôt que de brider la raideur.
    const dt = deltaMs / 1000;
    const steps = Math.max(1, Math.ceil(dt / 0.016));
    const h = dt / steps;

    for (let i = 0; i < steps; i++) {
      const displacement = this.value - this.target;
      const acceleration = (-tension * displacement - friction * this.velocity) / mass;
      this.velocity += acceleration * h;
      this.value += this.velocity * h;
    }

    if (
      Math.abs(this.target - this.value) < precision &&
      Math.abs(this.velocity) < precision
    ) {
      this.value = this.target;
      this.velocity = 0;
    }

    return this.value;
  }
}

/** Interpolation linéaire. */
export const lerp = (start: number, end: number, t: number): number =>
  start + (end - start) * t;

/**
 * Lissage exponentiel indépendant du framerate.
 *
 * `smoothed += (raw - smoothed) * k` est le lissage habituel, mais il accélère
 * quand le framerate monte. Ce facteur corrigé garde la même sensation que le
 * fond tourne à 30 ou 120 fps.
 */
export const dampingFactor = (base: number, deltaMs: number): number =>
  1 - Math.pow(1 - base, (deltaMs / 1000) * 60);

/** Ramène une valeur dans un intervalle. */
export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

/**
 * Reprojette une valeur d'un intervalle vers un autre, en bornant l'entrée.
 * C'est ce qui donne à chaque unité (lettre, mot, étoile) sa propre fenêtre
 * dans une progression globale de 0 à 1.
 */
export const remap = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => {
  if (inMax === inMin) return outMin;
  const t = clamp((value - inMin) / (inMax - inMin));
  return outMin + t * (outMax - outMin);
};
