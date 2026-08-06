/**
 * Génère `ui_catalog.json` depuis le registre du HUD.
 *
 * Le HUD détient la vérité — lui seul sait qu'un nom s'affiche réellement.
 * Le Core et Hermes en reçoivent un artefact, JAMAIS édité à la main
 * (`docs/architecture/JARVIS-Agentic-UI.md` §5.3).
 *
 * Conséquence voulue : ajouter un composant sans relancer ce script produit un
 * catalogue périmé, donc un refus explicite côté Core. Échec bruyant plutôt
 * que dérive silencieuse — c'est la leçon du commit 346bf5c.
 *
 *   node scripts/gen-ui-catalog.mjs           écrit le fichier
 *   node scripts/gen-ui-catalog.mjs --check   échoue si le fichier a dérivé (CI)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const OUT = resolve(root, '../core/jarvis_core/ui_catalog.json');

// Les définitions sont en TypeScript, mais sans React ni JSX : esbuild — déjà
// présent via Vite — suffit à les rendre exécutables. C'est exactement ce que
// la règle « aucun import React dans definitions.ts » achète : ce script reste
// trivial et n'ajoute aucune dépendance.
// Le bundle reste DANS le projet : écrit dans le dossier temporaire du
// système, node ne saurait plus résoudre `zod` faute de `node_modules` au-dessus.
const bundlePath = resolve(root, `node_modules/.cache/jarvis-ui-catalog-${process.pid}.mjs`);
mkdirSync(dirname(bundlePath), { recursive: true });

await build({
  entryPoints: [resolve(root, 'src/agentic/registry/definitions.ts')],
  outfile: bundlePath,
  bundle: true,
  format: 'esm',
  platform: 'node',
  // `zod` reste externe : inutile de le recopier, node le résoudra.
  external: ['zod'],
  logLevel: 'silent',
});

const { buildCatalog } = await import(pathToFileURL(bundlePath).href);
rmSync(bundlePath, { force: true });

const catalog = buildCatalog();
const json = `${JSON.stringify(catalog, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (!existsSync(OUT)) {
    console.error(`✗ ${OUT} absent — lancer « node scripts/gen-ui-catalog.mjs »`);
    process.exit(1);
  }
  if (readFileSync(OUT, 'utf8') !== json) {
    console.error(`✗ ${OUT} a dérivé du registre — régénérer avant de commiter`);
    process.exit(1);
  }
  console.log(`✓ catalogue à jour (${catalog.components.length} composant(s))`);
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, json, 'utf8');
console.log(`✓ ${OUT} — ${catalog.components.length} composant(s)`);
