/**
 * Assets MediaPipe → hud/public/mediapipe/ (hors git : ~19 Mo).
 *
 * Pourquoi local et pas le CDN jsdelivr que documente MediaPipe : le HUD
 * tourne en kiosque sur le NUC, et « JARVIS BASE doit survivre sans HUD / IA
 * / domotique » vaut aussi pour Internet. Un `FilesetResolver` qui pointe un
 * CDN transforme une coupure réseau en perte du pilotage gestuel — sans la
 * moindre erreur visible, juste des mains qui ne font plus rien.
 *
 *   node scripts/fetch-mediapipe.mjs
 *
 * Idempotent : ne retélécharge rien qui soit déjà là et de la bonne taille.
 */
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, stat, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'mediapipe');
const WASM_SRC = join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');

// Modèle « full » float16 : le meilleur compromis précision//poids pour du
// pilotage d'interface. Le « lite » perd le pouce de profil, qui est
// exactement ce dont dépend la détection de pincement.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MODEL_MIN_BYTES = 5_000_000;

async function sizeOf(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return -1;
  }
}

async function copyWasm() {
  const dest = join(OUT, 'wasm');
  await mkdir(dest, { recursive: true });

  let names;
  try {
    names = await readdir(WASM_SRC);
  } catch {
    throw new Error(
      "@mediapipe/tasks-vision absent — lance `npm install` avant ce script.",
    );
  }

  // Le nosimd n'est chargé que par les navigateurs sans WebAssembly SIMD.
  // Chromium en kiosque l'a ; on le copie quand même, 11 Mo pour ne pas
  // avoir un HUD muet sur une machine de secours plus vieille.
  let copied = 0;
  for (const name of names) {
    const from = join(WASM_SRC, name);
    const to = join(dest, name);
    if ((await sizeOf(to)) === (await sizeOf(from))) continue;
    await copyFile(from, to);
    copied += 1;
  }
  console.log(`wasm : ${names.length} fichier(s), ${copied} copié(s) → public/mediapipe/wasm/`);
}

async function fetchModel() {
  await mkdir(OUT, { recursive: true });
  const dest = join(OUT, 'hand_landmarker.task');

  if ((await sizeOf(dest)) > MODEL_MIN_BYTES) {
    console.log('modèle : déjà présent → public/mediapipe/hand_landmarker.task');
    return;
  }

  console.log(`modèle : téléchargement depuis ${new URL(MODEL_URL).host}…`);
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) {
    throw new Error(`téléchargement du modèle : HTTP ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));

  const size = await sizeOf(dest);
  if (size < MODEL_MIN_BYTES) {
    throw new Error(`modèle tronqué (${size} octets) — relance le script`);
  }
  console.log(`modèle : ${(size / 1e6).toFixed(1)} Mo → public/mediapipe/hand_landmarker.task`);
}

await copyWasm();
await fetchModel();
console.log('OK — assets gestuels prêts.');
