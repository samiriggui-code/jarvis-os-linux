# JARVIS — Architecture post-Hermes (Core direct + Cursor Cloud Agents)

> **Statut :** décision figée par Samir le 2026-08-16 (soir). **Phases 1 et 2
> livrées et déployées 2026-08-17** (voir §5/§6). Seul restant : `JARVIS_CURSOR_REPO_URL`
> (§8) à fournir avant un vrai run Cloud Agents. Phase 3 (§7) toujours non commencée,
> feu vert requis.
> **Référence de travail pour Claude et Cursor sur ce chantier.** Ne remplace pas
> `JARVIS-Gateway-Hermes-HA.md` (historique de la migration HA/Hermes), mais en
> annule la partie Hermes pour tout nouveau développement à partir d'ici.
> **Voisins :** [`JARVIS-Gateway-Hermes-HA.md`](JARVIS-Gateway-Hermes-HA.md) (historique),
> [`../claude/JARVIS_SESSION_STATE.md`](../claude/JARVIS_SESSION_STATE.md) (handoffs live jour par jour).

---

## 1. Décision et contexte

Après une session de mise en prod difficile (latence Hermes non résolvable côté
Core, bugs de routage/confirmation, confusions répétées), décision ferme de
Samir : **retirer Hermes du runtime JARVIS entièrement — suppression réelle du
code, pas un flag de désactivation.**

**Objectif immédiat (Phase 1) :** JARVIS = Core + Home Assistant pour piloter
la maison, plus un chat simple, fiable, rapide, sans le framework Hermes.

**Objectif à moyen terme (Phase 2+) :** redonner à JARVIS des capacités
agentiques (recherche approfondie, tâches de développement, à terme
administration système) via des briques neuves, plus simples et sous contrôle
direct de Core — pas via un framework tiers dont on ne maîtrise pas les coûts
cachés (cf. `deploy/hermes/skills/README.md` : Hermes 0.20 ne permet pas de
filtrer les toolsets par requête, plancher de latence ~6-9s indépendant du
nombre de toolsets actifs).

---

## 2. Ce qui a été retiré (Hermes)

| Élément | Sort |
|---|---|
| `core/jarvis_core/hermes/` (bridge.py, delegate.py, events.py) | Retiré |
| `core/jarvis_core/hermes_toolsets.py` | Retiré |
| `gateway.py::hermes_chat_capability`, `assert_prod_hermes_boundary`, `BANNED_HERMES_TOOLSETS` | Retiré — **garder** `hass_default_url()` / `HASS_DEFAULT_URL` (sert HA, rien à voir avec Hermes) |
| Capacités `Owner.HERMES` dans `capabilities.py` (`skills`, `outils`, `crons`, `reach`, `browser`, `files`, `terminal`, `analyze`...) | Retirées |
| `chat_cancel.py`, `chat_research_route.py`, `chat_search_memory.py` | Retirés (dépendaient du chat Hermes) |
| Smokes `_smoke_gateway`, `_smoke_core_hermes_boundary`, `_smoke_hermes_*`, `_smoke_chat_capability_routing`, `_smoke_chat_research_route`, `_smoke_chat_search_memory` | Retirés |
| `deploy/hermes/` (skills, config.snippet.yaml) | Retiré |
| Service NUC `jarvis-hermes` | Stop + disable |

**État au 2026-08-16 22h35 :** retrait piloté par Cursor, en cours/fait côté
runtime (service stoppé). **Vérifier avec Cursor l'état exact du nettoyage
code avant de repartir dessus** — ne pas supposer que tout est fait sans
recontrôler (`grep -ri hermes core/jarvis_core/ | grep -v _smoke` doit
remonter vide, hors commentaires historiques).

---

## 3. Ce qui NE change PAS

- **Domotique** : Core → HA directement (`home.control`, `media.*`,
  `Owner.CORE`) — n'est jamais passé par Hermes, ne bouge pas.
- **Agent Windows** (`Owner.DEVICE`) : `core.cursor`, `devices.software`,
  `device.app_launch` — inchangé, JARVIS pilote toujours le PC et lance les
  apps installées (dont Cursor, Claude) via ce chemin.
- **Auth** (face/voix), **Memory** (Postgres), tuiles HUD système — inchangés.

---

## 4. Architecture cible

```
                              HUD / Dashboard
                                    │ WS :8765
                             ┌──────┴──────┐
                             │ JARVIS Core │
                             └──────┬──────┘
        ┌────────────┬─────────────┴──────────┬──────────────────┐
        │            │                         │                  │
  Home Assistant  LLM Bridge            Mission Control Dev   Agent Windows
  (domotique)    (chat / recherche)         (kanban)          (PC, apps)
        │            │                         │
   Apple TV,     OpenRouter (primaire)    Cursor Cloud
   Bravia,       + Anthropic (secours)     Agents API
   Freebox                                 (Phase 2)
```

---

## 5. Phase 1 — LLM Bridge (chat / recherche) — **livré 2026-08-17**

### 5.1 Rôle

Remplace ce que faisait Hermes pour le chat libre : reçoit une phrase,
appelle un LLM, renvoie une réponse structurée (texte à dire + carte à
afficher). Aucune capacité d'exécution (pas de SSH, pas de code, pas de
terminal) — uniquement génération de texte/structure.

**Écart avec le plan d'origine (pour mémoire) :** pas de nouveau fichier
`llm_chat.py` — Cursor avait déjà branché `chat.py` sur `providers.py`
(l'AI Provider Manager, antérieur à Hermes) avant que ce chantier ne
commence. Le travail réel a consisté à étendre `providers.py` plutôt qu'à
construire un pont neuf.

### 5.2 Moteurs

| Moteur | Rôle | Clé |
|---|---|---|
| OpenRouter | Primaire — modèle `anthropic/claude-sonnet-4.5` (`JARVIS_OPENROUTER_MODEL`) | `OPENROUTER_API_KEY` dans `/etc/jarvis/core.env` (NUC) |
| Anthropic direct | Secours si OpenRouter échoue | `ANTHROPIC_API_KEY` dans `core.env` (posée) |
| ~~Ollama~~ | **Retiré** — jamais configuré, mort dans le code (`ProviderMode.LOCAL/REMOTE`, `_ollama_complete` supprimés) | — |

Mesuré en direct sur le NUC : ~2,4-4,8s selon la complexité (contre 6-9s
plancher avec Hermes).

### 5.3 Contrat de réponse structuré (réel, `providers.py::complete_structured`)

```json
{
  "speech": "Texte court à dire à voix haute, 2 à 4 phrases, faits concrets — peut se terminer par une suggestion de suite, seulement si pertinent.",
  "component": "ResultPanel | DataTable | ImageViewer | ChartCard",
  "props": { "...": "props obligatoires exactes du composant choisi, cf. STRUCTURED_COMPONENTS" }
}
```

Le **LLM choisit lui-même le composant** parmi 4 (sous-ensemble volontaire
des 58 du catalogue `ui_catalog.json`) selon la forme de la demande —
texte, tableau, photo, graphique. `speech` → TTS (`self.speak`, inchangé).
`component`+`props` → `_publish_component_surface` (nouvelle fonction
générique dans `surfaces/publisher.py`, `publish_result_surface` conservée
telle quelle pour compat rétro).

**Robustesse :** JSON invalide, composant halluciné ou champ manquant →
`_parse_structured_reply` retombe toujours sur `ResultPanel` en préservant
le texte utile (jamais le JSON brut lu à voix haute, jamais de crash).
`STRUCTURED_COMPONENTS` déclare les props **obligatoires exactes** de
chaque composant, vérifiées par smoke contre le vrai catalogue HUD (détecte
toute dérive si le HUD change un schéma).

### 5.4 Fichiers réellement touchés

| Fichier | Rôle |
|---|---|
| `core/jarvis_core/providers.py` | `complete_structured()`, `STRUCTURED_COMPONENTS`, `_parse_structured_reply()`, repli Anthropic, palier Ollama retiré |
| `core/jarvis_core/ws/handlers/chat.py` | Chat libre → `complete_structured` ; contexte mémoire (lecture seule, §5.6) injecté avant l'appel ; carte agentic UI publiée en plus de la voix |
| `core/jarvis_core/ws/handlers/auth.py` | `_speak_welcome_greeting()` — accueil dynamique après login (§5.6) |
| `core/jarvis_core/surfaces/publisher.py` | `publish_component_surface()` — généralisation, n'importe quel composant du catalogue |
| `core/jarvis_core/executors/surfaces.py` | `_publish_component_surface()` — wrapper orchestrateur |
| `core/jarvis_core/_smoke_providers_fallback.py`, `_smoke_structured_reply.py`, `_smoke_intuitivite.py` | Smokes (mock réseau, aucun appel réel) |

### 5.5 Composants agentic UI exposés au chat libre — 14/58, triés le 2026-08-17

`ResultPanel`, `DataTable`, `ImageViewer`, `ChartCard`, `StatCard`,
`InfoCard`, `KeyValueList`, `TimelineChart`, `DataList`, `TreeView`,
`CodeBlock`, `MarkdownBlock`, `QuoteBlock`, `TextBlock`.

**Les 44 autres sont exclus délibérément, pas oubliés.** Tout composant
représentant un **état système réel** (`SystemMonitor`, `DeviceGrid`,
`ProcessList`, `Terminal`, `HealthOverview`, `ToolCall`, `ToolResult`,
`ExecutionStatus`, `VerificationCard`, `MemoryPanel`, `CommandConsole`,
`CameraPreview`, `GesturePanel`, `VoiceBar`, `ScanningPanel`,
`SettingsPanel`, `ServiceHub`, `DeviceCard`, `Graph3D`, `DevIssueBoard`,
`LogViewer`, `EventList`, `MetricChart`, `MetricGrid`, `Progress`,
`StatList`, `StatusCard`, `Screenshot`) ou **déclenchant une vraie action**
(`ApprovalCard`, `DialogCard`, `ActionRequest`) reste réservé aux chemins
Core qui lisent/écrivent l'état réel — jamais à un LLM qui pourrait
l'halluciner de façon plausible. Le reste (`Breadcrumb`, `CommandBar`,
`FilterBar`, `SearchBar`, `TabBar`, `ToastStack`, `SectionHeader`,
`AvatarChip`, `MessageCard`) est du chrome de navigation, pas du contenu
de réponse.

Étendre `STRUCTURED_COMPONENTS` (un dict, un composant à la fois) pour en
ajouter d'autres — le smoke `_smoke_structured_reply.py` vérifie
automatiquement que les props déclarées correspondent au vrai catalogue.

**Deux bugs réels trouvés en testant les 10 nouveaux composants en direct
(2026-08-17, corrigés) :**
1. **`ImageViewer` — URL halluminée.** Demande « photo de la tour Eiffel »
   sans outil de recherche d'image branché → Claude a rendu une URL
   Unsplash plausible mais inventée, malgré la consigne explicite. La
   consigne seule ne suffisait pas. Fix : `providers.py::verify_image_url()`
   — HEAD réel côté Core avant affichage (avec un `User-Agent` explicite,
   sinon faux négatif sur des CDN comme Wikipedia qui bloquent les requêtes
   sans UA) ; repli `ResultPanel` si l'URL ne répond pas ou n'est pas une
   image. Câblé dans `chat.py` juste avant `_publish_component_surface`.
2. **`max_tokens=400` trop court pour un JSON riche.** Réglé à l'origine
   pour du chat bref (Qwen), insuffisant pour un `KeyValueList`/`CodeBlock`
   verbeux → réponse tronquée en plein milieu, JSON invalide, texte brut
   tronqué renvoyé comme repli (aurait été lu à voix haute tel quel). Fix :
   `max_tokens` paramétrable bout en bout (`complete()` → `_openrouter_complete()`/
   `_anthropic_complete()`), `complete_structured()` demande 1200 au lieu
   du défaut 400.

**Toujours hors scope :** vidéo (pas de source réelle disponible) ; vraie
recherche web (Anthropic expose un outil `web_search` hébergé côté API —
à évaluer avant de recoder un `agent-reach` maison, pas fait) ; tuile HUD
"Assistant" dédiée (réutilise la tuile `reach` existante pour l'instant).

### 5.6 Intuitivité — accueil, suggestion, mémoire (demande Samir, ajoutée en cours de chantier)

- **Accueil dynamique** — après login réussi, `_speak_welcome_greeting()`
  génère et parle une phrase contextuelle (heure, jamais figée), termine
  par une question ouverte. Tâche de fond (`asyncio.create_task`) : un
  échec ne bloque jamais le login.
- **Suggestion proactive légère** — consigne dans `_STRUCTURED_INSTRUCTIONS` :
  suite naturelle en fin de `speech` seulement quand pertinent, jamais
  systématique, jamais sur une réponse déjà complète.
- **Contexte mémoire** — `jarvis_memory_search` (lecture seule, `memory/service.py`,
  déjà existant, backend Postgres) interrogé avant chaque réponse ; les
  souvenirs pertinents enrichissent le prompt sans jamais être inventés.
  **Invariant préservé** : le chat libre ne fait jamais écrire en mémoire —
  ça reste réservé au pipeline Vérification (`orchestrator_lifecycle.py`,
  « un LLM ne produit jamais cette décision »).
- **Pas fait** : anticipation multi-session profonde (Jarvis qui remarque
  des patterns sur plusieurs jours) — la lecture mémoire actuelle est
  par-requête, pas un profil de comportement appris.

---

## 6. Phase 2 — Mission Control Dev via Cursor Cloud Agents API

### 6.1 Existant — ne pas reconstruire

- `core/jarvis_core/mission_dev/` — board local (`board/store.py`,
  `board/service.py`, `board/types.py`), kanban.
- Intents déjà câblés : `core.mission_dev`, `dev.board.create`,
  `dev.board.assign`, `dev.board.start_run` (`Owner.CORE` → `Device`).
- Agentic UI déjà existante côté HUD (app_id `mission-control-dev`).

### 6.2 Ce qui change

| Avant | Après |
|---|---|
| `dev.board.start_run` lance `Cursor.exe` en local via l'agent Windows — quelqu'un doit piloter à la main | Appelle la **Cloud Agents API** Cursor (clé `crsr_...`) pour lancer un agent réel en arrière-plan sur le dépôt |
| Sync kanban via Hermes (`mission_dev/kanban.py::sync_project_card`, toolset `skills`) | Retiré avec Hermes — le board local reste la source de vérité (le sync Hermes était déjà non-bloquant par design, aucune perte fonctionnelle) |

### 6.3 Sécurité

- Toute mission dev déclenchée par la voix passe par le Policy Engine
  (risque ADMIN minimum) avant l'appel API — jamais d'exécution silencieuse.
- Confirmation visible HUD avant tout lancement d'agent Cursor.
- Clé API Cursor : jamais dans le repo, `core.env` NUC uniquement (même
  emplacement que les autres clés — voir §8).

### 6.4 Fichiers

- `core/jarvis_core/cursor_agents.py` — client Cloud Agents API (**livré 2026-08-17**)
- `core/jarvis_core/dev_agent/dispatch.py` — branche cloud si `CURSOR_API_KEY` + `agent=cursor` ; fallback device Windows sinon
- Smoke : `python -m jarvis_core._smoke_cursor_agents`

---

## 7. Phase 3 — SSH / exécution système (non commencé)

**Ne pas commencer sans feu vert explicite de Samir — risque sécurité réel
(IA + accès shell).**

- Cas d'usage : administration NUC/Pi hors dépôt git (ce que la Cloud Agents
  API Cursor ne couvre pas — elle travaille sur un repo, pas sur
  l'administration système).
- Prérequis avant tout code :
  - Allowlist explicite des machines cibles (NUC ? Pi ? jamais un poste
    perso sans confirmation).
  - Blocklist dure de commandes (reprendre le principe `_ADMIN_HINTS` de
    l'ancien `policy.py` : `rm -rf`, `format`, `shutdown`, `passwd`,
    `iptables`, `curl|bash` → refus net, jamais une simple confirmation).
  - Confirmation renforcée admin (carte HUD visible, pas un « oui » vocal
    seul).
  - Journal d'audit — `tool_events.py` existe déjà, à réutiliser tel quel.

---

## 8. Clés API — emplacement (jamais dans le repo, jamais commitées)

| Clé | Emplacement | Usage | État |
|---|---|---|---|
| `OPENROUTER_API_KEY` | `/etc/jarvis/core.env` (NUC) | Phase 1, primaire | ✅ posée (déjà présente avant ce chantier) |
| `ANTHROPIC_API_KEY` | `/etc/jarvis/core.env` (NUC) | Phase 1, secours | ✅ posée 2026-08-16 |
| `CURSOR_API_KEY` (`crsr_…`) | `/etc/jarvis/core.env` (NUC) | Phase 2 | ✅ posée 2026-08-17 |
| `JARVIS_CURSOR_REPO_URL` | `/etc/jarvis/core.env` (NUC) | Phase 2 — dépôt cible des Cloud Agents | ❌ **pas posée** — pas de remote git sur ce repo local, Claude ne peut pas la deviner. À fournir par Samir/Cursor. |

---

## 9. Règles de coordination Claude / Cursor sur ce chantier

- Avant de toucher un fichier listé en §5.4 ou §6.4, vérifier
  `JARVIS_SESSION_STATE.md` pour un signal « EN COURS » de l'autre agent sur
  le même fichier.
- Un chantier = une phase à la fois par agent, annoncée dans le fichier de
  session avant de commencer, mise à jour à la fin.
- Ne pas relancer Hermes sans décision explicite de Samir — l'architecture
  cible des Phases 1 et 2 n'en a plus besoin.

---

## 10. Glossaire — pour lever les confusions de la session du 2026-08-16

| Terme | Ce que c'est | Ce que ce n'est **pas** |
|---|---|---|
| Claude Code (CLI) | Outil de dev interactif, sert à écrire le code avec Samir | Ne tourne jamais en prod ; pas un service que Core appelle à l'exécution |
| Cursor (IDE) | Outil de dev, écrit du code aussi | Idem — l'IDE lui-même n'est pas un service runtime |
| Cursor Cloud Agents API | Vraie API HTTP (`crsr_…`) pour lancer des agents de code à distance, sans IDE ouvert | Pas faite pour du chat conversationnel instantané — pense « tâche sur un dépôt », pas « quelle heure il est » |
| API Anthropic / OpenRouter | API HTTP brute : entrée texte → sortie texte (ou JSON structuré) | Ne sait pas faire de SSH, éditer un fichier ou exécuter du code toute seule — il faut coder et brancher les outils explicitement autour |
