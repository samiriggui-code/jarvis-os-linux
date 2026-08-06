# Étude TEXTURA Agency → `@jarvis/ui`

Analyse des dix dépôts publics de [textura-agency](https://github.com/textura-agency),
menée pour en extraire des techniques, pas des rendus. Aucune ligne n'a été
recopiée, aucune identité graphique reprise. Ce qui est retenu tient en une
poignée de principes d'architecture — c'est là qu'est leur vraie valeur, pas
dans les pixels.

**Date** : 2 août 2026 · **Livrable associé** : `hud/src/ui/`

---

## 1. Ce qui était réellement disponible

Sur les dix dépôts, deux sont vides ou quasi vides. Il faut le dire tout de
suite pour ne pas laisser croire à une couverture qu'on n'a pas.

| Dépôt | Contenu | Exploitable |
|---|---|---|
| `spring-text-engine` | 2 600 lignes TS/TSX, moteur complet | ★★★ |
| `next16-claude-starter` | Starter Next 16 + coffre de docs Obsidian (49 notes) | ★★★ |
| `renderer` | Micro-bibliothèque de boucle + interpolation + tween | ★★ |
| `vue-smoothpage` | Scroll lissé Vue 3, 3 000 lignes | ★★ |
| `react-spring-trigger` | Un hook, `useSpringTrigger` (297 lignes) | ★★ |
| `react-pointer-zoom` | Loupe au survol, fork de `CarMax/react-cursor-zoom` | ★ |
| `getlayers-plugin` | Plugin Claude Code : un `SKILL.md`, pas de code | ★ |
| `vue-smoothpage-editor` | Échafaudage Vite/Vue par défaut, jamais commencé | ✗ |
| `lead-tables` | Un `index.html` | ✗ |
| `tiles-generator` | **Dépôt vide** | ✗ |

Licences : MIT (`spring-text-engine`, `react-pointer-zoom`), ISC (`renderer`),
Apache-2.0 (`vue-smoothpage`), Unlicense (`next16-claude-starter`). Toutes
permissives — mais la question ne se pose pas, puisqu'on n'importe rien.

---

## 2. Dépôt par dépôt

### 2.1 `spring-text-engine` — le morceau de bravoure

Un composant React qui découpe ses enfants en lettres / mots / lignes et pilote
chaque unité avec son propre ressort. 1 767 lignes pour le seul `TextEngine.tsx`.

**Architecture.** Six couches imbriquées, chacune rendue *seulement* si sa cible
d'entrée est non vide — `wrapLine > line > wrapWord > word > wrapLetter > letter`.
C'est le point fort : quand on n'anime que les mots, le DOM ne contient pas six
`<span>` par lettre. La condition est un simple `isNotEmpty(xIn)`, et elle sert
à la fois à décider du rendu et à décider des animations à démarrer.

**Ce qui mérite d'être repris.**

- *La détection de lignes par géométrie.* Aucune API navigateur ne donne les
  retours à la ligne d'un texte fluide. Leur `calcLinesRefs` mesure le `top` de
  chaque mot et divise par la hauteur d'un mot pour en déduire l'indice de
  ligne. Simple et juste — repris, avec une tolérance relative au lieu d'une
  division entière, qui casse dès que les mots n'ont pas tous la même hauteur
  (accents, exposants), ce que leur propre commentaire admet
  (« *IMPORTANT: All words same height* »).
- *La copie accessible.* Le texte découpé est `aria-hidden`, et une copie
  intacte visuellement masquée porte le contenu réel. Sans ça une phrase hachée
  en soixante `<span>` est illisible pour une synthèse vocale. C'est l'idée la
  plus précieuse du dépôt et elle ne coûte rien. **Reprise telle quelle** (le
  principe, pas le code).
- *La fabrique par `Proxy`.* `tengine.h1`, `tengine.p` renvoient un composant
  pré-typé par balise. Élégant. Non repris : le gain de confort ne justifie pas
  un `Proxy` dans un chemin critique.
- *Les modes.* `always` / `once` / `forward` / `manual` / `progress`. La
  distinction `once` vs `forward` est fine (rejouer ou non en remontant) — mais
  elle n'a de sens qu'avec du scroll. Voir §3.

**Ce qu'il faut laisser.**

- L'API à **93 props**. `lineStaggerIn`, `lineStaggerOut`, `lineDelayIn`,
  `lineConfigIn`, `wrapLineIn`… le produit cartésien de six couches × entrée /
  sortie × valeur / config / retard / décalage. C'est ingérable et ça se voit
  dans le code : un `propsRef.current = {…}` de quarante champs réassigné à
  chaque rendu.
- Les contournements de `react-spring`. Une bonne moitié des commentaires du
  fichier documente des bagarres avec la bibliothèque : springs annulés par le
  re-rendu suivant, `useInView` qui recrée son `IntersectionObserver` et perd
  ses rappels de sortie, `useSprings` qui repart en boucle. Le commentaire
  ligne 780 est édifiant. En écrivant notre propre intégrateur, ces problèmes
  n'existent pas.
- `immediateOut = props.immediateOut || true` (ligne 441) : toujours vrai. Le
  `false` documenté est inatteignable. Symptôme d'une surface trop large pour
  être testée.

### 2.2 `next16-claude-starter` — la vraie leçon

Un starter Next.js 16, mais l'intérêt n'est pas le code : c'est le **système de
documentation contraignant** qui l'entoure.

- Un coffre Obsidian de 49 notes liées par `[[wikilinks]]`, déclaré source de
  vérité unique.
- Trois hooks Claude Code dans `.claude/settings.json` : `SessionStart` pointe
  l'agent vers le coffre, `UserPromptSubmit` le lui rappelle à chaque requête,
  `Stop` **bloque une fois** la fin de tour pour forcer la mise à jour des docs.
- Onze règles dures dans `AGENTS.md`, dont « ne pas modifier le moteur
  d'animation sans accord explicite » et « pas de `any` ».

C'est directement transposable à JARVIS, qui a déjà `CLAUDE.md`,
`cahierdecharges.md` et un skill dédié. Le hook `Stop` est l'idée à voler : il
transforme « pense à documenter » en contrainte mécanique.

**Le système de tokens en trois niveaux** est l'autre apport net :

| Niveau | Grammaire | Utilisable en markup |
|---|---|---|
| 1 — primitif | `--raw-color-neutral-950` | jamais |
| 2 — sémantique | `--background`, `--action-primary-hover` | jamais directement |
| 3 — liaison | `@theme inline { --color-background: var(--background) }` | oui |

La règle qui compte : **seul le niveau 1 contient des littéraux**, et le niveau 2
nomme un rôle, jamais une apparence. Le HUD actuel viole les deux — `#00f5ff`
apparaît en dur dans une trentaine de fichiers, et `theme.css` est encore la
palette shadcn par défaut sous un `!important` global dans `index.css`. C'est le
chantier à ouvrir ensuite (§5).

Côté code, deux fichiers valent le détour : `lib/animation/ticker.ts` (§3.1) et
`hooks/use-window-size.ts`, qui remplace N écouteurs `resize` par un seul
magasin `useSyncExternalStore` partagé.

**Le skill `optimize-3d-scene`** livré avec est la pièce la plus utile du lot
pour JARVIS, parce que le HUD embarque un orbe three.js sur un NUC à GPU
intégré. Quatorze sections mesurées, dont : décider du palier machine une fois à
la construction ; **tout précompiler pendant le chargement** (shaders, variantes
de programme, textures, cibles de rendu, et le décodage CPU qu'on oublie
toujours) ; ne rendre que si visible ; brider le pixel ratio ; couper le
remplissage plutôt que le détail. Elles s'appliquent presque toutes à
`OrbCore3D.tsx`.

Ils y notent eux-mêmes le défaut de leur ticker : la comparaison `time - last <= framerate`
fait qu'un budget de `1000/30` rend en réalité 26 fps sur un écran 120 Hz.
Corrigé chez nous (`<` strict).

### 2.3 `renderer` — la boucle, dépouillée

Micro-bibliothèque de 2021-2022 : boucle rAF globale, coordonnées souris et
scroll, interpolation par morceaux le long d'une timeline, tween avec un jeu
d'easings construits par composition (`Out = flip(pow(flip(t)))`, `InOut = lerp(In, Out, t)`).

L'idée centrale — **une seule boucle pour toute l'application, à laquelle on
s'abonne** — est la meilleure du corpus et elle traverse tous leurs dépôts.

Le reste a vieilli. `startRender` appelle `requestAnimationFrame` sans jamais
garder l'identifiant, donc `stopRender` ne fait que lever un drapeau : la boucle
continue à tourner en ne faisant rien. Les handlers sont un tableau parcouru avec
`forEach` sans protection : un abonné qui jette emporte les autres. Et
`removeFromRender` sans argument supprime *le dernier* abonné, comportement par
défaut plutôt risqué. Ces trois points sont corrigés dans notre version.

### 2.4 `react-spring-trigger` — la grammaire de déclenchement

Un hook qui rejoue GSAP ScrollTrigger sur `react-spring`. L'apport durable est
la **grammaire de position** : `"top bottom"`, `"center center"`,
`"bottom top-=100"` — bord de l'élément, bord de la fenêtre, décalage optionnel.
Neuf combinaisons calculées à partir d'un seul `getBoundingClientRect`.

Le dépôt est inachevé : `toggleActions` est entièrement commenté puis remplacé
par un `if (progress > 0) return end`, et `package.json` porte encore le nom
`next-page-three-starter`. On garde la grammaire, on laisse le hook.

### 2.5 `vue-smoothpage` — la structure, pas le scroll

Scroll lissé maison pour Vue 3, sans GSAP. Le HUD tourne en kiosque plein écran
et ne scrolle pas : le composant lui-même ne sert à rien ici. Mais deux motifs
de structure méritent d'être notés.

- **Le détecteur en extensions.** `Detector` compose quatre classes autonomes —
  `DetectWheel`, `DetectSwipe`, `DetectKeyboard`, `DetectShortcuts` — chacune
  avec `subscribe` / `unsubscribe`. Ajouter une source d'entrée n'oblige à
  toucher aucune des autres. C'est exactement la forme dont le HUD a besoin pour
  agréger voix, gestes, clavier et télécommande.
- **Le magasin dédoublé.** Un magasin privé mutable et un magasin public en
  lecture seule qui l'expose en `computed`. Sépare proprement ce que la
  bibliothèque écrit de ce que l'application lit.

À l'inverse, les réglages par navigateur (`safariWheelIntensity`,
`chromeWheelIntensity`, `operaWheelIntensity`…) sont un avertissement : quand on
en arrive à une constante par navigateur, c'est que le modèle sous-jacent est
faux.

### 2.6 `react-pointer-zoom` — une seule idée à garder

Loupe au survol, fork d'un composant CarMax. Réécrit en classes React d'avant
les hooks, et le nœud de la loupe est fabriqué en DOM impératif dans un portail,
hors de React. L'idée transposable est là : **pour ce qui bouge à chaque frame,
sortir de React et écrire directement dans le style**. C'est ce que fait
`StateText`.

Le lissage d'accrochage (`lerp` vers une position de repos après un délai) est
joli mais anecdotique.

### 2.7 `getlayers-plugin`

Pas de code : un `SKILL.md` qui pilote un serveur MCP commercial. Intéressant
comme exemple de skill bien écrit — il commence par interdire le raccourci que
l'agent prendrait naturellement (« sauter directement au code générique ») — mais
sans matière technique.

### 2.8 Les trois autres

`vue-smoothpage-editor` est un `create-vite` intact avec `HelloWorld.vue`.
`lead-tables` contient un fichier HTML. `tiles-generator` est vide. Rien à en
tirer.

---

## 3. Le décalage structurel, et comment on le traite

Toute leur bibliothèque est bâtie sur **une variable continue : la position de
scroll**. Progression 0→1 entre deux points de déclenchement, chaque unité
recevant sa fenêtre dans cette progression. `useProgressTrigger`,
`useSpringTrigger`, le mode `progress` de `TextEngine`, `vue-smoothpage` : tout
en découle.

**Le HUD n'a pas de scroll.** Kiosque, plein écran, immobile. Reprendre leurs
composants tels quels reviendrait à installer un moteur sans le carburant.

Mais le HUD a mieux : un agent dont l'état est déjà continu et déjà mesuré. Il
écoute, réfléchit, parle, avec une amplitude vocale et une progression de tâche.
`hud/src/ui/state/agentState.ts` en fait le signal de déclenchement, et c'est ce
qui distingue une interface agentique d'un site animé — **le mouvement ne suit
pas la main de l'utilisateur, il suit ce que la machine est en train de faire.**

```
TEXTURA                          JARVIS
scroll 0→1              ─────►   phase agent + energy + progress
"top bottom"            ─────►   AgentPhase
stagger par indice      ─────►   stagger par indice (inchangé)
IntersectionObserver    ─────►   IntersectionObserver (inchangé)
```

Le magasin ne notifie React que sur changement de phase ou de progression :
`energy` est écrit à chaque frame par la passerelle vocale et se lit dans la
boucle, jamais par rendu.

---

## 4. Ce qui a été construit

`hud/src/ui/`, trois couches, chacune ne connaissant que celle du dessous.

```
core/     ticker.ts       une rAF pour tout le HUD, comptée par référence
          spring.ts       intégrateur ressort sans dépendance
          device.ts       palier machine décidé une fois
          useTicker.ts    accès React (+ variante « seulement si visible »)
state/    agentState.ts   le signal de déclenchement
components/ AmbientField.tsx   fond de profondeur réactif
            StateText.tsx      révélation lettre / mot / ligne
lab/      UiLab.tsx       banc d'essai — `?ui-lab` en développement
```

**Décisions notables.**

- *Pas de `react-spring`.* Le HUD embarque déjà `motion`. Ajouter une troisième
  bibliothèque d'animation pour obtenir un intégrateur de quarante lignes serait
  absurde — et la moitié des commentaires de `TextEngine` documente des bagarres
  avec ce même `react-spring`. Notre `Spring` a le même vocabulaire
  (`tension` / `friction` / `mass`), donc les réglages du métier se transposent.
- *Écriture directe dans le DOM.* `StateText` n'anime pas de composants React :
  il écrit `transform` et `opacity` sur les nœuds depuis la boucle. Une phrase de
  soixante lettres ne provoque pas soixante rendus par frame.
- *La boucle se coupe.* Dès que tous les ressorts sont posés, plus une écriture.
  Un HUD affichant du texte statique ne consomme rien. Même principe côté
  `AmbientField` en mouvement réduit : une frame stable, puis arrêt — le canvas
  conserve sa dernière image.
- *La nébuleuse est peinte à quart de résolution* puis étirée. Elle n'est faite
  que de dégradés très flous : la perte est invisible, et on divise par seize le
  nombre de fragments. Le sprite d'étoile est pré-rendu une fois — application
  au 2D du « tout précompiler pendant le chargement » de leur skill 3D.

**Vérifié au navigateur** (`?ui-lab`, cinq phases) : les deux composants et les
trois instances de texte partagent **une seule rAF** — le diagnostic affiche
4 abonnés, 1 boucle. Le titre est exposé aux technologies d'assistance comme une
phrase intacte, pas comme une suite de lettres.

---

## 5. Suite

Par ordre de valeur décroissante :

1. **Tokens en trois niveaux** (§2.2). Le HUD a `#00f5ff` en dur partout et une
   palette shadcn par défaut recouverte d'un `!important`. Tant que ça tient,
   aucun changement d'ambiance n'est possible sans chercher-remplacer.
2. **Passer `OrbCore3D` au crible du skill `optimize-3d-scene`.** Le HUD tourne
   sur NUC à GPU intégré ; le préchauffage des shaders et le bridage du pixel
   ratio sont les deux gains les plus immédiats.
3. **Brancher les passerelles réelles sur `agentState`** —
   `voiceProtocol` → `energy` et `phase`, `coreClient` → `progress`. Le banc
   d'essai simule aujourd'hui ce que la production écrira.
4. **Migrer `Background.tsx` vers `AmbientField`** une fois les teintes
   tokenisées. L'ancien démarre sa propre rAF et calcule 60² distances par frame
   pour ses lignes de liaison.
5. **Détecteur en extensions** (§2.5) pour agréger voix / gestes / clavier.
6. **Un hook `Stop`** dans `.claude/settings.json` sur le modèle du §2.2, pour
   que le cahier des charges ne dérive plus du code.

---

## 6. Attribution

Aucun code, aucun asset, aucune identité graphique de TEXTURA Agency n'a été
repris. Ce qui a été retenu relève de techniques de métier — boucle de rendu
partagée, décalage par indice, détection de lignes par géométrie, budget par
palier machine, copie accessible d'un texte découpé — et l'implémentation est
originale. Les dépôts ont été clonés en lecture seule dans un répertoire
temporaire, hors du dépôt JARVIS.
