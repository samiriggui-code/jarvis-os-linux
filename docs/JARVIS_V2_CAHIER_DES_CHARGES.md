# JARVIS V2 — Cahier des charges

> Statut : **proposition de spec**, pas encore un plan approuvé section par section.
> Origine : vision architecturale transmise par Samir le 2026-08-10, confrontée au code
> réel du dépôt à cette date. Renvois `§N` internes à ce document. Ne remplace pas
> `cahierdecharges.md` (V1, toujours en vigueur) — V2 est la couche qui s'ajoute
> au-dessus une fois que V1 tient debout.
>
> Règle d'écriture de ce document, copiée sur le style du reste du dépôt : chaque
> section distingue **ÉTAT ACTUEL** (ce qui existe, avec fichier et ligne),
> **CIBLE V2** (ce qui est visé) et **ÉCART** (le travail réel entre les deux). Un
> écart non chiffré n'est pas un écart, c'est un vœu.

## 0. Principe fondamental

JARVIS n'est pas un LLM et n'est pas un chatbot. JARVIS **est le Core**. Les LLM
(Hermes, Claude, DeepSeek, Qwen), les Skills, les agents et les systèmes de
perception/exécution sont des composants que le Core orchestre — jamais l'inverse.

```
UTILISATEUR → CORE → ORCHESTRATION → HERMES / SKILLS / AGENTS / OUTILS
            → EXÉCUTION → RÉSULTATS → VÉRIFICATION CORE
            → MÉMOIRE / MISSION CONTROL → HUD + VOIX → UTILISATEUR
```

Ce principe est **déjà l'architecture réelle** du dépôt, pas une aspiration : voir §1.

---

## 1. JARVIS Core — chef d'orchestre

### ÉTAT ACTUEL

Le Core décide déjà, avant tout appel à un exécutant, **qui** doit agir :

- `capabilities.py::Owner` — `CORE | HERMES | DEVICE`, une ligne par intention
  (`CAPABILITIES` dict) ;
- `PolicyEngine.evaluate()` (`policy.py`) — gate CHAQUE délégation, jamais
  contournable ; retourne `Decision(allowed, needs_confirmation, reason)` ;
- `IntentExecutor` (`surface.py`) — exécute une intention **déjà autorisée**,
  refuse bruyamment si aucun exécutant n'est enregistré (`IntentNotExecutable`) ;
- `SurfaceBroadcaster.open_approval`/`close_approval` — le HITL (Human In The
  Loop) est déjà le chemin normal pour toute action à risque.

L'invariant `IA → Proposition → Policy Engine → Autorisation → Exécution` est
déjà respecté de bout en bout pour toute intention qui passe par
`_open_intent`/`_execute_intent` (`intents/executors_routing.py`).

### CIBLE V2

Rien à changer sur ce socle — V2 **s'appuie dessus**, ne le remplace pas.
Ce qui manque est en aval de l'exécution, pas en amont : voir §7 (Vérification).

### ÉCART

Aucun sur ce point précis. Le §1 du document source est déjà vrai.

---

## 2. Hermes — couche d'exécution agentique

### ÉTAT ACTUEL

Hermes n'est **pas** un second Core, et c'est déjà respecté dans le code :

- `HermesIntentDelegate.execute()` (`hermes/delegate.py`) n'appelle Hermes
  qu'avec une `Decision` déjà tranchée par la Policy — jamais avant ;
- `HermesBridge.ask()` (`hermes/bridge.py:181`) refuse l'appel si
  `not decision.allowed` — Hermes ne peut pas contourner un refus ;
- `toolsets_for(role)` (`capabilities.py:707`) est **l'unique** grille de
  filtrage : un rôle inconnu ne délègue rien.

### CIBLE V2

Identique au document source §2 — Hermes reste une couche d'exécution, jamais
l'autorité de coordination. Le Core continue de décider *quoi* faire ; Hermes
réalise *comment*, dans son périmètre autorisé.

### ÉCART

Aucun structurel. Le point de vigilance : si §5 (coordination multi-agents)
introduit d'autres agents qu'Hermes, s'assurer qu'aucun ne reçoit un chemin
d'exécution qui contourne la Policy — le piège serait de dupliquer
`HermesIntentDelegate` pour chaque nouvel agent sans dupliquer le garde-fou.

---

## 3. Skills — capacités exposées

### ÉTAT ACTUEL

Les « Skills » du document source existent aujourd'hui sous deux formes
distinctes, non unifiées :

1. **Toolsets Hermes** — `GET /v1/toolsets` (28 ensembles nommés : `web`,
   `browser`, `terminal`, `file`, `code_execution`, `homeassistant`,
   `spotify`...), consommés uniquement par `Owner.HERMES`. C'est la notion la
   plus proche de « Skill = capacité » du document, mais elle est **couplée à
   Hermes** — rien d'autre ne peut les invoquer.
2. **Skills fichier** (`deploy/hermes/skills/*/SKILL.md`) — 6 skills Hermes
   documentées (`agent-reach`, `ecosystem-hosts`, `family-enroll`, `hud-apps`,
   `jarvis-os`, `user-locale`), lues statiquement par le Dashboard
   (`HermesCore.tsx`), pas par le Core.

### CIBLE V2

Une couche **Skill** au niveau Core, agnostique de l'exécutant : une Skill
déclare une capacité (`git.status`, `docker.logs`, `network.scan`...), un
niveau de risque (`RiskLevel`), et une liste d'exécutants compatibles
(`Owner.HERMES` aujourd'hui, potentiellement d'autres agents en §5). Le Core
choisit l'exécutant au moment de l'exécution, pas au moment de la déclaration.

### ÉCART — MOYEN

- Généraliser `Capability.toolset: str | None` (aujourd'hui un nom Hermes) en
  une référence à une Skill déclarée indépendamment de l'agent.
- Découpler `toolsets_for(role)` (aujourd'hui « quels toolsets Hermes ce
  rôle peut déléguer ») de la notion de Skill générique.
- Décision à trancher avant de coder : les 6 `SKILL.md` de
  `deploy/hermes/skills/` restent-elles des skills *Hermes* (prompt-level,
  MCP), ou deviennent-elles des Skills *Core* invocables par d'autres agents ?
  Ce sont deux mécanismes différents (MCP vs table Python), pas juste un
  renommage.

Effort estimé : refactor contenu, pas une réécriture — la table existe déjà
(`capabilities.py`), il manque le découplage agent/capacité.

---

## 4. Agents — membres de l'équipe

### ÉTAT ACTUEL

**Un seul canal d'exécution agentique existe : Hermes.** Il n'y a pas
aujourd'hui d'agents distincts (« agent Claude », « agent Cursor », « agent
sécurité », « agent QA », « agent DevOps ») que le Core suit individuellement,
avec un état, une identité et un historique propres. Ce que le document source
appelle « agents » au §4 n'a pas d'équivalent dans le code — Hermes lui-même
choisit, en interne (via son propre LLM + MCP), quel outil/skill utiliser pour
une mission donnée ; le Core ne voit qu'un mission→résultat, pas les étapes.

### CIBLE V2

Un registre d'agents au niveau Core, chacun avec :

- une identité stable (`agent_id`) ;
- un type d'exécution (Hermes-délégué, appel direct API Anthropic/OpenAI,
  processus local type Cursor CLI, etc.) ;
- un périmètre de compétence déclaré (`responsible_for: ["code", "tests"]`) ;
- un état observable par le Core (`idle | working | reporting | blocked`).

### ÉCART — LARGE

C'est le changement le plus structurant du document. Ce n'est pas un ajout
au-dessus de l'existant, c'est un nouveau modèle d'exécution en parallèle du
modèle Hermes actuel (mono-canal). Points ouverts, à trancher avant tout code :

1. **Un agent externe (Cursor, Claude Code lui-même) peut-il être piloté par
   le Core ?** Aujourd'hui l'exécution se fait *depuis* Cursor/Claude Code, qui
   *contient* la session — pas l'inverse. Inverser ce sens de contrôle (le
   Core démarre/supervise une session Cursor) est un problème d'intégration
   à part entière (API/CLI de contrôle, pas juste un appel HTTP).
2. **Où vit l'état d'un agent entre deux missions ?** Nouvelle table
   (Alembic), pas une extension de `CAPABILITIES`.
3. Ne pas dupliquer le contournement de Policy évoqué en §2 — chaque nouvel
   agent doit passer par le même invariant `Proposition → Policy → Exécution`.

Recommandation : ne pas construire §4-5 avant §7 (Vérification) — assigner du
travail à une équipe d'agents dont on ne vérifie pas le résultat aggrave
exactement le problème que le document source identifie en introduction
(« RAPPORT DE L'AGENT ≠ PREUVE »).

---

## 5. Coordination multi-agents

### ÉTAT ACTUEL

Aucune. Pas de graphe de dépendances entre étapes, pas de notion
d'« équipe temporaire » assemblée pour une mission.

### CIBLE V2

Reprend le document source tel quel : le Core assemble une équipe (ex. Claude
analyse → Cursor implémente → Security audite → QA teste → DevOps déploie),
gère les dépendances entre étapes, et **valide chaque transition** plutôt que
de laisser un agent supposer qu'une étape précédente est correcte parce qu'un
autre agent l'a déclarée.

### ÉCART — LARGE, dépend entièrement de §4 et §7

Ne peut pas être conçu avant que §4 (registre d'agents) et §7 (vérification)
existent — une coordination entre entités qui n'existent pas encore et dont on
ne vérifie pas le travail n'est pas un chantier, c'est une façade.

---

## 6. Voicebox — couche vocale

### ÉTAT ACTUEL

Déjà conforme au document source, et **renforcé le 2026-08-10** :

- `sequences.py` — narration pilotée par événements réels, jamais par
  minuterie (`ON AVANCE SUR ÉVÉNEMENT RÉEL, PAS SUR MINUTERIE`, doc du
  fichier) ;
- Le Core contrôle strictement quand la voix parle : la phrase d'accès vocale
  ne se déclenche plus qu'**après** un facteur visage validé, jamais en
  parallèle (`AuthScene.tsx`, corrigé ce soir — c'était exactement le défaut
  « facteur décoratif, jamais attendu » que ce document veut éviter en
  général) ;
- `auth_sequence_result` (`ws/handlers/auth.py`) — un appelant peut désormais
  attendre une vraie confirmation de fin de séquence, pas un fire-and-forget.

### CIBLE V2

Identique au document source §6. Un point ouvert : identités vocales
multiples par agent (« JARVIS » vs « CURSOR » vs « SECURITY ») vs une seule
voix JARVIS + identification visuelle HUD. Le document source le laisse
configurable — **à trancher seulement après §4**, puisqu'il n'y a pas encore
d'agents distincts à faire parler.

### ÉCART

Aucun sur le socle. Le multi-voix par agent dépend de §4.

---

## 7. Vérification — RAPPORT DE L'AGENT ≠ PREUVE

> Priorité retenue avec Samir le 2026-08-10 : **premier chantier de V2**,
> avant §4/§5, parce qu'il s'accroche sur l'existant sans réécriture du modèle
> d'exécution, et parce que construire une coordination multi-agents avant
> d'avoir la vérification revient à construire une équipe dont personne ne
> contrôle le travail.

### ÉTAT ACTUEL

`_execute_intent` (`intents/executors_routing.py`) traite le résultat renvoyé
par un exécutant (Hermes ou Core) comme un fait acquis. Il n'existe aucune
étape qui recroise ce résultat avec un état réel observable (git, tests,
build, logs, service). Le tracé actuel (`tool_events`, `ToolEvent`) enregistre
*qu'un appel a eu lieu et ce qu'il a répondu* — jamais si la réponse était
vraie.

### CIBLE V2

Introduire une distinction explicite à cinq états, portée par le type
`ToolEvent` (ou un nouveau type dédié) :

```
PROPOSITION → ACTION DEMANDÉE → ACTION EXÉCUTÉE
            → RÉSULTAT OBSERVÉ → RÉSULTAT VALIDÉ
```

Aujourd'hui le pipeline s'arrête à « ACTION EXÉCUTÉE ». V2 ajoute deux étapes :

1. **RÉSULTAT OBSERVÉ** — après exécution, le Core interroge une source
   indépendante de l'agent : `git status`/`git diff`, sortie de la suite de
   tests, statut du build, `systemctl is-active`, contenu réel d'un fichier.
   Pour les intentions qui le permettent, il existe déjà une brique
   directement réutilisable : `remote_exec.py` (construit ce soir pour le
   Terminal admin) sait déjà exécuter une commande de diagnostic sur NUC/VPS/Pi
   sous Policy — c'est le mécanisme de vérification, pas un nouveau à inventer.
2. **RÉSULTAT VALIDÉ** — comparaison entre ce que l'agent a *déclaré* avoir
   fait et ce que l'observation *montre*. Concordance → validé. Divergence →
   nouvel état `DISPUTED`, le Core reformule vers l'agent (« ton implémentation
   dépasse le périmètre défini, explique la modification » — exemple du
   document source §5) plutôt que d'accepter le rapport tel quel.

### Conception proposée (à valider avant code)

- Nouveau module `core/jarvis_core/verification.py` : une fonction
  `verify(intent, claimed_result, context) -> VerificationOutcome` par famille
  d'intention (code = git/tests, infra = statut service, fichier = lecture
  réelle). Pas une IA qui « juge » — des vérifications déterministes, dans
  l'esprit du reste du Core (`homeassistant.py`, `plex.py` : déterministe,
  sans LLM, JARVIS BASE survit).
- Le résultat de `verify()` est journalisé dans `tool_events` (`stage:
  "verified"` ou `"disputed"`), visible dans `ToolsPage.tsx` (Dashboard) sans
  changement de schéma majeur — la colonne `stage` existe déjà.
- Ne s'applique qu'aux intentions où une vérification indépendante a un sens
  (code, fichiers, services, infra). Pour une intention purement
  conversationnelle (`web.search`), il n'y a rien à vérifier — ne pas forcer
  le mécanisme partout.

### ÉCART — MOYEN

Le plus petit des quatre gros chantiers (§4/§5/§7/§9-mémoire) : pas de
nouveau modèle d'exécution, une extension du pipeline existant. Effort
principal : écrire les vérificateurs déterministes par famille d'intention, un
par un, pas un mécanisme générique magique.

---

## 8. Agentic UI / JARVIS Surface — Extension V2

> Audit mené le 2026-08-10 sur `hud/src` réel (lecture directe + deux
> sous-agents dédiés à NeuralMap/Graphify et à terminal/logs/mission/agents).
> Rien ci-dessous n'est supposé depuis la vision V2 — chaque ligne cite un
> fichier. Le HUD n'est **pas** un chantier vide : le protocole existe, le
> registre existe, la surface plein écran existe et parle déjà au Core. Ce qui
> manque est plus étroit que « tout construire » — voir le tableau.

### 8.1 Protocole Core ↔ HUD — EXISTANT, complet

`hud/src/agentic/protocol/surface.ts` — `SurfaceDocument` (`surfaces`, `data`,
`pending.approvals`), enveloppe `SURFACE_SNAPSHOT`/`SURFACE_DELTA`
(`ServerEventType`), JSON Patch RFC 6902 restreint (`PatchOp`), garde de trou
de séquence (`hasGap`, ligne 138 — un trou jette l'état local et redemande un
snapshot plutôt que d'afficher un état faux). Rien à construire ici : c'est le
socle le plus solide de tout l'audit.

### 8.2 Composeur / placement — EXISTANT

`hud/src/agentic/composer.ts::place()` — traduit région (`top|left|center|
right|bottom|overlay|backdrop`) et taille (`compact|normal|wide|fill`) en
style CSS réel ; tri stable à priorité égale. L'agent exprime une intention de
placement, jamais un pixel — le HUD reste seul juge (`§P3` du contrat cité en
tête de fichier).

### 8.3 `AgentSurface` — EXISTANT, et déjà en plein écran (pas seulement en fenêtre)

`hud/src/agentic/AgentSurface.tsx` reçoit réellement `SURFACE_SNAPSHOT`/
`SURFACE_DELTA` (ligne 244-322), applique les patches (`applyPatch`), gère le
resync sur trou de séquence, et le canal `approval.grant`/`approval.deny`
(ligne 154-160) qui contourne délibérément la Policy générique — répondre à
une demande d'autorisation n'a pas à être elle-même autorisée.

Point vérifié précisément parce que le doc source pouvait laisser croire le
contraire : l'en-tête du fichier dit *« ne se superpose jamais au HUD, vit
dans une `AppWindow` »* — c'est l'ancien modèle. **Depuis G1 (session du
2026-08-09), ce n'est plus vrai en pratique** : `App.tsx:238-253` a un mode
`hudMode === 'surface'` qui monte `MockAppContent` en plein écran
(`position: absolute inset-0`), et `MockAppContent` (`AppStage.tsx:174-180`,
renommé mais jamais réécrit — le nom trompe) résout, pour toute app sans
rendu natif dédié, un vrai `<AgentSurface surfaceId={app.id}
composeQuestion=... />`. Le plein écran parle donc au **même** protocole que
les fenêtres, pas à une maquette. Le commentaire en tête du fichier est
désormais faux et doit être corrigé (dette documentaire, pas dette de code).

### 8.4 Registre de composants — EXISTANT, 23 entrées, **aucune** pour outils/agents/mission

`hud/src/agentic/registry/definitions.ts` — 23 composants déclarés :
`SystemMonitor, MemoryPanel, CommandConsole, CameraPreview, GesturePanel,
VoiceBar, ScanningPanel, SettingsPanel, ActionRequest, ApprovalCard,
ResultPanel, SectionHeader, StatCard, InfoCard, StatusBadge, AvatarChip,
LinkList, KeyValueList, DataTable, MetricChart, DialogCard, ToastStack,
ServiceHub`. Chacun porte un schéma Zod, des permissions, un contexte requis,
des actions à gravité déclarée — le registre lui-même est un mécanisme mûr,
pas un embryon.

**Mais aucune entrée ne représente une mission, un agent ou un événement
d'outil.** `ApprovalCard`/`ResultPanel` existent et sont directement
réutilisables pour §7 (HITL, affichage de résultat), mais il n'y a pas de
`ToolCall`, `AgentStatus`, `MissionTimeline` ou `VerificationCard` dans ce
registre. C'est le premier écart concret de la cible V2 — pas un chantier de
protocole, un chantier de **nouvelles entrées** dans un mécanisme qui sait
déjà les accueillir.

### 8.5 Terminal / logs — PARTIEL, aucune vraie sortie shell

`CommandConsole.tsx` — un **chat texte** (bulles user/ai, effet machine à
écrire), pas une console shell : aucun stdout/stderr/exit code, envoie du
texte à `sendChatToCore` ou à un pipeline d'interprétation local.
`MissionDevLiveFeed.tsx` — le plus proche d'un flux terminal : lignes
monospace colorées par ton (`live|ok|sys|dim`), paginées, curseur clignotant
— mais scopé au log de mission dev, pas une primitive générique réutilisable
pour n'importe quel outil.
`ui/command.tsx` — composant shadcn "cmdk" (palette de commandes UI, type
Spotlight), sans rapport avec l'exécution de commandes.

**Aucune brique HUD n'affiche une sortie de commande réelle avec stdout
distinct, exit code, host cible.** Le Dashboard, lui, a `TerminalPage.tsx`
(construit cette nuit) — c'est le composant à porter/adapter, pas à
réinventer.

### 8.6 `tool_events` — ABSENT côté HUD

Zéro occurrence de `tool_event`/`ToolEvent`/`tool_timeline` dans `hud/src`.
Le seul indice est un état d'orbe `'tool_call'` déclaré dans
`hudContracts.ts` — fichier explicitement documenté comme *« préparation
branchement, pas encore câblé »*. Le Dashboard a `ToolsPage.tsx` branché sur
la vraie table `tool_events` ; rien d'équivalent n'existe côté HUD.

### 8.7 Mission — EXISTANT et réel, mais pas un DAG multi-agents

`MissionControlDev.tsx` + `useMissionDevRuntime.ts` — **branché en direct**,
confirmé explicitement dans le code : *« runtime piloté par le Core (WS
mission_dev_*). Plus de simulation timer »*, abonné à
`onMissionDevStarted/Progress/Finished/Error`, dégrade proprement si
`!client.connected` (jamais de fausse progression). C'est une **liste
séquentielle de jalons** (`StepRow` : point coloré + label + statut
attente/en cours/terminé/erreur) plus un flux de logs — pas un graphe de
dépendances, pas une vue multi-agents. Corrige une inexactitude du §9
original de ce document (« kanban Hermes ») : ce n'est pas un kanban.

### 8.8 État d'agent(s) — PARTIEL, un seul agent à la fois

Pas de matrice « Hermes: working · QA: waiting · Security: blocked ». Ce qui
existe : un unique `liveLabel` global (`useMissionDevRuntime.ts`) qui reflète
UN SEUL flux d'exécution à la fois (Core/Hermes), et `hermesNodes.ts` (§8.9)
qui porte des champs `status`/`consumption`/`progression` mais **codés en
dur**, pas alimentés par un état d'exécution réel. Tant que §4 (registre
d'agents Core) n'existe pas, il n'y a rien de réel à afficher ici — c'est un
écart dérivé, pas un écart HUD indépendant.

### 8.9 `NeuralMap` / `hermesNodes.ts` — Graphify, embryon réel mais étroit

Aucun fichier « Graphify » n'existe. `NeuralMap.tsx` + `NodeDetailPanel.tsx` +
`hermesNodes.ts` (209+121+107 lignes) sont **montés réellement** (pas du code
mort — `AppStage.tsx` les ouvre pour l'app "Noyau" et pour chaque satellite
Hermes) et interactifs (sélection de nœud, tiroir de détail, dimming des
nœuds non connectés) — mais :

- **statique** : `HERMES_NODES` est un objet codé en dur (11 nœuds fixes),
  aucun `fetch`/WS dans les 3 fichiers — zéro donnée temps réel du Core ;
- **rendu SVG plat** (`viewBox` fixe, positions polaires), pas de zoom/pan ;
- **non générique** : `NeuralMap()` ne prend aucune prop, importe
  `HERMES_NODES` en dur ; `NodeId` est un union type fermé à 11 valeurs
  littérales — impossible d'y représenter un graphe de mission (§5) sans
  réécrire le typage et casser l'import direct.

C'est un point de départ visuel honnête (SVG + Framer Motion + tiroir de
détail — le langage visuel est réutilisable), pas un moteur de graphe
généralisable en l'état.

### 8.10 Orbe — EXISTANT, docking déjà construit, mais aucun vocabulaire de mission

`useOrbHud.ts::OrbState` = 4 valeurs seulement : `idle|listening|thinking|
speaking` — un état d'attention vocale, aucune notion de « travaille sur une
mission », « vérifie », « en dispute ». `MiniOrb.tsx` a déjà un système de
positionnement générique (`position: 'left'|'right'|'bottom-center'`),
réutilisé par G1b pour le docking en plein écran (`App.tsx:439-441`) — le
mécanisme de réduction/repositionnement que la cible V2 décrit **existe
déjà et fonctionne**, jamais de remount de `JarvisOrb`/`OrbLite` (P6
respecté). Le seul écart réel : pas d'état visuel dédié à l'activité
mission/vérification — extension de `OrbState`, pas un nouveau mécanisme.

### 8.11 Rendu Glass/spatial — DEUX systèmes parallèles, non unifiés

Trouvaille non anticipée par la vision V2 : il existe **deux** bibliothèques
Glass distinctes et actives dans `hud/src`, pas une seule :

1. `hud/src/components/glass/` (`GlassPanel`, `GlassCard`, `GlassButton`,
   `GlassPill`, `GlassDock`, `GlassModal`) — construite pendant le chantier
   Glass HUD, utilisée par les écrans d'auth (`HudAuthGate`, `LockScene`,
   `AuthScene`...).
2. `hud/src/spatial/` (`GlassButton`, `GlassCard`, `GlassPanel`,
   `GlassSurface`, `SpatialWindow`, `VisionOSMaterialLab`) — système de thème
   spatial séparé (`HudSpatialRoot` enveloppe TOUTE l'app depuis `main.tsx`,
   mode `light|night` persisté), avec son propre calcul de matériaux
   (`spatial/materials/compute.ts`). **Ce système est bien vivant** :
   `agentic/library/vision.tsx::VisionPane` (qui l'utilise) est importé par
   `ApprovalCard.tsx`, `ActionRequest.tsx`, `Primitives.tsx`, `ResultPanel.tsx`
   — c'est-à-dire une partie des renderers du registre agentique tournent
   déjà sur CE système, pas sur `components/glass/`.

Aucune unification n'existe entre les deux. Avant toute extension visuelle
V2, trancher lequel des deux est la référence — sinon chaque nouvelle surface
(§8.4) choisira arbitrairement l'un ou l'autre et la divergence s'aggravera.

### 8.12 Focus / responsive — PARTIEL

Pas de gestionnaire de focus dédié (pas de `FocusContext`/`useFocusManager`) :
le focus suit l'empilement React/DOM classique, plus `focusApp`/
`activeAppId` dans `AppContext` pour l'ordre de profondeur des fenêtres
`AppStage` (`z-index` + `filter: blur()` décroissant sur les fenêtres
arrière, `AppStage.tsx:220-231`). Responsive : classes Tailwind éparses
(`sm:`/`md:`/`lg:`/`xl:`/`min-[700px]:`) dans ~29 fichiers, pas de stratégie
centralisée mobile/tablette/desktop — fonctionne par ajustements ponctuels,
pas par design responsive systématique.

### 8.13 Tableau comparatif

| Capacité | Actuel | Cible V2 | Écart | Fichiers | Dépendances |
|---|---|---|---|---|---|
| Protocole Core↔HUD | EXISTANT, complet | Inchangé | Aucun | `protocol/surface.ts` | — |
| Composeur/placement | EXISTANT | Inchangé | Aucun | `composer.ts` | — |
| Surface plein écran | EXISTANT (réel, pas mock) | Inchangé | Doc à corriger (en-tête `AgentSurface.tsx` obsolète) | `App.tsx:238-253`, `AppStage.tsx:174-180` | — |
| Registre de composants | EXISTANT (23 entrées) | +4 entrées (`ToolCall`, `AgentStatus`, `MissionTimeline`, `VerificationCard`) | **PETIT** — le mécanisme existe, il manque des entrées | `registry/definitions.ts` | §7 pour `VerificationCard` |
| Terminal/sortie shell | PARTIEL (chat, pas shell) | Vraie sortie stdout/exit code | **MOYEN** — porter `dashboard/TerminalPage.tsx`, pas réinventer | `CommandConsole.tsx`, `MissionDevLiveFeed.tsx` | Core `terminal.py` (existe déjà) |
| `tool_events` HUD | ABSENT | Flux live des appels d'outils | **MOYEN** — nouvelle surface + abonnement WS | — | §7 (stage verified/disputed) |
| Mission UI | EXISTANT (réel, séquentiel) | DAG multi-étapes/agents | **LARGE** — pas une extension, un nouveau modèle de rendu | `MissionControlDev.tsx` | §5 (dépendances de mission) |
| État d'agent(s) | PARTIEL (1 flux global) | Matrice multi-agents | **LARGE**, dérivé de §4 | `hermesNodes.ts` (statique) | §4 (registre d'agents) |
| Graphify | EMBRYON (Hermes only, statique, non générique) | Graphe mission/infra/sécurité généralisé | **MOYEN-LARGE** — généraliser `NeuralMap`, pas repartir de zéro | `NeuralMap.tsx`, `hermesNodes.ts` | §5, §10 (bas de priorité tant que rien à représenter) |
| Orbe — docking | EXISTANT, fonctionne | Inchangé | Aucun | `MiniOrb.tsx`, `App.tsx:439-441` | — |
| Orbe — vocabulaire mission | ABSENT (4 états voix seulement) | États `working`/`verifying`/`disputed` | **PETIT** — extension d'enum + mapping couleur | `useOrbHud.ts::OrbState` | §7 pour le sens des états |
| Glass/spatial rendering | DEUX systèmes parallèles non unifiés | Un seul système de référence | **DÉCISION avant tout code**, pas un effort de dev en soi | `components/glass/` vs `spatial/` | Bloque §8.4 proprement fait |
| Focus | PARTIEL (ordre de fenêtres seulement) | Focus spatial explicite | **PETIT**, pas urgent | `AppContext` (`focusApp`) | — |
| Responsive | PARTIEL (classes éparses) | Stratégie cohérente | **PETIT-MOYEN**, pas urgent | 29 fichiers, ponctuel | — |

**Un écart non chiffré n'est pas un écart** : sur les 14 lignes, 4 n'ont
aucun travail réel à faire (le socle protocole/composeur/plein-écran/docking
est déjà solide), 1 est une décision préalable non technique (§8.11), et les
écarts LARGE (mission DAG, état d'agents) sont tous deux **dérivés de §4/§5**
— aucun ne peut être construit avant eux sans produire une façade vide.

### 8.14 Contrainte architecturale — inchangée

Le flux reste `USER → CORE → ORCHESTRATION → AGENT/SKILL/TOOL → EXECUTION →
OBSERVATION → VERIFICATION → SURFACE STATE → HUD`. Le HUD représente l'état,
il ne devient jamais le Core — invariant déjà respecté par construction :
`AgentSurface` n'exécute rien, elle envoie une intention (`emit`) et attend
que le Core tranche (§8.3).

### 8.15 Ordre de travail recommandé pour ce chantier

1. Trancher §8.11 (quel système Glass est la référence) — bloquant, pas cher.
2. Corriger le commentaire obsolète en tête d'`AgentSurface.tsx` (dette doc).
3. Ajouter `ToolCall`/`VerificationCard` au registre (§8.4) — s'accroche
   directement sur §7 une fois ce chantier commencé, aucune dépendance
   nouvelle.
4. Porter le Terminal du Dashboard vers une surface HUD (§8.5) — le Core
   (`terminal.py`) existe déjà, c'est un travail de rendu, pas de protocole.
5. Ne pas toucher à Mission UI multi-agents (§8.7/§8.8) ni généraliser
   Graphify (§8.9) avant que §4/§5 existent — même raisonnement que le reste
   du document : construire la représentation avant l'état réel à
   représenter produit une démo vide, pas un chantier.

### 8.16 Écran d'authentification — indicateur vocal dédié

> Audité le 2026-08-10 suite à une nouvelle demande précise : l'orbe ne doit
> plus représenter l'écoute pendant l'auth, un petit composant glass dédié
> doit prendre ce rôle sous la caméra, réagissant au vrai niveau micro.

**Confirmation exacte du problème décrit.** `AuthScene.tsx::OrbSpatial`
(`hud/src/app/components/auth/OrbSpatial.tsx`) est un wrapper P6-conforme
autour du vrai `Orb` (aucune réimplémentation), MAIS son hook
`useOrbVeilleReactive` (même fichier, ligne 10-41) fait explicitement
passer l'orbe en état `listening` et pulser son `volume` en fonction du
niveau micro réel dès que `veille={true}` — commentaire du fichier :
*« Mode veille : réagit au micro puis retombe en idle »*. C'est très
précisément ce que la demande veut arrêter : l'orbe = JARVIS lui-même,
jamais un indicateur d'écoute générique.

**« Coussin orange »** — le candidat le plus probable est `AuthVoiceWave.tsx` :
ce n'est pas une capsule/pastille, c'est une **barre égaliseur de 28 barres,
jusqu'à 320px de large, 36px de haut** (`AuthVoiceWave.tsx:7,84-92`), couleur
orange (`#FF9F1C`) spécifiquement en mode `processing`. Quelle que soit la
pièce visuelle exacte visée par « coussin orange », le composant actuel ne
correspond de toute façon pas à la cible (icône micro compact, pas une large
barre de fréquences) — écart confirmé indépendamment du nom.

**Ce qui existe déjà et n'a PAS besoin d'être reconstruit** — c'est le point
le plus important de cet audit : **toute l'infrastructure technique demandée
existe déjà et fonctionne** :

- **Niveau micro réel** — `useMicOrbAnalyser.ts` : vrai `AnalyserNode` Web
  Audio (`ctx.createAnalyser()`, `getByteFrequencyData`), pas une simulation.
  Déjà utilisé par `AuthVoiceWave` ET `OrbSpatial`. Le futur petit composant
  n'a qu'à consommer `micLevel` — zéro nouveau pipeline audio à construire.
- **Détection du wake word** — `audioBus.ts::subscribeWakeWord` existe déjà
  comme signal séparé. La « petite réaction spécifique » demandée à la
  reconnaissance du wake word est un nouvel abonnement à un événement
  existant, pas un nouveau détecteur.
- **État du pipeline d'auth** — `orchState.orbState`/`faceHologram.phase`
  existent déjà dans `AuthScene.tsx` et encodent précisément les étapes
  (`camera_on → obstruction → reconstruction → success/denied`).

**Écart réel — PETIT** : un unique nouveau composant (`AuthMicIndicator.tsx`
ou équivalent), glass, compact (icône micro + halo/anneau minimal, pas une
barre de 320px), qui consomme `micLevel` (déjà réel) + `subscribeWakeWord`
(déjà réel) + l'état de pipeline existant. Le remplacement dans
`AuthScene.tsx`/`FirstSetupScene.tsx` : retirer `OrbSpatial` du rôle
« écoute » (le garder uniquement pour représenter JARVIS s'il reste affiché),
retirer/remplacer `AuthVoiceWave`. C'est un chantier de rendu UI ciblé, pas
un chantier de plomberie audio — la plomberie est déjà là.

### 8.17 Sondes vs Agents — état réel du découplage

> Rattaché à §7 (Vérification) : le principe « sonde observe en continu, agent
> raisonne et agit, Core orchestre » est cohérent avec l'architecture déjà en
> place, mais la largeur de couverture des sondes est très inférieure à
> l'exemple donné (CPU/RAM/GPU/disque/réseau/processus/services/température/
> caméra/micro/HA).

**Ce qui existe déjà comme sonde poussée en continu, sans LLM :**
`core/jarvis_core/metrics.py::MetricsSampler` — échantillonne et pousse en
push (`SYSTEM_METRICS`, déjà consommé en direct par le HUD via
`systemMetrics.ts`/`useSystemMetrics()`), sans jamais consulter un LLM. C'est
exactement le mécanisme « sonde → Core → événement → HUD, sans agent » que la
vision décrit — mais son contenu est étroit : **`sample()` (`metrics.py:134`)
ne calcule que `cpu`, `ram`, `disk`, et un `threat_level` dérivé des trois.
Aucun GPU, aucune température, aucun réseau, aucune caméra/micro-présence,
aucun Home Assistant dans cette sonde.**

**Ce qui existe ailleurs, mais pas encore comme « sonde » au sens de ce
document** : `Supervisor.status()` (tri-état par composant, y compris
`hermes`), `homeassistant.py` (adaptateur direct, déterministe, sans LLM —
déjà conforme au principe « sonde », mais jamais poussé en `SYSTEM_METRICS`
ou équivalent, seulement interrogé à la demande), présence caméra/micro
(`_camera_ok`, `_peripherals` dans l'orchestrateur — suivie, mais pas
formalisée comme sonde avec seuils/événements).

**Écart — MOYEN** : pas un nouveau mécanisme (le pattern push
`MetricsSampler`→`SYSTEM_METRICS` est le bon modèle à répliquer), mais
plusieurs nouvelles sondes à écrire une par une (GPU, température, réseau,
présence caméra/micro comme sonde formelle, HA en mode push plutôt que pull) —
et un mécanisme de seuil générique (« RAM > 91 % → événement ») qui n'existe
pas encore : `threat_score()` (`metrics.py:69-92`) calcule un niveau de
menace agrégé, mais rien n'émet d'événement HUD distinct quand UN seuil
précis est franchi sur UNE métrique précise.

### 8.18 Philosophie événementielle — déjà le principe, pas une nouveauté

Point de validation plutôt qu'écart : « les composants apparaissent parce
qu'un événement réel les justifie » **est déjà l'invariant du protocole
existant** (§8.1) — un `SurfaceDocument` vide ne montre rien, une surface
n'existe que si le Core l'a composée en réponse à un fait réel, et
`SURFACE_DELTA` permet déjà à un panneau d'apparaître, évoluer, puis
disparaître sans reconstruire l'écran. La demande ne change donc pas le
protocole — elle demande d'étendre le **répertoire d'événements qui
déclenchent une surface** (sondes élargies, §8.17) et le **répertoire de
surfaces qu'un événement peut déclencher** (registre élargi, §8.4), pas
d'inventer un nouveau mécanisme de réactivité.

### 8.19 HUD V2 — finition visuelle et langage spatial (visionOS) — VALIDÉ

> Validé Samir 2026-08-10. Cible de finition du HUD produit. **Ne pas ajouter
> davantage d'effets** — améliorer la qualité physique perçue des effets
> existants. Le HUD doit lire comme des **objets légers dans l'espace**, pas
> des rectangles HTML décorés. Identité JARVIS (orbe holographique) conservée ;
> surfaces / icônes / panneaux / transitions → finition spatiale premium.

**Règle d'or :** ❌ « j'ai mis du blur / glow / ombre » → ✅ « cette surface
flotte / cette info est devant / la lumière appartient au matériau / l'objet
réagit au monde ».

| # | Principe | Application HUD |
|---|----------|-----------------|
| 1 | Matériau Glass | Transparence + blur + luminosité + saturation + gradient matière + bordure subtile + reflet discret ; contenu frontal plus net que le fond. Pas de plaques opaques massives. |
| 2 | Hiérarchie matériaux | Thin (contrôles) · Regular (panneaux) · Thick (lisibilité forte) — pas un seul niveau partout. |
| 3 | Profondeur / plans | BACKGROUND → atmosphère → Glass secondaire → ORBE → Glass principal → info active. Via Z, blur, luminosité, ombres, parallaxe légère, échelle. |
| 4 | Ombres | Douces, grande diffusion, faible opacité, léger décalage — séparation de plans, pas décor gaming. |
| 5 | Edge highlight | Bordures quasi invisibles ; highlight ponctuel (haut/gauche), pas cadre lumineux continu. |
| 6 | Coating | 4 couches conceptuelles : BACKPLATE → UI duplicate (profondeur) → UI nette → COATING (reflet). |
| 7 | Vibrancy | Texte/icônes : primaire nette · secondaire · tertiaire · actifs vibrants · inactifs atténués — pas blanc opaque plat. |
| 8 | Lumière sémantique | Base neutre ; IDLE / LISTENING / WAKE / PROCESSING / SUCCESS / ERROR modifient la lumière ponctuellement. |
| 9 | Micro-animations | Apparition = déplacement + blur→net + luminosité (pas opacity 0→1 seul). Disparition inverse. Courtes, discrètes. |
| 10 | Réactivité événementielle | Rendu lié aux événements réels (sondes → Core → SURFACE_*) — jamais animer un état inventé. |
| 11 | Icônes profondeur | Couches parcimonieuses (fond + icône + ombre + highlight) — pas tout en 3D. |
| 12 | Composition | ORBE = centre d'attention ; secondaires perdent luminosité/netteté/contraste au repos ; éviter le cockpit saturé. |
| 13 | Auth micro | Caméra → hologramme → **AuthMicIndicator** (compact, sous caméra) → wake → pipeline. Orbe = présence JARVIS seule (P6, pas indicateur micro). |
| 14 | Performance | Pas de backdrop-filter partout ; pas de Glass empilés inutiles ; mesurer avant généraliser. |
| 15 | Cible | Interface spatiale crédible, pas une copie visionOS. |

**Invariants inchangés :** P6 orbe · protocole Core↔HUD · HUD ne décide pas · zéro donnée inventée.

**Correction (chantier Agentic Component Library + Glass System) :** `components/glass/`
n'est plus la référence pour le neuf. Exploration du code réel : `components/glass/`
était déjà qualifié de « legacy — à migrer » par le lab de comparaison
(`spatial/VisionOSMaterialLab.tsx`), tandis que `spatial/GlassSurface` (plus complet —
elevation 5 niveaux, intensity, dynamicLight, focused, glow) était déjà le socle
effectivement utilisé par `SectionFrame`/`MetricTile`/`agentic/library/vision.tsx`.
Décision : `spatial/GlassSurface` devient `hud/src/visual/glass/` (5 surfaces
publiques : `GlassSurface`, `GlassPanel`, `GlassCard`, `GlassOverlay`, `GlassHeader`,
+ `GlassButton`), référence pour tout le neuf agentic. `components/glass/` reste en
place uniquement pour ses ~15 consommateurs chrome applicatifs existants
(`App.tsx`, `AppStage.tsx`, `AuthScene.tsx`, etc.) — migration de ce chrome vers
`visual/glass/` restant une dette de suivi séparée, non traitée dans ce chantier.

Ordre chantier : fondation Glass/composition (§8.19) en parallèle du brief agentic
(`docs/BRIEF_CURSOR_HUD_V2_AGENTIC.md` étapes 0→4) — pas des pastilles UI isolées
sans le système matériau.

---

## 9. Mission Control

### ÉTAT ACTUEL

`core.mission_dev` existe (Mission Control DEV) et — précision après audit
détaillé en §8.7 — n'est **pas un kanban** : c'est une liste séquentielle de
jalons (`MissionControlDev.tsx::StepRow`) + un flux de logs
(`MissionDevLiveFeed.tsx`), réellement piloté par le Core en WS
(`useMissionDevRuntime.ts` — plus de simulation timer, confirmé dans le code
lui-même). C'est un suivi de *tâches de développement séquentielles*, pas un
suivi de *missions multi-agents* avec dépendances et traçabilité par agent au
sens du document source.

### CIBLE V2

Devient la surface de traçabilité de §5 : une mission = un graphe d'étapes,
chacune assignée à un agent, avec son état (`PROPOSITION`→`RÉSULTAT VALIDÉ`,
cf. §7) visible en direct.

### ÉCART

Dépend de §4/§5/§7. Pas un chantier indépendant.

---

## 10. Graphify

### ÉTAT ACTUEL

Embryon existant, audité en détail en §8.9 : `NeuralMap.tsx` + `hermesNodes.ts`
sont montés réellement (pas du code mort) et interactifs, mais statiques
(`HERMES_NODES` codé en dur, zéro donnée temps réel), rendus en SVG plat sans
zoom/pan, et non génériques (`NodeId` est un union type fermé à 11 valeurs,
`NeuralMap()` ne prend aucune prop).

### CIBLE V2

Généraliser ce mécanisme (le langage visuel — SVG + Framer Motion + tiroir de
détail — est réutilisable) à d'autres types de nœuds : dépendances de
mission (§5), topologie infra (déjà partiellement couvert par
`devices.topology`/`DeviceRegistry`, à relier plutôt qu'à dupliquer), surface
de sécurité.

### ÉCART — MOYEN, mais bas de priorité

Utile pour *visualiser* §4/§5 une fois qu'ils existent — construire Graphify
avant d'avoir des agents/missions à représenter produirait un graphe vide.

---

## 11. Mémoire

### ÉTAT ACTUEL

Deux mécanismes existants, ni l'un ni l'autre ne couvre « décisions et
pourquoi » :

- `memory.py` — préférences utilisateur (nom, ton, langue), lu/écrit par
  `MemoryPanel`. C'est de la mémoire de *personne*, pas de *projet*.
- `tool_events`/`ToolEvent` — log brut d'exécution (quoi, quand, par qui),
  pas de synthèse de *pourquoi* une décision a été prise.

Une phase M0 (persistance conversation + extraction de préférences) avait déjà
été identifiée dans un chantier précédent (redesign HUD/Dashboard) et **jamais
faite** — elle recoupe partiellement ce besoin sans le couvrir entièrement
(conversation ≠ décision de mission).

### CIBLE V2

Mémoire opérationnelle de projet : pourquoi une mission a été lancée, quelles
décisions ont été prises en cours de route (notamment les résolutions de
`DISPUTED`, §7), quel agent a fait quoi et avec quel résultat validé.

### ÉCART — LARGE

Nouveau modèle de données (Alembic), distinct des préférences utilisateur
existantes. Dépend de §4/§5/§7 pour avoir quelque chose à mémoriser — sans
agents ni vérification, une « mémoire de décisions » n'a rien à enregistrer.

---

## 12. Sécurité — invariants non négociables (V1, inchangés)

Rappel explicite : rien dans V2 ne doit affaiblir ces règles déjà actées.

- L'IA ne reçoit **jamais** les droits root/admin directement — Proposition →
  Policy Engine → Autorisation → Exécution, y compris pour tout nouvel agent
  introduit par §4.
- Secrets jamais en dur, jamais commités.
- Actions graduées (`RiskLevel.INFO < MEDIA < HOME < ADMIN < VPS`).
- Discovery ≠ droits (appairage explicite).
- JARVIS BASE doit survivre à la perte de n'importe quel module — y compris
  Hermes, y compris un futur agent externe.

Point de vigilance particulier pour §4 : un agent capable de « piloter Cursor »
ou d'écrire du code manipule potentiellement des fichiers/commandes — il doit
traverser la **même** Policy que Hermes aujourd'hui, jamais un chemin parallèle
plus permissif.

---

## 13. Feuille de route proposée

Ordre de dépendances réelles, pas d'ordre arbitraire :

```
Phase 1 — §7 Vérification            (s'accroche sur l'existant, pas de refonte)
            ↓
Phase 2 — §3 Skills découplées       (généralise CAPABILITIES, prépare §4)
            ↓
Phase 3 — §4 Registre d'agents       (le plus gros morceau — nouveau modèle)
            ↓
Phase 4 — §5 Coordination multi-agents + §9 Mission Control mission-aware
            ↓
Phase 5 — §11 Mémoire décisionnelle  (a enfin quelque chose à mémoriser)
            ↓
Phase 6 — §10 Graphify généralisé + §6 multi-voix par agent (finition visuelle/vocale)
```

Chaque phase doit se terminer par quelque chose de testable, dans la
convention déjà en usage dans ce dépôt (`_smoke_*.py` offline, comme
`_smoke_remote_exec.py`/`_smoke_capabilities.py` cette nuit) — pas de phase
« terminée » sans preuve d'exécution, exactement le principe que ce document
défend en §1/§7.

## 14. Non-décisions — à trancher avec Samir avant d'écrire du code

1. §4 : un agent externe (Cursor) est-il piloté *par* le Core, ou reste-t-il
   l'inverse (Cursor contient la session, JARVIS est un outil parmi
   d'autres) ? Ces deux mondes ont des implications d'architecture opposées.
2. §3 : les Skills Hermes (`SKILL.md`, MCP) restent-elles propres à Hermes, ou
   V2 introduit-il un second mécanisme Core-natif ?
3. §6 : une voix par agent, ou une seule voix JARVIS + identification HUD ?
4. §7 : jusqu'où va la vérification déterministe avant qu'il faille, pour
   certains cas, un second avis LLM (et donc rouvrir la question « qui vérifie
   le vérificateur ») ?
