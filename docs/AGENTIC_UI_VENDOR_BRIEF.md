# Brief Claude — Agentic UI & agents (refs vendor)

> **Pour** : analyse Claude (architecture / intégration JARVIS OS).  
> **Pas du code produit** — références clonées sous `vendor/` (gitignored).  
> **Date** : 2026-08-03.  
>
> **Compléments stratégiques** (registre, AG-UI protocole, Planner, Vision A/B) :  
> → [`docs/AGENTIC_UI_ARCHITECTURE.md`](AGENTIC_UI_ARCHITECTURE.md)  
> ⚠ Ne pas toucher aux dossiers `vendor/second-brain-*` pendant un test en cours.

---

## 0. Contexte JARVIS (à respecter)

```
IA → Proposition → Policy Engine → Autorisation → Exécution
```

- Produit : `core/` + `hud/` + `dashboard/` + `setup/` + `deploy/`.
- Orchestrateur : Core WS `:8765` ; cerveau agent = **Hermes** HTTP `:8642`.
- **Pas** de monolithe UI agentic inventée : une seule bibliothèque visuelle JARVIS ;
  l’agent **compose** des briques enregistrées, il ne génère pas de JSX arbitraire.
- CopilotKit / Eve / A2UI / AG-UI = **concepts** (cahier §3.6), pas imports runtime
  obligatoires tant que non décidé.

### Pages produit vs Agentic UI

| Type | Exemples | Qui dessine |
|------|----------|-------------|
| Pages **statiques** | Home, Voix, Caméra, Settings, Mission Control… | Designées à la main |
| Vues **agentic** | « Pourquoi la caméra rate les gestes ? » → panneau dynamique | Agent choisit des composants du registre |

Les deux coexistent : la page Caméra reste ; l’agent peut ouvrir un panneau à côté
(metrics, logs, actions).

### Cible d’architecture (vision produit)

```
packages/ui          → Orb, Terminal, Metric, Chart, Window… (design system unique)
packages/agentic-ui  → moteur : registre + protocole + composition (pas de widgets)
apps/hud | dashboard | mission-control  → consomment packages/ui
```

Aujourd’hui le monorepo n’a pas encore `packages/` — HUD/Dashboard portent le UI.
`@jarvis/ui` stub (lab faux Orb Canvas2D) a été **retiré** ; ne pas le ressusciter.

---

## 1. Repos clonés dans `vendor/`

Vérifier sur disque :

```
vendor/eve-analyst/
vendor/redis-iris-agent/
vendor/second-brain-research-dashboard/
vendor/human-in-the-loop-rag-agent/
vendor/CopilotKit-main/
```

Upstream :

| Dossier | Upstream | Licence (upstream) |
|---------|----------|--------------------|
| `eve-analyst` | https://github.com/coleam00/eve-analyst | MIT (demo) / Eve Apache-2.0 |
| `redis-iris-agent` | https://github.com/coleam00/redis-iris-agent | MIT |
| `second-brain-research-dashboard` | https://github.com/coleam00/second-brain-research-dashboard | (voir repo) |
| `human-in-the-loop-rag-agent` | https://github.com/coleam00/human-in-the-loop-rag-agent | (voir repo) |
| `CopilotKit-main` | CopilotKit (vendor existant) | (voir repo) |

Index local : `vendor/README.md` — registre des amonts et état du sas.
(`vendor/MIX.md` a été supprimé le 2026-08-05 : il faisait doublon et décrivait
dix dossiers qui n'existaient plus.)

⚠ Ne jamais importer `vendor/` dans le build produit. Pas de secrets `.env` vendor.

---

## 2. Carte mentale (4 couches)

| Couche | Repo de référence | Question |
|--------|-------------------|----------|
| Agent **agit** | `eve-analyst` | Tools, HITL, sandbox, skills, subagents, evals |
| Agent **lit + se souvient** | `redis-iris-agent` | MCP données live vs mémoire utilisateur |
| Agent **compose l’UI** | `second-brain-research-dashboard` | AG-UI + catalogue A2UI (59 comps) |
| Agent **attend l’humain** | `human-in-the-loop-rag-agent` | État bidirectionnel + validation sources |
| Orchestration UI (générique) | `CopilotKit-main` | `renderUI` / actions — compose, ne dessine pas |

---

## 3. Fiches repo (ce que Claude doit lire)

### 3.1 `eve-analyst` — agent data analyst (Vercel Eve)

**Lire** : `README.md`, `SPEC.md`, `agent/`, `evals/`.

- Agent = dossier : `instructions.md`, `tools/`, `skills/`, `subagents/`, `channels/`, sandbox.
- Tools : `list_tables`, `describe_table`, `run_sql` (SELECT only + approval si scan lourd), `run_analysis` (Python sandbox `networkPolicy: deny-all`).
- Skills on-demand (`revenue-rules`).
- Subagent `investigator` pour les « pourquoi ».
- Evals = gate de déploiement.
- **Pas d’UI generative** — HTTP/Slack/TUI.

**Prendre pour JARVIS** : Policy HITL, tools typés, sandbox isolé, skills Hermes, evals comportement.  
**Laisser** : lock-in Eve/Vercel, stack UI.

### 3.2 `redis-iris-agent` — contexte Redis Iris (Pydantic AI)

**Lire** : `README.md`, `src/redis_iris_agent/` (`agent.py`, `memory.py`, `cli.py`).

- **Context Retriever** : MCP HTTP, outils auto (`get_*`, `filter_*`, `search_*`, `find_*_range`) depuis modèle d’entités.
- **Agent Memory** : session + long-terme (`search_memory` / `store_memory`).
- Accès scopé par clé API côté serveur.
- Preview Redis Iris — POC, pas template prod.

**Prendre** : séparation data live / mémoire user ; MCP tools ; recall cross-session.  
**Laisser** : dépendance Redis Cloud Iris preview obligatoire.

### 3.3 `second-brain-research-dashboard` — generative UI (AG-UI + A2UI)

**Lire** : `README.md`, `frontend/src/lib/a2ui-catalog.tsx`, `frontend/src/hooks/useDashboardAgent.ts`, `frontend/src/components/A2UI/`, `agent/` (`content_analyzer`, `layout_selector`, `a2ui_generator`, `main.py`).

Pipeline :

```
Markdown → Content Analyzer → Layout Selector → A2UI Generator
         → AG-UI SSE (StateSnapshot / StateDelta JSON Patch)
         → A2UIRenderer + catalogue React
```

- 59 composants / 11 catégories (News, Media, Data, Lists, Layout…).
- L’agent **émet des specs** (`component` + `props`), pas du JSX libre.
- Frontend applique les patches d’état.

**Prendre** : protocole AG-UI, registre + métadonnées, composition agentic.  
**Laisser** : widgets shadcn tels quels — remplacer par biblio JARVIS (Orb réel = `JarvisOrb.jsx`, etc.).

### 3.4 `human-in-the-loop-rag-agent` — HITL RAG (CopilotKit + Pydantic AI)

**Lire** : `README.md`, `agent/state.py`, `agent/agent.py`, `frontend/src/app/page.tsx`, composants `ApprovalCard` / `ChunksPanel`.

```
React useAgent ↔ CopilotKit ↔ AG-UI ↔ Pydantic AI RAG
```

Flux HITL :

1. User question  
2. Agent search → `awaiting_approval = true`  
3. UI affiche sources  
4. User approve/reject  
5. Agent synthétise **uniquement** sur chunks approuvés  

État partagé (`RAGState`) : chunks agent→UI, approvals UI→agent, search_config bidirectionnel.

**Prendre** : miroir Policy Engine ; sync d’état ; UI qui bloque l’agent.  
**Laisser** : pgvector/CopilotKit comme runtime HUD imposé.

### 3.5 `CopilotKit-main`

**Lire** : docs / exemples generative UI / `useCopilotAction` / `render`.

Rappel : **CopilotKit n’est pas branché** dans `core/` ni `hud/` (vérifié 2026-08-03).
Cahier : inspiration conceptuelle uniquement.

---

## 4. Mapping vers le code JARVIS actuel

| Concept ref | Où ça vit déjà / devrait vivre |
|-------------|--------------------------------|
| Policy / HITL | `core/jarvis_core/policy.py`, recovery, auth |
| Agent LLM | Hermes (`vendor/agents/hermes-agent`, deploy) |
| Skills | `deploy/hermes/skills/` |
| Mémoire foyer | Hermes consciousness / seed (`deploy/scripts/seed-hermes-…`) |
| Orbe produit | `hud/src/app/components/orb/JarvisOrb.jsx` |
| Boot cinématique | `hud/src/ui/boot/` (OrbVoyage) — **garder** |
| WS HUD ↔ Core | `hud/src/app/bridge/`, Core `:8765` |
| Agentic UI moteur | **À concevoir** — ne pas remettre le stub `@jarvis/ui` |

État constaté (2026-08) :

- Stub `@jarvis/ui` (lab Orb anneaux, ParticleField…) **supprimé**.
- Reste sous `hud/src/ui/` : `boot/`, `core/`, `tokens.ts`.
- CopilotKit **pas** dans `core/requirements.txt` ni imports Python/HUD.

---

## 5. Questions ouvertes pour Claude

1. Protocole AG-UI : adopter tel quel sur le WS Core existant, ou couche Hermes dédiée ?
2. Registre composants : où vivent les métadonnées (`name`, `description`, `props` Zod) — HUD seul, ou Core+Hermes tools ?
3. HITL UI : réutiliser le flux Policy / AuthScene, ou panneau type `ApprovalCard` ?
4. Mémoire : Iris-like (MCP + store) vs mémoire Hermes actuelle — fusion ou parallèle ?
5. Monorepo `packages/ui` + `packages/agentic-ui` : timing vs continuer dans `hud/` ?
6. second-brain : quels **noms** de composants A2UI mapper vers des briques JARVIS réelles (Metric↔SystemMonitor, Terminal↔…, Orb↔JarvisOrb) ?

---

## 6. Mission demandée à Claude

Produire une **analyse d’intégration** (pas d’implémentation massive) :

1. Synthèse des 5 vendors (forces / hors-scope JARVIS).  
2. Proposition d’architecture cible (diagramme ASCII) alignée Policy + Hermes + UI unique.  
3. Plan par phases (P0 protocole+registre, P1 HITL, P2 composition sur 1 page produit, P3 mémoire).  
4. Liste explicite : fichiers JARVIS à toucher / à ne pas toucher.  
5. Risques (lock-in CopilotKit/Eve, double orbe, secrets vendor).  
6. Si pertinence cahier : propositions de patch §3.6 (Agentic UI) — **sans** fusionner tant que Samir n’a pas validé.

**Contraintes** : pas d’IA→root ; secrets hors git ; vendor = lecture seule ; orbe = JarvisOrb produit, pas un faux Orb Canvas2D.
