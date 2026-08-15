# Brief Cursor — HUD V2 Agentic Surface (§8 du cahier V2)

> À donner tel quel à Cursor. Source complète : `docs/JARVIS_V2_CAHIER_DES_CHARGES.md`
> §8 (audit détaillé, tableau comparatif §8.13). Ce brief séquence les chantiers
> dans l'ordre de dépendance réelle (§8.15) — **respecter l'ordre**, chaque étape
> s'appuie sur la précédente ou évite de la refaire en double.
>
> Règle générale : **avant de créer un composant, vérifier qu'il n'existe pas
> déjà** (voir « Ce qui existe déjà » à chaque étape). Ce dépôt a déjà eu des
> doublons involontaires (deux systèmes Glass parallèles, étape 0) — ne pas en
> ajouter un troisième.

## Invariants non négociables (valables pour TOUTES les étapes)

1. **P6 — l'orbe est protégée.** `hud/src/app/components/orb/{Orb.jsx,
   JarvisOrb.jsx, OrbLite.tsx}` ne se réimplémentent jamais, ne se modifient
   jamais dans leur rendu. On les importe, on les enveloppe, on change leur
   position/état — jamais leur code interne.
2. **Le protocole Core↔HUD ne change pas.** `SURFACE_SNAPSHOT`/`SURFACE_DELTA`,
   `hud/src/agentic/protocol/surface.ts`, `composer.ts` sont figés. Toute
   nouvelle surface passe par le registre existant
   (`hud/src/agentic/registry/definitions.ts`), pas par un mécanisme parallèle.
3. **Le HUD ne décide jamais.** Il envoie des intentions (`emit` dans
   `AgentSurface.tsx`) et attend que le Core tranche. Ne jamais faire agir un
   composant HUD directement sur le Core sans passer par ce canal.
4. **Zéro donnée inventée.** Un composant sans donnée réelle du Core affiche
   un état vide honnête (« en attente », « non branché ») — jamais une valeur
   simulée qui a l'air réelle. C'est la règle la plus stricte de tout le dépôt.

---

## Étape 0 — Décision Glass (préalable, pas de code avant ça)

**Constat** : deux bibliothèques Glass existent et sont toutes les deux
utilisées en production dans le HUD :

- `hud/src/components/glass/` (`GlassPanel`, `GlassCard`, `GlassButton`,
  `GlassPill`, `GlassDock`, `GlassModal`) — utilisée par les écrans d'auth
  (`HudAuthGate.tsx`, `LockScene.tsx`, `AuthScene.tsx`, `InstallWelcome.tsx`,
  `FirstSetupScene.tsx`).
- `hud/src/spatial/` (`GlassButton`, `GlassCard`, `GlassPanel`,
  `GlassSurface`, `SpatialWindow`) — thème global (`HudSpatialRoot` enveloppe
  toute l'app depuis `main.tsx`), utilisée via `agentic/library/vision.tsx::
  VisionPane` par une partie des renderers agentiques (`ApprovalCard.tsx`,
  `ActionRequest.tsx`, `Primitives.tsx`, `ResultPanel.tsx`).

**Décision pour ce chantier** (à appliquer, pas à re-débattre) : utiliser
`hud/src/components/glass/` comme référence pour tout ce que ce brief demande
de construire — c'est déjà la convention de l'écran touché à l'étape 4
(auth), et c'est le système le plus simple/mature des deux. **Ne PAS** migrer
ou supprimer `spatial/*` dans ce chantier — il reste utilisé ailleurs
(renderers agentiques existants), l'unifier est un chantier séparé, à ne pas
faire en même temps que le reste de ce brief (risque de tout casser d'un
coup). Se contenter, pour tout nouveau composant créé ci-dessous, d'importer
`components/glass/`, jamais `spatial/*`.

---

## Étape 1 — Corriger le commentaire obsolète d'`AgentSurface.tsx`

Fichier : `hud/src/agentic/AgentSurface.tsx`, lignes 1-11.

Le commentaire dit que la surface *« ne se superpose jamais au HUD, vit
toujours dans une AppWindow »*. C'est faux depuis que `App.tsx` (mode
`hudMode === 'surface'`, lignes 238-253) monte `AgentSurface` en plein écran
via `MockAppContent`. Mettre à jour le commentaire pour refléter les DEUX cas
réels : fenêtre `AppStage` **et** plein écran `App.tsx`. Aucun changement de
code, uniquement la documentation en tête de fichier — mais ne pas sauter
cette étape, un commentaire faux dans ce fichier trompe le prochain agent qui
le lit.

---

## Étape 2 — Nouvelles entrées du registre : `ToolCall` et `VerificationCard`

**Ce qui existe déjà, à réutiliser** : le mécanisme de registre lui-même
(`hud/src/agentic/registry/definitions.ts` — schéma Zod, permissions, gravité,
région/taille préférées) et deux renderers déjà là dans le même esprit :
`ApprovalCard.tsx` (carte glass, badge de gravité, boutons `emit`) et
`ResultPanel.tsx` (titre/source/corps/items). S'en inspirer directement pour
le style, ne pas repartir de zéro visuellement.

**À créer** :

1. **`ToolCall`** — représente un appel d'outil unique (nom, statut
   `started|completed|failed`, durée, résumé). Props minimales : `intent:
   string`, `owner: string`, `status: string`, `duration_ms?: number`,
   `summary?: string`. Inspiré de la structure `ToolEvent` côté Core
   (`core/jarvis_core/tool_events.py`) et de ce qu'affiche déjà
   `ToolsPage.tsx` côté Dashboard (`vendor` — voir ce fichier pour le mapping
   risque→couleur, à répliquer).
2. **`VerificationCard`** — représente le pipeline §7 du cahier V2 :
   `PROPOSITION → ACTION DEMANDÉE → ACTION EXÉCUTÉE → RÉSULTAT OBSERVÉ →
   RÉSULTAT VALIDÉ`, avec un état terminal `verified` (vert) ou `disputed`
   (orange/rouge). **Ce composant n'a pas encore de donnée réelle à afficher
   tant que §7 (Vérification, Core) n'est pas construit** — le créer
   maintenant prépare le registre, mais ne pas inventer de données de
   démonstration qui auraient l'air réelles (invariant §4 ci-dessus). Utiliser
   `?surface=<nom>` (mécanisme dev déjà présent dans `AgentSurface.tsx`,
   ligne 227-234) avec un fixture JSON écrit à la main pour le développement
   visuel, jamais un mock intégré au composant lui-même.

Enregistrer les deux dans `definitions.ts` en suivant exactement le patron
des entrées existantes (catégorie, description écrite POUR l'agent, `states`,
`permissions`, `requiredContext`, `supportedActions`, `preferredRegion`,
`preferredSize`, `priority`, `tags`).

---

## Étape 3 — Porter le Terminal du Dashboard vers une surface HUD

**Ce qui existe déjà, à réutiliser** : le Core (`core/jarvis_core/ws/
handlers/terminal.py`, route `type: 'terminal'`, actions `exec`/`approval`)
est déjà complet et fonctionnel — ne rien y toucher. Le Dashboard a déjà un
client complet et testé (`vendor/dashboard` ou son emplacement actuel —
`src/pages/TerminalPage.tsx` : sélecteur d'hôte NUC/VPS/Pi, historique de
sortie, gestion de la carte d'approbation). C'est ce fichier à **adapter**,
pas à réécrire depuis zéro.

**À créer** : un nouveau composant registre `Terminal` (ou nom similaire),
qui reprend la logique de `TerminalPage.tsx` (connexion, `exec`, `approval`,
affichage de sortie avec code couleur par type de ligne) mais rendu comme
surface agentique (props/state/emit au lieu d'un state React local + WS
dédié). Le canal `emit` remplace les appels directs `client.send(...)` du
Dashboard — passer par le même chemin que les autres composants du registre
(`action: 'intent'`, gravité dérivée du catalogue, jamais annoncée par le
composant).

**Attention** : la Policy classe déjà `system.shell`/`vps.terminal`/
`pi.terminal` en risque `VPS`/`ADMIN` avec allowlist stricte (voir
`core/jarvis_core/policy.py`) — ne pas affaiblir ça côté HUD, le composant ne
fait qu'afficher, la Policy reste l'autorité.

---

## Étape 4 — Indicateur vocal auth (le chantier le plus prêt, le plus petit)

**Objectif** : l'écran d'authentification (`AuthScene.tsx`,
`FirstSetupScene.tsx`) ne doit plus faire pulser l'orbe JARVIS pour
représenter l'écoute du micro. Un petit composant glass dédié, sous la
caméra, prend ce rôle.

**Ce qui existe déjà et ne doit PAS être reconstruit** :

- **Niveau micro réel** — `hud/src/app/components/auth/useMicOrbAnalyser.ts`.
  Vrai `AnalyserNode` Web Audio (`getByteFrequencyData`), retourne `{
  micAnalyser, micLevel }` avec `micLevel` dans `[0,1]`. Réutiliser ce hook
  tel quel.
- **Wake word** — `hud/src/app/bridge/audioBus.ts::subscribeWakeWord`.
  Abonnement existant, à utiliser pour la « réaction spécifique » demandée à
  la reconnaissance du mot de réveil.
- **État du pipeline** — `orchState.orbState` / `faceHologram.phase` dans
  `AuthScene.tsx` encodent déjà `camera_on → obstruction → reconstruction →
  success/denied`. Le nouveau composant les reçoit en props, ne les
  recalcule pas.

**À créer** : `hud/src/app/components/auth/AuthMicIndicator.tsx` — icône
microphone (glass, `components/glass/GlassPanel` ou équivalent compact),
petit halo/anneau réagissant à `micLevel` (amplitude ou opacité du halo, pas
28 barres). États visuels distincts :

| État | Comportement |
|---|---|
| Repos (pas de voix) | Quasi immobile, halo faible |
| Voix détectée | Vibre / halo pulse avec `micLevel` |
| Wake word reconnu | Réaction courte et distincte (flash/scale ponctuel) |
| Pendant l'auth (scan facial en cours) | Reflète `faceHologram.phase` |
| Succès | Confirmation visuelle très brève (checkmark glass ou pulse vert court) |

**À retirer/modifier** :

- `OrbSpatial.tsx::useOrbVeilleReactive` — cette fonction fait passer l'orbe
  en `listening` + pulser son volume au micro. Retirer ce comportement de
  écoute-réactive ; l'orbe garde son rôle de représentation de JARVIS
  uniquement (idle/thinking/speaking liés à l'état réel de JARVIS, jamais au
  niveau micro brut).
- `AuthVoiceWave.tsx` — barre égaliseur 28 barres/320px, ne correspond pas à
  la cible (composant compact). Remplacer ses usages dans `AuthScene.tsx` et
  `FirstSetupScene.tsx` par `AuthMicIndicator`. Ne pas supprimer le fichier
  tant que tous les usages n'ont pas été migrés et vérifiés (grep `
  AuthVoiceWave` avant de retirer le fichier).

**Ne pas construire** (déjà réel, hors scope) : un nouveau pipeline audio, un
nouveau détecteur de wake word, un nouveau système d'état de pipeline — les
trois existent et doivent être *consommés*, pas recréés.

---

## Étape 5 — NE PAS FAIRE (pour l'instant)

Explicitement hors scope de ce brief, à ne pas anticiper :

- Mission UI multi-agents (DAG, dépendances entre étapes) — dépend d'un
  registre d'agents Core qui n'existe pas encore (§4 du cahier V2). Construire
  la représentation avant l'agent réel produit une démo vide.
- Généraliser `NeuralMap.tsx`/`hermesNodes.ts` en Graphify générique — même
  raison, rien à représenter tant que §4/§5 n'existent pas côté Core.
- Sondes matérielles étendues (GPU, température, réseau) — chantier Core
  (`metrics.py`), pas HUD. Le HUD affichera ce que le Core enverra, pas
  l'inverse.

## Critère de fin de chantier

Chaque étape doit se vérifier indépendamment :

- Étape 1 : relecture du commentaire, aucun changement fonctionnel à tester.
- Étape 2 : `ToolCall`/`VerificationCard` apparaissent via `?surface=<fixture>`
  en dev, sans erreur console, avec des props de test écrites à la main.
- Étape 3 : depuis le HUD, une commande Terminal réelle (ex. `df -h` sur NUC)
  s'exécute et affiche une sortie réelle, sous approbation Policy comme le
  Dashboard actuel.
- Étape 4 : parler devant le micro sur l'écran d'auth fait réagir
  `AuthMicIndicator`, PAS l'orbe. Dire le wake word produit la réaction
  courte distincte. L'orbe reste visible mais immobile/état JARVIS seul.
