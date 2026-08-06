/**
 * Jetons de @jarvis/ui.
 *
 * Deux niveaux, et la règle qui les rend utiles : **seul le niveau 1 contient
 * des littéraux**, et un jeton de niveau 2 nomme un rôle, jamais une couleur.
 * `surface.raised`, pas `bleuClair`. C'est ce qui permet de changer d'ambiance
 * en éditant ce fichier plutôt qu'en cherchant `#00f5ff` dans trente autres.
 *
 * Exporté en objet JS et non en variables CSS parce que la moitié des valeurs
 * part dans des nuanceurs et des canvas, où `var()` n'existe pas.
 */

/* ── Niveau 1 : primitives ─────────────────────────────────────────────── */

const raw = {
  cyan500: '0, 245, 255',
  cyan300: '120, 250, 255',
  violet500: '168, 85, 247',
  blue500: '42, 123, 255',
  amber500: '255, 138, 76',
  red500: '255, 59, 46',
  // Vert délibérément dé-saturé : un vert néon à côté du cyan d'identité tire
  // l'œil plus fort que l'accent lui-même et casse la hiérarchie.
  green500: '96, 200, 168',

  ink900: '1, 8, 18',
  ink800: '2, 13, 26',
  ink700: '0, 20, 40',
  ink600: '4, 28, 52',

  paper100: '220, 235, 255',
  paper300: '150, 185, 215',
} as const;

/* ── Niveau 2 : rôles ──────────────────────────────────────────────────── */

export const tokens = {
  color: {
    /** Fond le plus profond — le vide derrière tout. */
    void: `rgb(${raw.ink900})`,
    /** Surface d'un panneau posé sur le vide. */
    surface: `rgba(${raw.ink700}, 0.55)`,
    /** Surface d'un panneau mis en avant. */
    surfaceRaised: `rgba(${raw.ink600}, 0.72)`,
    /** Trait de contour au repos. */
    border: `rgba(${raw.cyan500}, 0.16)`,
    /** Trait de contour d'un élément actif. */
    borderActive: `rgba(${raw.cyan500}, 0.5)`,

    /** Texte principal. */
    text: `rgba(${raw.paper100}, 0.9)`,
    /** Texte secondaire, légendes, unités. */
    textMuted: `rgba(${raw.paper300}, 0.55)`,

    /** Accent d'identité — l'attention par défaut. */
    accent: `rgb(${raw.cyan500})`,
    accentSoft: `rgba(${raw.cyan500}, 0.14)`,
    /** Accent secondaire — regroupements, catégories. */
    accentAlt: `rgb(${raw.violet500})`,

    /** États. */
    pending: `rgb(${raw.cyan300})`,
    success: `rgb(${raw.green500})`,
    warning: `rgb(${raw.amber500})`,
    danger: `rgb(${raw.red500})`,
  },

  /** Triplets RGB bruts, pour les nuanceurs et les canvas. */
  rgb: {
    accent: [0, 245, 255] as [number, number, number],
    accentAlt: [168, 85, 247] as [number, number, number],
    warning: [255, 138, 76] as [number, number, number],
    cold: [42, 123, 255] as [number, number, number],
  },

  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
  },

  space: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 20,
    xl: 28,
  },

  font: {
    display: 'Orbitron, sans-serif',
    mono: '"Share Tech Mono", monospace',
    body: 'Rajdhani, sans-serif',
  },

  /** Flou d'arrière-plan des surfaces vitrées. */
  glass: 'blur(18px)',
} as const;

/** Couleur d'un état de bloc. */
export const stateColor = (state: string): string => {
  switch (state) {
    case 'pending':
      return tokens.color.pending;
    case 'active':
      return tokens.color.accent;
    case 'success':
      return tokens.color.success;
    case 'error':
      return tokens.color.danger;
    default:
      return tokens.color.textMuted;
  }
};
