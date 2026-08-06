# JARVIS Agentic UI — contrat d'architecture

> **Statut** : **validé — source de vérité.** Toute divergence entre ce document et
> le code est un défaut du code.
> **Rédigé** : 2026-08-03. **Validé** : 2026-08-04.
> **Remplace les questions ouvertes de** [`docs/AGENTIC_UI_ARCHITECTURE.md`](../AGENTIC_UI_ARCHITECTURE.md)
> (§6.1-7 et §8, décision Vision A/B) — ce document les tranche.
> **Références vendor** : [`docs/AGENTIC_UI_VENDOR_BRIEF.md`](../AGENTIC_UI_VENDOR_BRIEF.md).
>
> Aucun code, aucune migration. Ce texte définit **ce qui doit être vrai**, pas comment l'écrire.

---

## 1. Vision et objectifs

### Le problème

Un HUD écrit à la main sait afficher ce qui a été prévu. Il ne sait pas répondre à
« pourquoi les gestes ne marchent plus ? » — parce que la réponse est une **combinaison
de vues** (flux caméra, métriques, journaux, chronologie, actions) que personne n'a
dessinée à l'avance, et qu'il serait absurde de dessiner pour chaque question possible.

### Le concept central : la surface

**Une page n'est ni statique ni générée. C'est une surface.**

Une surface est un document JSON décrivant quels composants **enregistrés** sont présents,
dans quel état, à quel endroit. Elle a trois modes d'existence :

| Mode | Origine | Exemple | LLM requis |
|---|---|---|---|
| **Préfabriquée** | versionnée dans le dépôt | Paramètres, Applications | non |
| **Générée** | composée à la demande par le Planner | diagnostic caméra | oui |
| **Enrichie** | surface préfabriquée + panneau composé | page Caméra + analyse IA | oui, partiellement |

Les trois produisent **le même artefact** et traversent **le même renderer**. Une page
préfabriquée n'est rien d'autre qu'une composition mise en cache. C'est ce qui permet
de faire évoluer une page vers l'agentique sans réécrire le moteur — et de revenir en
arrière sans rien casser.

### Objectifs

1. L'agent **compose** l'interface ; il ne la **génère** jamais.
2. Le design system appartient à JARVIS — aucun pixel n'est délégué à un tiers.
3. Aucune action sensible ne contourne le Policy Engine.
4. Un client AG-UI tiers doit pouvoir se connecter **sans réécrire le Core**.

### Non-objectifs

- Remplacer les pages produit existantes.
- Adopter un runtime tiers (CopilotKit, A2UI, AG-UI) comme dépendance.
- Permettre à l'agent de redessiner le cadre du HUD.

---

## 2. Principes non négociables

```
IA → Proposition → Policy Engine → Autorisation → Exécution
```

| # | Principe | Conséquence directe |
|---|---|---|
| P1 | **Aucun JSX généré.** L'agent nomme des composants enregistrés. | Un nom absent du catalogue est rejeté, jamais rendu en dégradé. |
| P2 | **Le Core est le seul interlocuteur du HUD.** | Hermes ne parle jamais au navigateur. Pas de second canal. |
| P3 | **Le HUD est seul propriétaire du pixel.** | Hermes ignore la géométrie, les tailles réelles, le CSS. |
| P4 | **Le registre est une responsabilité produit.** | Ni Hermes ni un moteur tiers ne le possède. |
| P5 | **JARVIS BASE survit sans LLM.** | Toute fonction essentielle doit exister en surface préfabriquée. |
| P6 | **Une brique visuelle qui existe en produit est importée, jamais réécrite.** | L'orbe est `JarvisOrb.jsx`. Il n'y en a qu'une. |
| P7 | **Rien n'est écrit sans être branché.** | Une couche non rendue est indistinguable de code mort. |

> **P6 et P7 ne sont pas théoriques.** Le 2026-08-03, une bibliothèque de 4 792 lignes
> écrite mais jamais montée a été supprimée comme code mort ; elle contenait une
> troisième réimplémentation de l'orbe. Ces deux règles existent pour que cela ne se
> reproduise pas.

---

## 3. Architecture

```
                        ┌───────────────────────────────┐
   Utilisateur ────────►│  Intent                       │
                        │  « ouvrir la caméra »         │
                        │  « pourquoi ça rame ? »       │
                        └───────────────┬───────────────┘
                                        │
                     ┌──────────────────┴──────────────────┐
                     │                                     │
              résolution STATIQUE                  résolution DYNAMIQUE
              (surface préfabriquée)               (Planner sémantique)
                     │                                     │
                     │                        ┌────────────▼────────────┐
                     │                        │  HERMES        :8642    │
                     │                        │  Planner sémantique     │
                     │                        │  → PROPOSITION          │
                     │                        │    composants + $bind   │
                     │                        │    + gravité            │
                     │                        └────────────┬────────────┘
                     │                                     │ HTTP
                     └──────────────────┬──────────────────┘
                                        ▼
                     ┌─────────────────────────────────────┐
                     │  CORE                        :8765  │
                     │  ┌───────────────────────────────┐  │
                     │  │ 1. Existence                  │  │ ← ui_catalog.json
                     │  │ 2. Schéma (props valides)     │  │
                     │  │ 3. Policy (gravité)           │  │
                     │  │ 4. Binding données (filtré)   │  │
                     │  │ 5. Budget d'attention         │  │
                     │  └───────────────────────────────┘  │
                     │  → AUTORISATION ou REFUS motivé     │
                     └──────────────────┬──────────────────┘
                                        │ WebSocket
                                        │ SURFACE_SNAPSHOT / SURFACE_DELTA
                                        ▼
                     ┌─────────────────────────────────────┐
                     │  HUD                                │
                     │  Composer   régions, ordre, motion  │
                     │  Renderer   composants enregistrés  │
                     │  ── seul propriétaire du pixel ──   │
                     └──────────────────┬──────────────────┘
                                        │ USER_INTENT (action, gravité)
                                        └──────────► retour Core → Policy
```

**Lecture** : un seul chemin descendant, un seul chemin remontant, un seul point de
contrôle. Les deux résolutions convergent avant le Core — donc **une surface générée
et une surface préfabriquée subissent exactement les mêmes validations**.

---

## 4. Protocole UI

### 4.1 Le choix structurant

**La surface est l'état.** Un document JSON unique représente une surface. Créer,
modifier et supprimer un composant sont **la même opération** : un patch sur ce
document (JSON Patch, RFC 6902). C'est la forme native d'AG-UI, donc la compatibilité
est acquise sans effort.

### 4.2 Document de surface — contrat

Structure **plate, indexée par identifiant**. Les relations parent/enfant passent par
des identifiants, jamais par imbrication : les JSON Pointer restent courts et stables.

```
surfaces
  <surface_id>
    root         liste ordonnée d'identifiants racine
    components
      <id>
        name     doit exister dans ui_catalog.json
        props    validées contre le schéma du catalogue
        state    doit appartenir aux états déclarés
        region   top | left | center | right | bottom | overlay | backdrop
        size     compact | normal | wide | fill
        children liste d'identifiants
data           valeurs partagées, résolues par le Core
pending
  approvals    demandes HITL en cours
```

### 4.3 Enveloppe commune

| Champ | Rôle |
|---|---|
| `v` | version du protocole |
| `type` | type d'événement |
| `id` | identifiant unique de l'événement |
| `ts` | horodatage |
| `run_id` | composition à laquelle l'événement appartient |
| `seq` | **monotone par run** |

**Règle de sûreté** : si le HUD détecte un trou dans `seq`, il **jette son état local et
émet `SURFACE_RESYNC`**. Sans cela, un delta perdu produit une interface silencieusement
fausse — le pire mode de défaillance possible, car rien ne le signale.

### 4.4 Événements — Core → HUD

| JARVIS | Équivalent AG-UI | Rôle |
|---|---|---|
| `SURFACE_SNAPSHOT` | `STATE_SNAPSHOT` | état complet : connexion, resync |
| `SURFACE_DELTA` | `STATE_DELTA` | patch JSON — créer / modifier / supprimer |
| `RUN_STARTED` | `RUN_STARTED` | borne le début d'une composition |
| `RUN_FINISHED` | `RUN_FINISHED` | fin de composition |
| `ACTION_RESULT` | `TOOL_CALL_RESULT` | retour d'exécution après autorisation |
| `RUN_ERROR` | `RUN_ERROR` | échec |
| `jarvis.approval.request` | `CUSTOM` | demande HITL |
| `jarvis.notify` | `CUSTOM` | notification hors surface |

### 4.5 Événements — HUD → Core

| JARVIS | Rôle |
|---|---|
| `USER_INTENT` | `action`, composant source, charge utile, **gravité** |
| `APPROVAL_RESPONSE` | identifiant de demande, accordé/refusé, portée |
| `SURFACE_RESYNC` | réclame un snapshot complet |

### 4.6 La règle de compatibilité AG-UI

> Tout ce qui existe dans AG-UI utilise **le type AG-UI**.
> Tout ce qui est propre à JARVIS passe par `CUSTOM`, préfixé `jarvis.`.

Conséquence vérifiable : un client AG-UI standard ignore les `CUSTOM` inconnus et
**rend quand même la surface**. Il perd le HITL et les notifications, pas l'interface.

**AG-UI est une compatibilité de transport et de représentation, pas une dépendance.**
Aucun paquet `@ag-ui/*` ni `@copilotkit/*` n'entre dans le produit.

### 4.7 Ce qu'AG-UI n'a pas

La **gravité** (`info < media < home < admin`) portée par chaque intention. Aucun
protocole tiers ne la connaît. C'est ce qui distingue JARVIS d'un agent conversationnel
avec des widgets.

---

## 5. Registry et catalogue

### 5.1 Emplacement

```
hud/src/agentic/registry/
    definitions.ts    noms + schémas + métadonnées   ← AUCUN import React
    renderers.tsx     nom → composant React
    index.ts          assemble, vérifie la correspondance à la compilation
```

**Pourquoi le HUD et pas le Core** : la vérité du registre est « ce nom s'affiche
réellement ». Seul le renderer peut le garantir. Un registre côté Core dériverait du
réel sans que rien ne le signale.

**Pourquoi pas `packages/` tout de suite** : aucun second consommateur n'existe. La
séparation `definitions` / `renderers` rend l'extraction future triviale — un
déplacement de fichier, pas une refonte.

### 5.2 Métadonnées

| Champ | Rôle | Consommateur |
|---|---|---|
| `name` | identifiant unique | tous |
| `description` | une phrase, destinée à l'agent | Hermes |
| `props` | schéma typé, avec défauts | Core (validation), HUD (rendu) |
| `states` | états admis, le premier par défaut | Core, HUD |
| `category` | famille (system, media, layout…) | Hermes |
| `permissions` | ex. `terminal.read` | **Policy** |
| `requiredContext` | ex. `shell`, `camera` | **Policy** |
| `supportedActions` | actions émissibles | **Policy** (gravité) |
| `preferredSize` / `region` | intention de placement | HUD Composer |
| `priority` | poids de composition | HUD Composer |
| `tags` | appariement Planner | Hermes |

`permissions` et `requiredContext` ne sont pas décoratifs : ils permettent au Policy
Engine de refuser **avant rendu**, pas seulement avant action.

### 5.3 Chaîne de propagation

```
hud/src/agentic/registry/definitions.ts     SOURCE DE VÉRITÉ
            │  génération au build
            ▼
        ui_catalog.json                     ARTEFACT — jamais édité à la main
            │
            ▼
        Core (validation + Policy)
            │
            ▼
        Hermes (catalogue en lecture)
```

**Règle anti-dérive** : le Core **refuse de relayer tout composant absent de
`ui_catalog.json`**. Un composant ajouté sans régénération ne passe pas. Échec bruyant,
jamais silencieux.

---

## 6. Flux Hermes → Core → HUD

### 6.1 Séparation des rôles

| Acteur | Rôle | Ne fait jamais |
|---|---|---|
| **Hermes** | Planner **sémantique** : quoi montrer, quelles données demander, quelle gravité | connaître la géométrie, les pixels, les composants React |
| **Core** | Planner d'**admission** : existence, schéma, Policy, binding, budget | dessiner |
| **HUD** | **Composer** + **Renderer** : où poser, dans quel ordre, avec quelle animation | faire confiance sans revalider |

Hermes n'est pas « un planificateur avec un garde-fou ». C'est **un proposeur** dont le
Core est le seul exécuteur. La distinction est de nature, pas de degré.

### 6.2 Séquence

1. **Intention** — utilisateur (voix, texte, geste) ou événement système.
2. **Proposition** — Hermes émet : composants souhaités, données demandées sous forme
   de liaisons (`$bind`), gravité des actions exposées.
3. **Admission** — le Core exécute cinq contrôles, dans cet ordre :
   1. existence au catalogue ;
   2. validation des props contre le schéma ;
   3. Policy sur `permissions`, `requiredContext`, gravité ;
   4. **résolution des liaisons de données** — c'est le Core qui lit et filtre, jamais
      Hermes qui remplit ;
   5. budget d'attention.
4. **Diffusion** — `SURFACE_SNAPSHOT` ou `SURFACE_DELTA` sur le WebSocket.
5. **Rendu** — le HUD revalide, puis compose et affiche.
6. **Retour** — un composant émet une intention ; elle repart au Core, qui repasse par
   la Policy avant toute exécution.

### 6.3 Le point le plus souvent négligé

**Hermes ne remplit jamais les props avec des données.** Il demande une liaison
(`$bind: "system.cpu"`), et le Core décide s'il la sert. Sinon une composition
deviendrait un canal d'exfiltration : il suffirait à l'agent de mettre une donnée
protégée dans un titre pour l'afficher.

---

## 7. Policy Engine et HITL

### 7.1 Ce qui reste sous contrôle Policy

| Contrôle | Refus si |
|---|---|
| **Existence** | composant absent du catalogue |
| **Gravité** | action `media` / `home` / `admin` sans autorisation |
| **Données** | liaison vers une source non autorisée pour cet utilisateur |
| **Contexte** | `requiredContext` non satisfait (caméra absente, shell interdit) |
| **Budget d'attention** | trop de composants, ou `overlay` bloquant l'entrée sans gravité justifiée |

Le budget d'attention est un déni de service par l'interface : rarement anticipé, et
suffisant pour rendre une machine inutilisable sans qu'aucune action « sensible » ne
soit exécutée.

### 7.2 HITL

Le HITL n'est pas un mécanisme parallèle. C'est la Policy rendue **visible** :

```
Composant émet une action  ──►  Core : gravité ≥ seuil ?
                                   │
                          non ─────┤───── oui
                           │       │
                      exécution    ▼
                                jarvis.approval.request
                                   │
                                ApprovalCard (composant enregistré)
                                   │
                                APPROVAL_RESPONSE
                                   │
                          accordé ─┴─ refusé → tracé, pas d'exécution
```

**Ce qui bloque n'est pas l'interface, c'est le Core.** L'`ApprovalCard` montre le
blocage ; elle ne l'implémente pas. Contourner le HUD ne contourne rien.

La demande d'approbation vit dans `pending.approvals` du document de surface : elle
survit donc à une reconnexion et à un resync.

---

## 8. Pages produit et surfaces agentiques

### 8.1 La décision

L'ancienne alternative **Vision A (produit d'abord) / Vision B (agentic first)** est
close. Ni l'une ni l'autre : **tout est une surface**, avec trois modes d'existence
(§1). La question n'est plus « cette page est-elle statique ou générée ? » mais
« **cette surface est-elle préfabriquée, générée, ou enrichie ?** »

### 8.2 Pourquoi pas l'agentic first intégral

Deux raisons, la première suffisant à trancher :

1. **`JARVIS BASE` doit survivre sans LLM** (règle produit). Si les pages sont
   composées à la demande, plus de LLM signifie plus d'interface.
2. Un OS a besoin de **prévisibilité pour le fréquent**. « Ouvrir la caméra » doit être
   instantané et **identique à chaque fois**. Personne ne veut que sa page Paramètres
   soit réarrangée différemment à chaque visite.

### 8.3 Pourquoi pas le tout-statique

Une page écrite à la main ne répond qu'aux questions prévues. Le diagnostic, l'analyse
et l'exception sont exactement les cas où l'interface doit s'adapter — et exactement
ceux qu'on ne peut pas dessiner à l'avance.

### 8.4 Trajectoire

| État | Aujourd'hui | Cible | Déclencheur |
|---|---|---|---|
| Pages produit React | `SettingsPanel`, `SearchPanel`, `CommandConsole`… | inchangées | — |
| Zone agentique | `AgentSurface` | — | fait (P1) |
| Surface préfabriquée | — | document versionné | quand une page gagne à varier |
| Surface générée | `surface/compose` | Planner | fait (P3) |

**Aucune page n'est convertie par principe.** Une page devient une surface le jour où
elle a une raison de varier — jamais avant.

### 8.5 Le volet Applications — tranché le 2026-08-05

Le lanceur **reste une surface préfabriquée**, et n'est jamais composé. Deux raisons,
la première suffit :

1. `JARVIS BASE` doit survivre sans LLM. Un lanceur composé disparaîtrait au moment
   précis où l'on en a le plus besoin.
2. Un OS a besoin de prévisibilité pour le fréquent (§8.2). Un lanceur dont les icônes
   bougent est un lanceur qu'on n'apprend jamais.

**Une tuile n'est pas une application : c'est une intention.** Elle ne connaît pas son
exécutant, et n'a pas à le connaître — c'est ce qui permet de remplacer Hermes sans
toucher au HUD. Le champ `hermesTool` a disparu du catalogue : il nommait des outils
(`home_assistant`, `node_cerveau`, `agent_reach`) dont aucun n'existait, ce qui rendait
vingt tuiles sur trente inertes. Il est remplacé par `intent`, résolu côté Core dans
`core/jarvis_core/capabilities.py`.

**La variation n'a pas lieu dans le panneau, mais dans la fenêtre qu'il ouvre.** Chaque
capacité déclare son mode d'affichage, et le HUD ne choisit rien :

| `display` | Ce qui s'affiche | LLM |
|---|---|---|
| `NATIVE` | une page produit React existante | non |
| `PREFAB` | une surface versionnée | non |
| `GENERATED` | une surface composée par le Planner | oui |

Le chemin d'une tuile est celui d'une intention ordinaire — `surface/open` applique la
même Policy, la même carte d'autorisation et la même exécution que `surface/intent`.
Le lanceur n'a **aucun raccourci** : c'est ce qui empêche « cliquer sur Maison »
d'être plus permissif que « demander à Hermes d'allumer le salon ».

Quand une demande ne correspond à **aucune** tuile, la bonne réponse n'est pas
d'inventer une entrée au catalogue : c'est d'ouvrir une surface **générée**. Le
lanceur n'a pas bougé ; une fenêtre est apparue à côté.

---

## 9. Roadmap

**Règle de progression** : une phase se termine quand **quelque chose est visible à
l'écran**. Pas quand le code compile.

| Phase | Contenu | Critère de sortie — observable |
|---|---|---|
| **P0** | Protocole + registre. `definitions.ts`, génération `ui_catalog.json`, `SURFACE_SNAPSHOT`/`DELTA` sur `:8765`, zone `AgentSurface` montée. **Zéro LLM.** | Un document de surface **écrit à la main**, poussé sur le WS, affiche **un** composant enregistré |
| **P1** | Renderer + Composer. Régions, tailles, application des JSON Patch, resync sur trou de `seq`. | Composition de **3 composants** ; un delta modifie une prop **sans remonter** le composant |
| **P2** ✅ | Policy + HITL. Gravité, `ApprovalCard`, refus côté Core, liaisons de données filtrées. | Une action `admin` est **bloquée** ; l'approbation débloque ; le refus est **tracé** |
| **P3** 🟡 | **Hermes compose.** Catalogue injecté, proposition, admission. | La question caméra produit une composition valide **sans JSX généré** ; une proposition invalide est **rejetée et visible** |
| **P4** | Extension (Paramètres, Applications, Voix, Calibration) + mémoire et personnalisation | Une 2ᵉ surface ; une préférence survit à un redémarrage |

**La Policy précède la composition par LLM.** P2 avant P3, jamais l'inverse : un agent
ne compose pas tant que le garde-fou n'existe pas.

### P2 — clos le 2026-08-05

Preuve rejouable : `core/.venv/Scripts/python.exe -m jarvis_core._smoke_p2`
(22 contrôles, sans WebSocket ni navigateur).

Ce qui a été fait, et pourquoi ce n'était pas qu'une extension :

| Contrôle | État avant |
|---|---|
| **Gravité dérivée du catalogue** (`gravity_for`) | ⚠ **contournement de Policy** — le Core lisait `data["gravity"]` envoyé par le client. Un WebSocket pouvait annoncer `info` pour une action `admin`. `definitions.ts` affirmait pourtant l'inverse |
| **Exécution après autorisation** (`IntentExecutor`) | ⚠ **maillon absent** — `close_approval` jetait l'intention. Le vert « autorisé » ne prouvait que l'affichage |
| Props validées contre leur JSON Schema | absent |
| Liaisons `$bind` refusées tant que la résolution n'existe pas | absent |
| `permissions` / `requiredContext` à l'admission | déclarés au catalogue, jamais lus |
| Budget d'attention (12 par surface, 24 au total, 1 `overlay`) | absent |

Deux règles de conception héritées de ces défauts :

1. **Un contrôle appliqué du côté contrôlé n'est pas un contrôle.** Le HUD
   calculait la bonne gravité ; ça n'a jamais protégé le Core.
2. **Absence d'exécutant = refus tracé, jamais succès silencieux.** Une action
   autorisée sans exécutant repart en `ok:false, executed:false`, et le HUD la
   journalise explicitement. Sans ça on réinstallait le mode de panne du projet
   à l'endroit même où on le corrigeait.

Reste ouvert, et c'est un arbitrage produit, pas un oubli : la table
`ROLE_PERMISSIONS` de `surface.py` est une **baseline**. `admin` reçoit tout le
catalogue (calculé), `user` les trois lectures, `child` le seul `system.read` —
délibérément pas `memory.read`, puisque `MemoryPanel` expose la mémoire du foyer
et qu'elle est **effaçable**. Invariant appliqué : s'identifier ne retire jamais
un droit.

### P3 — clos le 2026-08-05, **vérifié sur un vrai modèle**

`core/jarvis_core/composer.py`, action WebSocket `{"type":"surface","action":"compose","question":"…"}`.
Preuve hors ligne : `core/.venv/Scripts/python.exe -m jarvis_core._smoke_p3` (25 contrôles).

**Vérifié sur `qwen/qwen3.5-flash-02-23` via OpenRouter** (mode `cloud`) :

| Question | Confiance | Résultat |
|---|---|---|
| « montre-moi la charge de la machine » | 1,00 | `SystemMonitor` — écartés : CommandConsole, MemoryPanel → admis |
| « qu'est-ce que tu as retenu de la maison ? » | 0,95 | `MemoryPanel` → admis |
| « quelle est la recette du pot-au-feu ? » | 0,10 | **refusé au plancher** |

Le troisième cas justifie le plancher à lui seul. Le modèle a répondu « aucun
composant disponible ne permet d'afficher une recette culinaire, la question sort
du champ » — mais il a **quand même produit un `document`**, que le Core aurait
admis puisqu'il était valide. Sans plancher, une question de cuisine affiche un
moniteur système. L'admission vérifie qu'une composition est *légale*, jamais
qu'elle est *pertinente* : ce sont deux gardes distincts et il en faut deux.

Prouvé par ailleurs (hors ligne) : catalogue injecté **filtré par les permissions
de la session** ; réponse lue même emballée en ```json ou précédée de bavardage ;
composant inventé, JSX, prop fabriquée, liaison inconnue ou écran noyé **refusés
et renvoyés au client** ; liaisons servies par le Core. Sans LLM joignable, la
composition est refusée sans que le Core tombe.

Reste à faire pour que ce soit visible à l'écran au sens du §9 (« une phase se
termine quand quelque chose est visible ») : déclencher `compose` **depuis le
HUD**. La chaîne Core est vérifiée, le geste navigateur ne l'est pas encore.

Deux décisions à connaître :

1. **Qui compose.** Le contrat écrit « Hermes compose ». Le Core ne demande
   pourtant rien à Hermes — il le sonde (`/health`) et rien d'autre — et
   `CLAUDE.md` impose l'AI Provider Manager comme passage unique vers un LLM.
   `composer.py` appelle donc `providers.complete()`. Le jour où Hermes expose
   une complétion, c'est le Provider Manager qui y route et ce fichier ne bouge
   pas : la séparation du §6.1 porte sur **qui admet**, pas sur qui propose.
2. **Plancher de confiance** (`MIN_CONFIDENCE = 0.45`), repris du
   `LayoutDecision` de `second-brain-research-dashboard`. Sans lui, une question
   hors sujet produit quand même une surface : le modèle prend le composant le
   moins éloigné et l'affiche. L'utilisateur voit alors une réponse assurée à
   une question que personne n'a comprise.

Défaut trouvé en écrivant le test, et corrigé : les sources de liaison sont
maintenant **typées** et leur type est publié à l'agent. Sans ça, lier
`system.cpu` (nombre) dans une prop `string` se faisait refuser à l'admission
sans que l'agent puisse comprendre pourquoi — le catalogue lui donnait le type
de la prop, rien ne lui donnait celui de la donnée.

### Le premier test

```
Document JSON écrit à la main
        ▼
WebSocket Core :8765
        ▼
AgentSurface (HUD)
        ▼
SystemMonitor affiché
```

Sans LLM, sans Hermes, sans Planner. `SystemMonitor` est le bon premier composant : il
**existe déjà**, il est **déjà branché** sur sa passerelle `systemMetrics`, et il
n'expose aucune donnée sensible.

Si cela fonctionne, tout le reste est de l'extension. Si cela ne fonctionne pas, aucune
quantité de LLM ne le sauvera.

---

## 10. Risques et décisions futures

### 10.1 Risques

| Risque | Origine | Parade |
|---|---|---|
| **Réimplémentation d'une brique produit** | `library/Orb.tsx` a réimplémenté `JarvisOrb` (2026-08-03) | P6 : import obligatoire, jamais réécriture |
| **Couche écrite jamais branchée** | 4 792 lignes supprimées comme code mort (2026-08-03) | P7 : critère de sortie observable par phase |
| **Dérive registre ↔ catalogue** | deux copies maintenues à la main | `ui_catalog.json` généré ; refus de relais si absent |
| **Dépendance pré-1.0** | `@ag-ui/client` en `0.0.42`, `@a2ui/web_core` en `0.9.0` | protocole copié, aucun paquet importé |
| **Rupture d'API amont** | `pydantic-ai` 2.x a cassé le backend de second-brain en une version majeure | vendor = lecture, jamais dépendance |
| **Exfiltration par les props** | l'agent place une donnée protégée dans un titre | liaisons résolues **par le Core** |
| **Déni d'attention** | l'agent sature l'écran ou pose un overlay bloquant | budget d'attention en Policy |
| **Secret dans `vendor/`** | un `.env` de test peut contenir une vraie clé | `vendor/` gitignoré ; aucun `.env` laissé après test |

### 10.2 Décisions tranchées (2026-08-04)

| # | Décision | Conséquence |
|---|---|---|
| 1 | **Une seule zone `AgentSurface`**, au même endroit quelle que soit la page | l'utilisateur sait toujours où regarder ; un seul point de montage à écrire |
| 2 | **Une composition ne survit pas au rechargement** du HUD | c'est une réponse à une question, pas un document ; aucun stockage persistant à prévoir en P0-P1 |
| 3 | **`ui_catalog.json` est généré et commité** | relisible, révisable en revue de code, ne peut pas changer silencieusement à l'exécution |
| 4 | **Une nouvelle composition remplace la précédente** | l'écran ne se remplit pas ; un seul `run_id` actif à la fois |

Conséquence commune aux quatre : **P0 n'a besoin d'aucune persistance, d'aucun
multiplexage et d'aucun service de catalogue.** Le périmètre du premier jalon s'en
trouve réduit d'autant.

### 10.3 Décisions différées

- Extraction vers `packages/ui` et `packages/agentic-ui` — **quand un second
  consommateur existe**, pas avant.
- Adoption d'un client AG-UI réel — possible plus tard **sans réécriture**, à condition
  que le Core émette dès P0 des événements de forme AG-UI. C'est un remplacement, pas
  une refonte.
- Mémoire et contexte (MCP) — P4, en parallèle de la mémoire Hermes, pas en fusion.
