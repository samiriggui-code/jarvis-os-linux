# Cinématique de démarrage

L'écran qui joue au lancement de l'app, **avant** le boot et le check système.

```
main.tsx → BootGate → BootScene → OrbVoyage
                    → App → AuthScene (checklist + voix)
```

## Le récit

Voyage de la conscience humaine — historique / quantique. **Neuf** figures,
une **seule** matière : chaque point garde son indice du début à la fin.

Chaque acte suit le même geste (refs Cosmic Dust → figure → Dust) :

```
poussière / grains  →  forme solide lisible  →  désintégration  →  prochaine
```

| Acte | Figure | Récit | Ref visuelle |
|---|---|---|---|
| `galaxies` | disque spiral, bras logarithmiques | galaxie lointaine — l'origine | `starfield-ref/` |
| `voyage` | cône d'étoiles + flux (même matière) | tunnel quantique — la traversée | `tunnel-ref/` |
| `solaire` | Soleil + 8 planètes + anneaux Saturne | système solaire — l'arrivée | — |
| `terre` | globe océans / continents / calottes | planète Terre — le foyer | — |
| `vague` | mer de collines, verts émeraude | mer vivante — avant l'ADN | `flow-wave-ref/` |
| `adn` | double hélice + barreaux | ADN humain — le vivant | — |
| `cerveau` | silhouette cérébrale, circonvolutions | cerveau — l'organe | — |
| `neurones` | somas + axones (réseau) | neurones — l'information s'allume | — |
| `orbe` | plasma limbe cyan→ambre (JarvisOrb) | **JARVIS** — conscience → IA | `JarvisOrb.jsx` |

Transitions = `dust-ref/` (rust / ambre).

```
galaxie → tunnel → solaire → Terre → vague → ADN → cerveau → neurones → orbe IA
```

## Chaîne complète

```
voyage 54 s  →  titre J.A.R.V.I.S + repos 3,6 s  →  recul 2,8 s  →  boot checks
CINEMATIC_MS        REST_MS                         OUTRO_MS
```

Fin : l'orbe produit (`stopMix` JarvisOrb) se pose avec **J.A.R.V.I.S** en
gros caractères au centre, respire, **rétrécit et disparaît au loin**, puis
fade — le BootOverlay monte dessous (checks + mini-orbe). SFX procéduraux
par acte (`bootSfx.ts`, Web Audio). `?boot=lab` joue aussi le recul avant
de rejouer.

Chaque acte ~6 s : ~16 % coalesce, ~42 % palier solide, ~42 % désintégration + morph.

**Audio** : écran **CLICK TO ENTER** obligatoire (Chrome mute sinon).
Nappe Matrix procédurale (`bootSfx.ts`) + stingers d'acte. Optionnel :
`hud/public/boot/score.mp3` (pas le générique Reloaded copyrighté).
Skip après armement : Esc / Entrée / Espace / clic. `?boot=lab` · `?boot=0`.

## C'est l'orbe du produit, pas une copie

`OrbVoyage` reprend **tel quel** le nuanceur de
`app/components/orb/JarvisOrb.jsx` : géométrie lat/lon, bruit simplex,
dégradé `stopMix`, sparkles, vagues, blending additif. Le seul ajout est le
morph dans le nuanceur de sommets — `shapeAt()` déplie la sphère de départ
vers chaque figure.

**Toute modification du rendu de l'orbe doit être répercutée des deux côtés**,
sinon la cinématique et l'orbe du HUD divergent.

## Licence

Aucun code tiers. Références de mise en scène / techniques (pas de copie) :

| Source | Ce qu'on en tire |
|---|---|
| GetLayers (`solaris`, `new-era`…) | tunnel, croûte en fusion, morph matière |
| [bobbyroe/wormhole-effect](https://github.com/bobbyroe/wormhole-effect) | tunnel quantique : cylindre bruité, FOV large, wobble caméra, défilement Z |
| Tunnel / Starfield / Storm / Dust / Flow Wave (`*-ref/`) | palettes + postprocess GetLayers — idées, pas de copie runtime |
| [galaxy-portfolio](https://github.com/techinz/galaxy-portfolio) / [techinz.dev](https://www.techinz.dev/) | **cadrage** : caméra sous le disque ; gradient chaud→bleu ; étoile foyer ; soleil>>planètes + corona + nébuleuse (licence personal-use → idées only ; galaxie = GLB Sketchfab CC BY) |
| [react-3d-solar-system](https://github.com/WebDevBey/react-3d-solar-system) | hiérarchie soleil / orbites / planètes (`solaire`) |
| [3dbrain](https://github.com/victors1681/3dbrain), [dna-neotix](https://dna-neotix.vercel.app/) | lecture volume cerveau / hélice (`cerveau`, `adn`) |

Le GLSL du voyage est écrit pour ce projet. Bundles licenciés non ouverts
pour extraction de shaders.

Pour information, mesuré sur GetLayers : three.js r158, WebGL2, React, three
impératif (pas de react-three-fiber), et rendu à `pixelRatio` **1.0**. Leur
netteté ne vient donc pas de la résolution mais de la densité de trame.

## Réglages

Tout est en tête de `OrbVoyage.tsx`, une entrée par acte :

| Table | Rôle |
|---|---|
| `ACT_FIT` | rayon que la caméra tient dans le cadre. **Décide de l'échelle.** Une valeur < au rayon réel fait déborder la figure. |
| `ACT_SHIFT` | décalage vertical caméra. Monter la caméra fait *descendre* le sujet. `orbe: 0` = centrée avant le recul. |
| `ACT_TINT` | ambiance colorée. **Module** le dégradé de l'orbe, ne le remplace pas. |
| `ACT_TILT` | inclinaison (rotation.x). Galaxie / solaire : **trois-quarts couche** (~0.55–0.7). Jamais face-on. |
| `ACT_ROLL` | roulis (rotation.z). Casse l'alignement horizontal du cadre. |
| `ACT_FOV` | champ de vision. Tunnel à ~62° pour l'immersion. |
| `ACT_FIT` | rayon cadré. Tunnel très bas (0.28) = caméra **dans** le tube. |

Densité et taille des points : `scaleForTier` dans le `useEffect`, et
`uSizeScale` dans `resize()`.

## Pièges rencontrés — ne pas les refaire

**Backticks dans les commentaires GLSL.** Les nuanceurs sont des template
literals : un backtick dans un commentaire ferme la chaîne. Écrire les noms
de variables sans backticks à l'intérieur des blocs `NOISE_GLSL`,
`SHAPES_GLSL`, `VERTEX_SHADER`, `FRAGMENT_SHADER`.

**`setSize(w, h, false)`.** Le 3ᵉ argument désactive la mise à jour du style
CSS ; le canvas reste à 300×150 px et se cale à gauche. Ici le style est posé
à la main (`width/height: 100%`), donc `false` est correct — mais il faut les
deux.

**Taille des points liée à la hauteur.** Faire grossir les points
proportionnellement au canvas (`h/420`) donne des confettis en plein écran.
Un point doit rester petit en absolu (~1–3 px) ; c'est la **densité** qui
remplit l'image.

**Amplitude du relief.** Au-delà de ~0.08, la silhouette devient une étoile à
branches. La référence n'a que des ondulations douces.

**Éclairage.** La couleur pilotée par la hauteur écran donne un anneau
uniforme. Elle doit décroître avec la distance angulaire au point chaud
(`dot(p, pole)`) — mais en **modulant** la palette, pas en l'écrasant.

**Montage prématuré du boot** *(corrigé, ne pas réintroduire)*. `BootGate`
rendait `children` dès le premier frame, masqué en CSS. Masquer n'est pas
empêcher : `AuthScene` se montait, l'orchestrateur partait, le Core lançait
sa séquence et JARVIS annonçait les vérifications **pendant** la cinématique.
Le boot ne se monte donc qu'au début du raccord (`onOutro`).

## Non vérifié

Le rendu n'a **jamais été observé** pendant l'écriture — validation par
compilation seulement (`esbuild --bundle` sur les trois fichiers). Les
réglages viennent de captures de référence, pas d'un aller-retour visuel.

Restent approximatifs :

- `HANDOFF_FIT` / `HANDOFF_SHIFT` — visent la place de l'orbe de
  `BootOverlay` (80 px, colonne centrée). Posés au jugé : si le relais
  « saute » au raccord, c'est là.
- La **trame**. Les points se lisent encore comme des grains là où la
  référence donne des fils continus. Dernier écart connu, à jouer sur le
  rapport taille/densité.
- Le **coût**. ~192 k points en palier haut. Si ça saccade, baisser `high`
  dans `scaleForTier` avant de toucher au DPR.

## Essayer

```powershell
cd hud && npm run dev          # http://127.0.0.1:5173/?boot=lab
```

Pour voir le boot et entendre la voix, le Core doit tourner en parallèle —
sans lui le HUD attend 14 s (`CORE_HANDSHAKE_MS`) puis affiche
`NOYAU COGNITIF INJOIGNABLE` et bascule sur le PIN :

```powershell
cd core && .venv\Scripts\activate && python -m jarvis_core   # ws://127.0.0.1:8765
```

La voix vient du **Core** (cache jarvis2), pas du HUD : `VITE_TTS_STUB=false`
dans `hud/.env.development` est volontaire — les deux parlaient en même temps
auparavant.
