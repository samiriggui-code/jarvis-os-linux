/**
 * Contrôle des distributions — `node figures.test.mjs`
 *
 * Ce que ça attrape, et qui a réellement cassé le rendu par le passé :
 * positions dupliquées (points empilés au même endroit), figures vides,
 * bornes hors cadre, et densité radiale inversée.
 *
 * À lancer après toute retouche d'une figure, AVANT de démarrer le HUD.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'fig-'));
const bundle = join(tmp, 'figures.mjs');

execFileSync(
  join(here, '../../../node_modules/.bin/esbuild'),
  [join(here, 'figures.ts'), '--bundle', '--format=esm', `--outfile=${bundle}`],
  { stdio: 'pipe' },
);

const { buildFigure, FIGURE_IDS } = await import(bundle);

const N = 60000;
let failures = 0;
const fail = (m) => {
  console.log('   ✗ ' + m);
  failures++;
};

for (const id of FIGURE_IDS) {
  const fig = buildFigure(id, N);
  const p = fig.pos;
  const v = fig.var;
  console.log(`\n── ${id}`);

  // Bornes
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let maxR = 0;
  for (let i = 0; i < N; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      fail('coordonnée non finie'); break;
    }
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    maxR = Math.max(maxR, Math.hypot(x, y, z));
  }
  console.log(`   étendue  x[${minX.toFixed(2)},${maxX.toFixed(2)}] y[${minY.toFixed(2)},${maxY.toFixed(2)}] z[${minZ.toFixed(2)},${maxZ.toFixed(2)}]  rayon max ${maxR.toFixed(2)}`);

  // Dégénérescence — LE bug qui a tué l'ADN (229 points par position).
  const seen = new Set();
  for (let i = 0; i < N; i++) {
    seen.add(
      `${p[i * 3].toFixed(3)},${p[i * 3 + 1].toFixed(3)},${p[i * 3 + 2].toFixed(3)}`,
    );
  }
  const uniq = seen.size / N;
  console.log(`   positions distinctes ${(uniq * 100).toFixed(1)}%  (${seen.size}/${N})`);
  if (uniq < 0.9) fail(`dégénérescence : ${(N / seen.size).toFixed(0)} points empilés par position`);

  if (maxR > 6) fail(`figure hors cadre (rayon ${maxR.toFixed(1)})`);
  if (maxR < 0.2) fail('figure quasi ponctuelle');

  // Variété : une figure dont tous les points ont même taille, même éclat et
  // même couleur se lit comme un schéma. C'est ce qui a fait paraître les
  // cinq premières figures comme des ébauches.
  const stat = (c) => {
    let mn = Infinity, mx = -Infinity, sum = 0;
    for (let i = 0; i < N; i++) { const x = v[i * 3 + c]; mn = Math.min(mn, x); mx = Math.max(mx, x); sum += x; }
    return { mn, mx, moy: sum / N };
  };
  const [sz, ec, tp] = [stat(0), stat(1), stat(2)];
  console.log(`   taille ${sz.mn.toFixed(2)}–${sz.mx.toFixed(2)} (moy ${sz.moy.toFixed(2)})  éclat ${ec.mn.toFixed(2)}–${ec.mx.toFixed(2)}  temp ${tp.mn.toFixed(2)}–${tp.mx.toFixed(2)}`);
  if (sz.mx - sz.mn < 0.3) fail('taille uniforme — aucune profondeur');
  if (ec.mx - ec.mn < 0.3) fail('éclat uniforme — champ plat');
  if (tp.mx - tp.mn < 0.15) fail('figure monochrome');
}

// Densité radiale de la galaxie : doit DÉCROÎTRE vers l'extérieur.
console.log('\n── galaxies : densité surfacique par rayon');
{
  const p = buildFigure('galaxies', N).pos;
  const B = 6, RMAX = 1.95;
  const c = new Array(B).fill(0);
  for (let i = 0; i < N; i++) {
    const r = Math.hypot(p[i * 3], p[i * 3 + 2]);
    if (r < RMAX) c[Math.min(B - 1, Math.floor((r / RMAX) * B))]++;
  }
  const dens = c.map((n, b) => {
    const r0 = (b / B) * RMAX, r1 = ((b + 1) / B) * RMAX;
    return n / (Math.PI * (r1 * r1 - r0 * r0));
  });
  dens.forEach((d, b) => console.log(`   ${((b / B) * RMAX).toFixed(2)}–${(((b + 1) / B) * RMAX).toFixed(2)}  ${'█'.repeat(Math.round((d / dens[0]) * 34))}`));
  for (let b = 1; b < B; b++) {
    if (dens[b] > dens[b - 1]) { fail(`densité croissante à la tranche ${b} — cœur creux`); break; }
  }
}

console.log(failures === 0 ? '\n✓ toutes les figures passent' : `\n✗ ${failures} problème(s)`);
process.exit(failures === 0 ? 0 : 1);
