/**
 * Figures du voyage — positions ET caractère de chaque point.
 *
 * Chaque figure génère deux tableaux :
 *
 *   `pos`  — x, y, z
 *   `var`  — taille, éclat, température (froid ↔ chaud)
 *
 * ⚠ Pourquoi `var` existe. Une première version ne produisait que des
 * positions : tous les points avaient donc la même taille, le même éclat et
 * la même couleur. Résultat, des squelettes géométriques — deux bras propres,
 * trois anneaux propres — qui se lisaient comme des ébauches. Le réel n'est
 * jamais uniforme :
 *
 *   - un champ d'étoiles suit une loi de luminosité (quelques-unes très
 *     brillantes, une multitude à peine visibles) : c'est ce qui donne la
 *     profondeur ;
 *   - une galaxie a un cœur jaune, des bras bleus, des nébuleuses rouges ;
 *   - la matière s'agrège en AMAS. Du hasard uniforme, c'est de la neige de
 *     téléviseur : les étoiles naissent groupées, jamais éparpillées
 *     régulièrement.
 *
 * Ces trois dimensions — grumeau, éclat, couleur — sont ce qui sépare un
 * schéma d'une image.
 */

export type FigureId =
  | 'galaxies'
  | 'voyage'
  | 'solaire'
  | 'terre'
  | 'vague'
  | 'adn'
  | 'cerveau'
  | 'neurones'
  | 'orbe';

export const FIGURE_IDS: FigureId[] = [
  'galaxies',
  'voyage',
  'solaire',
  'terre',
  'vague',
  'adn',
  'cerveau',
  'neurones',
  'orbe',
];

export interface Figure {
  /** Positions — 3 flottants par point. */
  pos: Float32Array;
  /** Caractère — taille, éclat, température. 3 flottants par point. */
  var: Float32Array;
}

/* ── Outils ────────────────────────────────────────────────────────────── */

const TAU = Math.PI * 2;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Direction uniforme sur la sphère. `acos` est indispensable : tirer la
 * latitude à plat entasserait les points aux pôles.
 */
function randomDirection(rnd: () => number): [number, number, number] {
  const theta = rnd() * TAU;
  const phi = Math.acos(2 * rnd() - 1);
  const s = Math.sin(phi);
  return [s * Math.cos(theta), Math.cos(phi), s * Math.sin(theta)];
}

/** Tirage normal (Box-Muller) — pour disperser autour d'un centre d'amas. */
function gauss(rnd: () => number): number {
  const u = Math.max(1e-9, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rnd());
}

/**
 * Loi de luminosité — quelques points très brillants, beaucoup de faibles.
 *
 * `pow(u, 4)` sur un tirage uniforme : ~1 point sur 300 dépasse la moitié de
 * l'échelle. Sans cette queue, un champ d'étoiles paraît plat parce que rien
 * n'y accroche l'œil.
 */
const clampNum = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

function luminosity(rnd: () => number): number {
  // Queue plus dure : beaucoup de ternes, rares flashs (cliché de galaxie).
  return Math.pow(rnd(), 5.5);
}

/* ── Bruit de valeur 3D — croûte de l'orbe ─────────────────────────────── */

function hash3(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 1274126177;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1;
}

/* ── Figures ───────────────────────────────────────────────────────────── */

type Builder = (n: number, pos: Float32Array, vr: Float32Array, rnd: () => number) => void;

/**
 * Types stellaires — classification spectrale réelle.
 *
 * ⚠ C'est LE détail qui manquait. Ma première version faisait varier la
 * couleur continûment avec le rayon : cœur chaud, bras froids. Or un champ
 * d'étoiles réel n'est pas un dégradé, c'est une population très déséquilibrée
 * de types DISCRETS — trois quarts de naines orange petites et ternes, et une
 * poignée de géantes bleues grosses et éclatantes. Ce sont ces rares géantes
 * qui accrochent l'œil et donnent l'échelle ; sans elles tout se vaut et
 * l'image redevient une brume.
 *
 * Proportions et couleurs : données d'astronomie (M, K, G, F, A, B).
 */
const STAR_TYPES = [
  // temp mappé sur LUT (bleu→…→rouge→soleil). Naines ternes + rares géantes.
  { cum: 72.0, temp: 0.72, size: 0.85, bright: 0.25 }, // M — rouge/rouille
  { cum: 86.0, temp: 0.48, size: 1.05, bright: 0.4 }, // K — orange
  { cum: 94.5, temp: 0.28, size: 1.35, bright: 0.7 }, // G — or
  { cum: 98.2, temp: -0.15, size: 1.9, bright: 1.1 }, // F — blanc-crème
  { cum: 99.5, temp: -0.55, size: 2.8, bright: 1.8 }, // A — blanc-bleu
  { cum: 100.0, temp: -0.95, size: 3.8, bright: 2.6 }, // B — bleu profond
];

function starType(rnd: () => number) {
  const r = rnd() * 100;
  for (const t of STAR_TYPES) if (r <= t.cum) return t;
  return STAR_TYPES[0];
}

/**
 * Galaxie spirale — bras LISIBLES + perspective :
 * étroits au centre, plus larges à l'extérieur, couleurs dosées
 * (noyau or, bras bleu/rose, poussière ambre).
 */
const galaxies: Builder = (n, pos, vr, rnd) => {
  const ARMS = 2;
  const SPIRAL = 4.2;
  const ARM_DIST = 0.55;
  const THICK = 0.032;
  const CORE = 0.22;
  const ARM_X_MEAN = 1.38;
  const ARM_X_DIST = 0.44;
  const ARM_Z_MEAN = 0.34;
  const ARM_Z_DIST = 0.13;

  const spiral = (x: number, z: number, offset: number): [number, number] => {
    const r = Math.hypot(x, z);
    if (r < 1e-8) return [0, 0];
    const theta = offset + Math.atan2(z, x) + (r / ARM_DIST) * SPIRAL;
    return [r * Math.cos(theta), r * Math.sin(theta)];
  };

  /** 0 centre → 1 bord : largeur du bras + taille des points. */
  const radialU = (rad: number): number => smoothstep(0.12, 2.05, rad);

  /** Largeur du bras : fil près du noyau, ruban dehors. */
  const armWidth = (u: number): number => lerp(0.022, 0.155, u * u);

  const writeStar = (o: number, x: number, z: number, kind: 'core' | 'arm') => {
    const rad = Math.hypot(x, z);
    const u = radialU(rad);
    const w = armWidth(u);
    // Écarte le long de la tangente — élargit le bras sans le flouter partout
    const tang = rad > 1e-6 ? [-z / rad, x / rad] as const : [1, 0] as const;
    const side = gauss(rnd) * w;
    pos[o] = x + tang[0] * side;
    pos[o + 1] = gauss(rnd) * THICK * lerp(0.65, 1.55, u);
    pos[o + 2] = z + tang[1] * side;

    const flash = luminosity(rnd);
    if (kind === 'core') {
      vr[o] = 0.75 + flash * 0.95;
      vr[o + 1] = 1.45 + flash * 1.25;
      vr[o + 2] = lerp(0.65, 0.98, rnd()); // or / blanc chaud
      return;
    }

    // Dosage couleur le long du bras : bleu jeune dehors, rose/ambre au milieu
    const roll = rnd();
    let temp: number;
    if (u > 0.55 && roll < 0.4) temp = lerp(-0.98, -0.55, rnd()); // bleu extérieur
    else if (u > 0.35 && roll < 0.55) temp = lerp(0.45, 0.92, rnd()); // rose nébuleuse
    else if (roll < 0.7) temp = lerp(-0.25, 0.2, rnd()); // blanc
    else temp = lerp(0.2, 0.55, rnd()); // ambre poussière

    vr[o] = lerp(0.45, 1.55, Math.pow(u, 1.05)) * (0.7 + flash * 0.75);
    vr[o + 1] = lerp(0.5, 1.15, u) * (0.6 + flash * 1.1);
    vr[o + 2] = temp;
  };

  const bgN = Math.floor(n * 0.12);
  const dustN = Math.floor(n * 0.1);
  const coreN = Math.floor(n * 0.12);
  let i = 0;

  // Fond discret — remplit un peu le vide sans concurrencer la spirale
  for (; i < bgN; i++) {
    const o = i * 3;
    const ang = rnd() * TAU;
    const r = 1.9 + rnd() * 2.3;
    pos[o] = Math.cos(ang) * r;
    pos[o + 1] = (rnd() - 0.5) * 0.65;
    pos[o + 2] = Math.sin(ang) * r;
    const ht = starType(rnd);
    vr[o] = ht.size * (0.28 + rnd() * 0.25);
    vr[o + 1] = 0.05 + luminosity(rnd) * 0.32;
    vr[o + 2] = ht.temp;
  }

  const dustEnd = bgN + dustN;
  for (; i < dustEnd; i++) {
    const o = i * 3;
    const arm = Math.floor(rnd() * ARMS);
    const bx = gauss(rnd) * ARM_X_DIST + ARM_X_MEAN;
    const bz = gauss(rnd) * ARM_Z_DIST + ARM_Z_MEAN;
    const [hx, hz] = spiral(bx, bz, (arm * TAU) / ARMS);
    const rad = Math.hypot(hx, hz);
    const u = radialU(rad);
    const w = armWidth(u) * 1.35;
    const tang = rad > 1e-6 ? [-hz / rad, hx / rad] as const : [1, 0] as const;
    const side = gauss(rnd) * w;
    pos[o] = hx + tang[0] * side;
    pos[o + 1] = gauss(rnd) * THICK * lerp(0.8, 1.7, u);
    pos[o + 2] = hz + tang[1] * side;
    vr[o] = lerp(0.35, 1.25, u);
    vr[o + 1] = lerp(0.06, 0.2, u);
    vr[o + 2] = lerp(-0.25, 0.6, rnd());
  }

  const coreEnd = dustEnd + coreN;
  for (; i < coreEnd; i++) {
    writeStar(i * 3, gauss(rnd) * CORE, gauss(rnd) * CORE, 'core');
  }

  for (; i < n; i++) {
    const arm = (i - coreEnd) % ARMS;
    const bx = gauss(rnd) * ARM_X_DIST + ARM_X_MEAN;
    const bz = gauss(rnd) * ARM_Z_DIST + ARM_Z_MEAN;
    const [x, z] = spiral(bx, bz, (arm * TAU) / ARMS);
    writeStar(i * 3, x, z, 'arm');
  }
};

/**
 * Tunnel quantique — debut BRUME d etoiles, puis paroi qui se SOLIDIFIE
 * (t eleve = anneaux/lignes serres). Le flux fait voyager de l un a l autre.
 */
const voyage: Builder = (n, pos, vr, rnd) => {
  const RINGS = 64;
  const LINES = 180;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const roll = rnd();
    // Bias: plus de profondeur pour sentir la solidification en avançant
    let t = Math.pow(rnd(), 0.85);
    let ang = rnd() * TAU;

    if (t < 0.38) {
      // ZONE BRUME — entree : nuage d etoiles disperse
      const rr = 0.4 + rnd() * 1.6;
      ang = rnd() * TAU;
      const elev = (rnd() - 0.5) * 1.2;
      pos[o] = Math.cos(ang) * rr;
      pos[o + 1] = elev;
      pos[o + 2] = lerp(2.1, -0.4, t / 0.38);
      const ht = starType(rnd);
      const flash = luminosity(rnd);
      vr[o] = ht.size * (0.7 + flash);
      vr[o + 1] = ht.bright * (0.3 + flash * 1.2);
      vr[o + 2] = ht.temp;
      continue;
    }

    // ZONE SOLIDE — tunnel : paroi + lignes de fuite
    const u = (t - 0.38) / 0.62;
    if (roll < 0.22) {
      t = 0.38 + Math.floor(rnd() * RINGS) / RINGS * 0.62;
      ang = rnd() * TAU;
    } else if (roll < 0.85) {
      ang = Math.floor(rnd() * LINES) / LINES * TAU;
      t = 0.38 + rnd() * 0.62;
    } else {
      ang = rnd() * TAU;
      t = 0.38 + rnd() * 0.62;
    }

    const wall = lerp(1.35, 0.11, u);
    const nse = valueNoise(Math.cos(ang) * 2.2, Math.sin(ang) * 2.2, t * 5) * 0.04;
    const rr = wall * (0.96 + rnd() * 0.06) + nse;
    pos[o] = Math.cos(ang) * rr;
    pos[o + 1] = Math.sin(ang) * rr;
    pos[o + 2] = lerp(2.0, -3.4, t);

    const isLine = roll >= 0.22 && roll < 0.85;
    vr[o] = isLine ? 0.4 + luminosity(rnd) * 0.9 : 0.7 + luminosity(rnd) * 1.1;
    vr[o + 1] = 0.45 + u * 0.7 + luminosity(rnd) * 0.85;
    // Tunnel ref : #180a3a → #2bf0ff (indigo profond → cyan électrique)
    vr[o + 2] = lerp(-0.95, -0.35, u);
  }
};

/**
 * Systeme solaire type manuel scolaire :
 * Soleil au centre · 8 orbites concentriques · 1 planete nette par orbite
 * · anneaux de Saturne.
 */
const solaire: Builder = (n, pos, vr, rnd) => {
  const PLANETS = [
    { r: 0.55, size: 0.04, phase: 0.4, temp: -0.28 },
    { r: 0.75, size: 0.055, phase: 1.3, temp: 0.02 },
    { r: 0.95, size: 0.058, phase: 2.2, temp: -0.55 },
    { r: 1.15, size: 0.048, phase: 3.1, temp: 0.75 },
    { r: 1.4, size: 0.1, phase: 4.0, temp: 0.4 },
    { r: 1.7, size: 0.088, phase: 4.9, temp: 0.2 },
    { r: 1.95, size: 0.062, phase: 5.7, temp: -0.78 },
    { r: 2.15, size: 0.06, phase: 0.15, temp: -0.98 },
  ] as const;

  const sunN = Math.floor(n * 0.18);
  const orbitN = Math.floor(n * 0.22); // orbites bien visibles
  const ringN = Math.floor(n * 0.06);
  const planetBudget = n - sunN - orbitN - ringN;
  const perPlanet = Math.floor(planetBudget / PLANETS.length);
  let i = 0;

  // Soleil compact
  for (; i < sunN; i++) {
    const o = i * 3;
    const [dx, dy, dz] = randomDirection(rnd);
    const shell = 0.82 + Math.pow(rnd(), 0.5) * 0.18;
    const r = 0.2 * shell;
    pos[o] = dx * r;
    pos[o + 1] = dy * r;
    pos[o + 2] = dz * r;
    vr[o] = 1.15 + luminosity(rnd) * 0.9;
    vr[o + 1] = 1.7 + luminosity(rnd) * 0.7;
    vr[o + 2] = 0.95;
  }

  // Orbites — cercles fins (signature du schema scolaire)
  const orbitEnd = sunN + orbitN;
  for (; i < orbitEnd; i++) {
    const o = i * 3;
    const planet = PLANETS[i % PLANETS.length]!;
    const ang = rnd() * TAU;
    pos[o] = Math.cos(ang) * planet.r;
    pos[o + 1] = (rnd() - 0.5) * 0.008;
    pos[o + 2] = Math.sin(ang) * planet.r;
    vr[o] = 0.18 + luminosity(rnd) * 0.25;
    vr[o + 1] = 0.2 + luminosity(rnd) * 0.25;
    vr[o + 2] = -0.35;
  }

  // 8 planetes — coques denses, une par orbite
  for (let p = 0; p < PLANETS.length; p++) {
    const planet = PLANETS[p]!;
    const end = i + (p === PLANETS.length - 1 ? n - ringN - i : perPlanet);
    const cx = Math.cos(planet.phase) * planet.r;
    const cz = Math.sin(planet.phase) * planet.r;
    for (; i < end; i++) {
      const o = i * 3;
      const [dx, dy, dz] = randomDirection(rnd);
      const shell = 0.75 + Math.pow(rnd(), 0.4) * 0.25;
      const pr = planet.size * shell;
      pos[o] = cx + dx * pr;
      pos[o + 1] = dy * pr;
      pos[o + 2] = cz + dz * pr;
      vr[o] = 1.2 + luminosity(rnd) * 0.5;
      vr[o + 1] = 1.2 + luminosity(rnd) * 0.4;
      vr[o + 2] = planet.temp;
    }
  }

  // Anneaux Saturne (autour de la position de Saturne, pas du soleil)
  const sat = PLANETS[5]!;
  const sx = Math.cos(sat.phase) * sat.r;
  const sz = Math.sin(sat.phase) * sat.r;
  for (; i < n; i++) {
    const o = i * 3;
    const a = rnd() * TAU;
    const ringR = sat.size * lerp(1.35, 2.05, rnd());
    pos[o] = sx + Math.cos(a) * ringR;
    pos[o + 1] = (rnd() - 0.5) * 0.008;
    pos[o + 2] = sz + Math.sin(a) * ringR;
    vr[o] = 0.45 + luminosity(rnd) * 0.4;
    vr[o + 1] = 0.55 + luminosity(rnd) * 0.3;
    vr[o + 2] = 0.18;
  }
};

/**
 * Terre — globe océan / continents / calottes, Afrique face (+Z).
 *
 * Sampling uniforme sur la sphère + masques continentaux organiques
 * (SDF + bruit côte). Pas de quotas forcés : ça faisait des pastilles.
 */
const terre: Builder = (n, pos, vr, rnd) => {
  const R = 0.98;

  /** Score terre > 0 = continent. */
  const landScore = (lon: number, lat: number): number => {
    let best = -1;

    // Afrique — larme (large au nord, fine au sud), face caméra
    {
      const u = (lon - 0.18) / 0.58;
      const v = (lat - 0.02) / 0.78;
      const tear = Math.max(0, -v) * 0.55;
      const d = 1.0 - (u * u * (1.0 + tear) + v * v);
      best = Math.max(best, d);
    }
    // Europe
    {
      const u = (lon - 0.15) / 0.32;
      const v = (lat - 0.88) / 0.22;
      best = Math.max(best, 1.0 - (u * u + v * v));
    }
    // Asie
    {
      const u = (lon - 1.25) / 0.95;
      const v = (lat - 0.38) / 0.55;
      if (lon > 0.45) best = Math.max(best, 1.0 - (u * u + v * v));
    }
    // Amériques (bande N-S)
    {
      const u = (lon + 1.65) / 0.42;
      const v = (lat - 0.05) / 0.95;
      best = Math.max(best, 1.0 - (u * u * 1.15 + v * v));
    }
    // Australie
    {
      const u = (lon - 2.28) / 0.34;
      const v = (lat + 0.52) / 0.26;
      best = Math.max(best, 1.0 - (u * u + v * v));
    }
    return best;
  };

  for (let i = 0; i < n; i++) {
    const o = i * 3;
    let dx = 0;
    let dy = 0;
    let dz = 0;
    // Légère densification face avant (Afrique) sans vider l'arrière
    let guard = 0;
    do {
      [dx, dy, dz] = randomDirection(rnd);
      guard++;
    } while (dz < -0.25 && rnd() < 0.55 && guard < 6);

    const shell = 0.975 + Math.pow(rnd(), 0.5) * 0.025;
    const r = R * shell;
    pos[o] = dx * r;
    pos[o + 1] = dy * r;
    pos[o + 2] = dz * r;

    const lon = Math.atan2(dx, dz);
    const lat = Math.asin(Math.max(-1, Math.min(1, dy)));
    const coast =
      valueNoise(dx * 8 + 2, dy * 8 + 5, dz * 8 + 9) * 0.22 +
      valueNoise(dx * 18 + 11, dy * 18 + 3, dz * 18 + 17) * 0.12;
    const score = landScore(lon, lat) + coast - 0.08;
    const polar = Math.abs(lat);

    if (polar > 1.12 || (polar > 1.0 && score < 0.15)) {
      // Glace
      vr[o] = 1.35 + luminosity(rnd) * 0.3;
      vr[o + 1] = 1.55 + luminosity(rnd) * 0.25;
      vr[o + 2] = 0.9;
    } else if (score > 0) {
      // Continent — Sahara / désert vs vert
      const sahara =
        lat > 0.12 && lat < 0.52 && lon > -0.2 && lon < 0.55 && score > 0.05;
      const arid =
        sahara ||
        (lon > 0.7 && lon < 1.6 && lat > 0.2 && lat < 0.55 && score > 0.1);
      vr[o] = 1.45 + luminosity(rnd) * 0.3;
      vr[o + 1] = 1.5 + luminosity(rnd) * 0.3;
      vr[o + 2] = arid ? lerp(0.15, 0.35, rnd()) : lerp(-0.42, -0.22, rnd());
    } else {
      // Océan
      vr[o] = 0.95 + luminosity(rnd) * 0.25;
      vr[o + 1] = 1.05 + luminosity(rnd) * 0.2;
      vr[o + 2] = lerp(-0.96, -0.82, rnd());
    }
  }
};

/**
 * Vague — Flow Wave entre Terre et ADN.
 *
 * Nappe allongée (X×Z), collines multi-octaves, verts #02160c→#34e89a.
 * Le relief vivant (stream + snoise) est porté par uSea / uFlow dans OrbVoyage ;
 * ici on pose la géographie de base + quelques particules d'atmosphère.
 */
const vague: Builder = (n, pos, vr, rnd) => {
  const W = 2.8;
  const D = 4.2; // plus long en Z — sensation de mer qui s'étend
  const AMP = 0.78;
  const atmoN = Math.floor(n * 0.04);

  for (let i = 0; i < n; i++) {
    const o = i * 3;

    // Atmosphère — points libres au-dessus de la nappe (ref Flow Wave atmo)
    if (i < atmoN) {
      pos[o] = (rnd() * 2 - 1) * W * 0.9;
      pos[o + 1] = 0.55 + rnd() * 1.35;
      pos[o + 2] = (rnd() * 2 - 1) * D * 0.85;
      const flash = luminosity(rnd);
      vr[o] = 0.9 + flash * 1.4;
      vr[o + 1] = 0.15 + flash * 0.55;
      vr[o + 2] = lerp(-0.28, -0.08, rnd()); // menthe pâle
      continue;
    }

    // Densité un peu plus forte au centre (creux de vision)
    const rx = (rnd() * 2 - 1) * (rnd() < 0.55 ? 0.72 : 1);
    const rz = (rnd() * 2 - 1) * (rnd() < 0.45 ? 0.65 : 1);
    const x = rx * W;
    const z = rz * D;

    const n1 = valueNoise(x * 0.72 + 3, 0.35, z * 0.72 + 7);
    const n2 = valueNoise(x * 1.55 + 19, 1.0, z * 1.55 + 11) * 0.55;
    const n3 = valueNoise(x * 3.1 + 41, 1.8, z * 3.1 + 23) * 0.28;
    const n4 = valueNoise(x * 6.2 + 71, 3.2, z * 6.2 + 53) * 0.12;
    const h = (n1 + n2 + n3 + n4) * AMP;

    pos[o] = x;
    pos[o + 1] = h - 0.55;
    pos[o + 2] = z;

    const elev = smoothstep(-0.35, 0.7, h);
    const flash = luminosity(rnd);
    // Crêtes plus grosses / brillantes, vallées sombres
    vr[o] = 0.45 + elev * 1.25 + flash * 0.5;
    vr[o + 1] = 0.22 + elev * 1.2 + flash * 0.65;
    // LUT verte : sombre fond → émeraude crête (bande cG du shader)
    vr[o + 2] = lerp(-0.52, -0.12, elev * elev);
  }
};

/**
 * ADN — double hélice GROSSE et lisible (peu de tours, brins épais, barreaux nets).
 */
const adn: Builder = (n, pos, vr, rnd) => {
  const HR = 0.62;
  const TURNS = 2.6;
  const HEIGHT = 1.75;
  const STRAND_R = 0.055;
  const RUNG_R = 0.018;

  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const s = rnd() * 2 - 1;
    const strandA = rnd() < 0.5;
    const strand = strandA ? 0 : Math.PI;
    const ang = s * TURNS * Math.PI + strand;

    const ox = Math.cos(ang);
    const oz = Math.sin(ang);
    const sx = -Math.sin(ang);
    const sz = Math.cos(ang);

    if (rnd() > 0.68) {
      // Barreau — pont entre les deux brins
      const d = lerp(HR, -HR, rnd());
      const ca = rnd() * TAU;
      const cr = RUNG_R;
      pos[o] = ox * d + sx * Math.cos(ca) * cr;
      pos[o + 1] = s * HEIGHT + Math.sin(ca) * cr;
      pos[o + 2] = oz * d + sz * Math.cos(ca) * cr;
      vr[o] = 0.55 + luminosity(rnd) * 0.7;
      vr[o + 1] = 0.65 + luminosity(rnd) * 0.55;
      vr[o + 2] = 0.55;
      continue;
    }

    // Brin — tube dense et lumineux
    const ca = rnd() * TAU;
    const cr = STRAND_R * Math.sqrt(rnd());
    pos[o] = ox * HR + sx * Math.cos(ca) * cr;
    pos[o + 1] = s * HEIGHT + Math.sin(ca) * cr;
    pos[o + 2] = oz * HR + sz * Math.cos(ca) * cr;
    vr[o] = 0.7 + luminosity(rnd) * 1.6;
    vr[o + 1] = 0.95 + luminosity(rnd) * 1.25;
    vr[o + 2] = strandA ? -0.75 : -0.05;
  }
};

/**
 * Cerveau — profil latéral lisible (hémisphère + cervelet + tronc).
 *
 * x = antéro-postérieur, y = haut, z = latéral (aplati).
 * Tronc ~9 % : assez pour se lire, pas une tige monstrueuse.
 */
const cerveau: Builder = (n, pos, vr, rnd) => {
  const stemN = Math.floor(n * 0.09);
  const cerebN = Math.floor(n * 0.13);

  for (let i = 0; i < n; i++) {
    const o = i * 3;

    // ——— Tronc cérébral : court, sous le cervelet, un peu vers l'arrière ———
    if (i < stemN) {
      const t = rnd();
      const a = rnd() * TAU;
      const rr = (0.085 - t * 0.025) * (0.9 + rnd() * 0.2);
      const bend = t * t * 0.12;
      pos[o] = -0.12 - t * 0.1 - bend + Math.cos(a) * rr * 0.35;
      pos[o + 1] = -0.48 - t * 0.42;
      pos[o + 2] = Math.sin(a) * rr;
      vr[o] = 0.7 + luminosity(rnd) * 0.85;
      vr[o + 1] = 0.75 + luminosity(rnd) * 0.65;
      vr[o + 2] = 0.4;
      continue;
    }

    // ——— Cervelet ———
    if (i < stemN + cerebN) {
      const [ux, uy, uz] = randomDirection(rnd);
      let x = ux * 0.24 - 0.55;
      let y = uy * 0.2 - 0.4;
      let z = uz * 0.3;
      const f = valueNoise(x * 48, y * 48, z * 48);
      const k = 1 + f * 0.18;
      pos[o] = x * k;
      pos[o + 1] = y * k;
      pos[o + 2] = z * k;
      vr[o] = 0.5 + luminosity(rnd) * 0.9;
      vr[o + 1] = 0.55 + luminosity(rnd) * 0.7;
      vr[o + 2] = 0.3;
      continue;
    }

    // ——— Hémisphère ———
    const [ux, uy, uz] = randomDirection(rnd);
    const shell = 0.84 + Math.pow(rnd(), 0.4) * 0.16;
    let x = ux * 0.92 * shell;
    let y = uy * 0.58 * shell;
    let z = uz * 0.42 * shell;

    y += x * 0.08;
    if (y < -0.05) y *= 0.55;
    if (y < 0.05 && x > -0.2) y -= 0.04;

    const f1 = valueNoise(x * 11 + 3, y * 11 + 7, z * 11 + 11);
    const f2 = valueNoise(x * 28 + 31, y * 28 + 17, z * 28 + 5) * 0.55;
    const f3 = valueNoise(x * 56 + 61, y * 56 + 43, z * 56 + 19) * 0.3;
    const fold = f1 + f2 + f3;
    const k = 1 + fold * 0.13;
    x *= k;
    y *= k;
    z *= k;

    const sylv =
      Math.exp(-((y + 0.02) * (y + 0.02)) / 0.01) *
      Math.exp(-((x - 0.1) * (x - 0.1)) / 0.45);
    y -= sylv * 0.055;

    pos[o] = x;
    pos[o + 1] = y + 0.1;
    pos[o + 2] = z;

    const ridge = smoothstep(-0.15, 0.7, fold);
    vr[o] = 0.45 + luminosity(rnd) * 1.1 + ridge * 0.65;
    vr[o + 1] = 0.35 + ridge * 1.15 + luminosity(rnd) * 0.7;
    vr[o + 2] = lerp(0.15, 0.85, ridge);
  }
};

/**
 * Neurones — connexions LISIBLES, espacees (pas un amas condensé).
 * Peu de hubs, degre faible, axones longs et distincts, impulsions claires.
 */
const neurones: Builder = (n, pos, vr, rnd) => {
  const HUBS = 28;
  const DEGREE = 3;
  const hubs: [number, number, number][] = [];
  for (let h = 0; h < HUBS; h++) {
    const [dx, dy, dz] = randomDirection(rnd);
    // Volume large — les liens doivent traverser l espace, pas se croiser en boule
    const r = 0.55 + rnd() * 0.75;
    hubs.push([dx * r * 1.05, dy * r * 0.85, dz * r * 1.1]);
  }

  const edges: [number, number][] = [];
  const seen = new Set<string>();
  for (let a = 0; a < HUBS; a++) {
    const ha = hubs[a]!;
    const dist: { b: number; d: number }[] = [];
    for (let b = 0; b < HUBS; b++) {
      if (a === b) continue;
      const hb = hubs[b]!;
      const dx = ha[0] - hb[0];
      const dy = ha[1] - hb[1];
      const dz = ha[2] - hb[2];
      dist.push({ b, d: dx * dx + dy * dy + dz * dz });
    }
    dist.sort((u, v) => u.d - v.d);
    for (let k = 0; k < DEGREE; k++) {
      const b = dist[k]!.b;
      const key = a < b ? a + ':' + b : b + ':' + a;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
    }
  }
  const E = edges.length;

  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const roll = rnd();

    if (roll < 0.16) {
      const hub = hubs[Math.floor(rnd() * HUBS)]!;
      const [dx, dy, dz] = randomDirection(rnd);
      const pr = 0.02 + rnd() * 0.03;
      pos[o] = hub[0] + dx * pr;
      pos[o + 1] = hub[1] + dy * pr;
      pos[o + 2] = hub[2] + dz * pr;
      vr[o] = 1.5 + luminosity(rnd) * 1.6;
      vr[o + 1] = 1.2 + luminosity(rnd) * 1.1;
      vr[o + 2] = lerp(-0.45, 0.25, rnd());
      continue;
    }

    if (roll < 0.78) {
      // Axone — fil continu le long d une seule arete
      const e = edges[Math.floor(rnd() * E)]!;
      const ha = hubs[e[0]]!;
      const hb = hubs[e[1]]!;
      const t = rnd();
      const bend = valueNoise(ha[0] * 3, hb[1] * 3, t * 6) * 0.04;
      pos[o] = lerp(ha[0], hb[0], t) + bend;
      pos[o + 1] = lerp(ha[1], hb[1], t) + bend * 0.4;
      pos[o + 2] = lerp(ha[2], hb[2], t) - bend * 0.25;
      vr[o] = 0.35 + luminosity(rnd) * 0.45;
      vr[o + 1] = 0.4 + luminosity(rnd) * 0.55;
      vr[o + 2] = lerp(-0.95, -0.35, rnd());
      continue;
    }

    if (roll < 0.92) {
      // Impulsion — un paquet sur l axone
      const e = edges[Math.floor(rnd() * E)]!;
      const ha = hubs[e[0]]!;
      const hb = hubs[e[1]]!;
      const t = clampNum(rnd() * 0.92 + 0.04, 0, 1);
      pos[o] = lerp(ha[0], hb[0], t);
      pos[o + 1] = lerp(ha[1], hb[1], t);
      pos[o + 2] = lerp(ha[2], hb[2], t);
      vr[o] = 2.0 + luminosity(rnd) * 2.2;
      vr[o + 1] = 1.7 + luminosity(rnd) * 1.8;
      vr[o + 2] = lerp(0.2, 0.95, luminosity(rnd));
      continue;
    }

    const hub = hubs[Math.floor(rnd() * HUBS)]!;
    const [dx, dy, dz] = randomDirection(rnd);
    const pr = 0.035 + rnd() * 0.04;
    pos[o] = hub[0] + dx * pr;
    pos[o + 1] = hub[1] + dy * pr;
    pos[o + 2] = hub[2] + dz * pr;
    vr[o] = 0.9 + luminosity(rnd) * 1.2;
    vr[o + 1] = 1.05 + luminosity(rnd) * 1.0;
    vr[o + 2] = lerp(0.15, 0.8, rnd());
  }
};

/** Orbe — JARVIS. Même matière / limbe que JarvisOrb (stopMix cyan→ambre). */
const orbe: Builder = (n, pos, vr, rnd) => {
  const px = 0.06;
  const py = 1.0;
  const pz = 0.34;
  const pl = Math.hypot(px, py, pz);

  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const [dx, dy, dz] = randomDirection(rnd);

    const n1 = valueNoise(dx * 2.2 + 5, dy * 2.2 + 9, dz * 2.2 + 2) * 0.35;
    const n2 = valueNoise(dx * 5.4 + 31, dy * 5.4 + 17, dz * 5.4 + 23) * 0.3;
    const fib = valueNoise(dx * 26 + 61, dy * 1.5 + 43, dz * 26 + 71) * 0.22;
    const crust = 1 + (n1 + n2 + fib) * 0.075;

    const toPole = (dx * px + dy * py + dz * pz) / pl;
    const near = Math.pow(Math.max(0, toPole) * 0.5 + 0.5, 2);
    const jn = valueNoise(dx * 10 + 101, dy * 2.6 + 89, dz * 10 + 113);
    const jet = Math.pow(Math.max(0, jn), 3) * (0.22 + 0.78 * near) * 0.28;

    const r = crust + jet;
    pos[o] = dx * r;
    pos[o + 1] = dy * r;
    pos[o + 2] = dz * r;

    // vr neutre : la couleur vient de stopMix (JarvisOrb), pas d'une LUT Storm
    const jetLit = jet > 0.02 ? 1 : 0;
    vr[o] = 0.55 + luminosity(rnd) * 0.9 + jetLit * 0.25;
    vr[o + 1] = 0.7 + near * 0.6 + luminosity(rnd) * 0.5;
    vr[o + 2] = 0.0;
  }
};

/* ── Fabrique ──────────────────────────────────────────────────────────── */

const BUILDERS: Record<FigureId, Builder> = {
  galaxies,
  voyage,
  solaire,
  terre,
  vague,
  adn,
  cerveau,
  neurones,
  orbe,
};

/** Générateur pseudo-aléatoire à graine — mulberry32. Déterminisme voulu. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildFigure(id: FigureId, count: number, seed = 1): Figure {
  const pos = new Float32Array(count * 3);
  const vr = new Float32Array(count * 3);
  BUILDERS[id](count, pos, vr, seeded(seed));
  return { pos, var: vr };
}

export function buildAllFigures(count: number, seed = 1): Record<FigureId, Figure> {
  const out = {} as Record<FigureId, Figure>;
  for (const id of FIGURE_IDS) out[id] = buildFigure(id, count, seed);
  return out;
}
