# Vision JARVIS — Core, agents, voix et supervision

> **Figé le 2026-08-09** (Samir). Référence pour la prochaine évolution produit — pas une spec d’implémentation immédiate.

## Thèse

**JARVIS = le Core.** Claude, Cursor, DeepSeek, Hermes, etc. sont des **cerveaux et outils** que JARVIS utilise. Le Core reçoit la demande, comprend le contexte, connaît l’état des projets, planifie, sélectionne les agents, attribue des missions, surveille l’exécution, **vérifie les résultats**, mémorise et rend compte. **L’humain reste décideur ; JARVIS est chef d’orchestre.**

Flux cible :

**Moi → JARVIS Core → analyse → planification → agents → missions → exécution → vérification → rapport → moi.**

Un agent ne modifie pas l’architecture ou les règles sans que le Core évalue les conséquences et demande validation humaine si nécessaire.

## Équipe virtuelle dynamique

Agents possibles selon la mission : Claude, Cursor, DeepSeek, sécurité, réseau, DevOps, QA… JARVIS compose l’équipe **à la demande**, coordonne, ne les laisse pas tous actifs en permanence.

## Comptes rendus structurés

Chaque agent produit un CR : mission, état, actions, fichiers modifiés, commandes, tests, erreurs, résultats, blocages, prochaine action.

**Rapport agent ≠ preuve.** Le Core confronte au réel : Git, fichiers, logs, tests, build, services. « Terminé » n’est vrai qu’après **verify** Core.

## Chaîne de responsabilité

Les agents peuvent « prendre la parole » (voix distincte possible via Voicebox/TTS), mais :

- JARVIS annonce la délégation ;
- l’agent peut présenter son CR ;
- JARVIS vérifie et confirme ou contredit.

Pas de confiance aveugle au texte agent.

## Voix = restitution filtrée

Événements structurés d’abord : `TASK_STARTED`, `FILE_MODIFIED`, `TEST_RUNNING`, `ERROR_FOUND`, `TASK_COMPLETED`, etc.

Le Core décide ce qui mérite d’être dit à voix haute. Les agents travaillent **surtout en silence**. La voix n’est pas une conversation permanente entre machines.

## HUD = poste de supervision

Agentic UI / Mission Control : plusieurs espaces (Cursor dev, Claude archi, Security audit…), état live, fichiers, tests, erreurs, progression. Voix = alertes importantes ; HUD = inspection du détail.

## Mémoire & traçabilité

Chaîne à conserver :

**projet → mission → agent responsable → actions → événements → résultats → erreurs → tests → validation → décision**

Graphify = représentation vivante ; Mission Control = historique opérationnel. Permet des questions du type : « pourquoi cette architecture a changé ? » avec preuves.

## Philosophie (résumé)

| Rôle | Qui |
|------|-----|
| Travailler | Agents |
| Orchestrer, surveiller, vérifier, mémoriser, rendre compte | JARVIS Core |
| Montrer | HUD |
| Informer (filtré) | Voix |
| Décision finale (archi / règles) | Humain |

Objectif : **deuxième cerveau opérationnel** vérifiable — pas une démo spectaculaire.

## Fan-out sous-tâches (pattern, pas runtime)

Idée reprise de DeerFlow 2.0 (lead → sub-agents → synthèse) — **doc / prompts seulement**.

```
Mission (Core)
  → Hermes lead décompose
  → sous-tâches parallèles (scopes isolés, toolsets bornés)
  → chaque sous-tâche : CR structuré (actions, preuves, erreurs)
  → synthèse lead
  → Core verify (rapport ≠ preuve) → Report / HUD / voix filtrée
```

| Faire | Ne pas faire |
|-------|----------------|
| `delegate_task` / toolsets Hermes | Brancher LangGraph / DeerFlow / **CrewAI** comme second cerveau |
| CR structuré par sous-tâche | Confiance aveugle au texte agent |
| Isoler le contexte par sous-tâche | Tout mélanger dans un seul prompt géant |

### Personas sous-tâche (idée CrewAI — prompts Hermes, pas la lib)

Chaque sous-tâche / agent délégué porte explicitement :

| Champ | Équivalent CrewAI | Chez JARVIS |
|-------|-------------------|-------------|
| **role** | `role` | Qui parle (ex. « chercheur web », « ops NUC ») |
| **goal** | `goal` | Objectif unique borné |
| **backstory** | `backstory` | Contraintes produit (Policy, allowlist, pas de secrets TTS) |

Processus :

| Mode | Quand |
|------|--------|
| **Sequential** | Dépendances strictes (fetch → filtre → synthèse) |
| **Hierarchical** | Lead Hermes = manager ; sous-tâches en parallèle puis synthèse |

CR / tâche (idée `tasks.yaml`) — champs minimaux du compte-rendu :

```text
description      — ce qui a été demandé
expected_output  — forme attendue (liste, CR, fichier…)
agent / role     — qui l’a fait
actions          — outils / intents
evidence         — preuves (pas seulement le texte)
errors / blocages
```

**Rapport ≠ preuve** : le Core verify (smoke, health, état réel) tranche « terminé ».  
Human review sur task sensible = **Policy HITL** (pas un flag CrewAI).  
Sorties structurées = contrats WS / `ToolEvent` / Pydantic Core déjà en place — pas `output_pydantic` CrewAI.

Flows état + routeurs (`@listen` / `@router`) → pattern **Mission → Evidence → Verify → Report** dans le Core — **pas** le runtime Flows.

### Personas « /ship » (dev Cursor — idée Addy Osmani)

Même logique de panel avant go/no-go, **sans** le pack `addyosmani/agent-skills` :

| Persona | Angle |
|---------|--------|
| code-reviewer | Correctness, scope, secrets |
| security-auditor | Policy, auth, allowlist, pas IA→root |
| test-engineer | Smokes / gates branchés |
| ops | Sync NUC, seed Hermes, health |

Règle Cursor : `.cursor/rules/dev-lifecycle.mdc`. Amont noté dans `vendor/README.md` (idées, pas clone).

## Always-on / veille (pattern — idée awesome-llm-apps)

Agents « briefing pendant que tu dors » → chez JARVIS :

| Cible | Où | Canal |
|-------|-----|--------|
| Brief foyer / HA / freebox | Hermes `cronjob` ou missions Core (`data/missions.json`) | HUD + voix filtrée — **pas** Slack-first |
| Release radar deps | Cron Hermes ou script deploy (plus tard) | Dashboard ADMIN |
| HN / news tech | Optionnel via agent-reach + cron | Pas brancher leur Always-on HN tel quel |

Policy : cron = risk selon action ; pas d’écriture sociale auto ; secrets hors TTS.

## Voice Live (réf. only)

Templates « Insurance Claim Live / Voice RAG » = patterns turn-taking utiles à lire.  
**Auth HUD figée** : phrase STT « Jarvis, active-toi » — pas Gemini Live comme facteur d’accès.  
Voix produit = wake Pi + voicebox + protocole jarvis-os.

## Mémoire wiki + progressive retrieve (idée memU)

Amont [NevaMind-AI/memU](https://github.com/NevaMind-AI/memU) — **patterns only**.

| Prendre | Refuser |
|---------|---------|
| Wiki Markdown lisible (`MEMORY.md`) | 4ᵉ store opaque / memU cloud |
| Progressive retrieve avant mission | Patch auto de `SOUL.md` (`memu-hermes`) |
| Agent distille ; store = index/rappel (pas LLM dans le store) | Auto-extraction de skills produit |
| `doctor` / verify après seed | Fusion Cursor-dev ↔ Hermes foyer |
| Futur adapter TranscriptSource+HostSpec **maison** | Clone `vendor/memU` |

Ops verify (hygiène) : après seed conscience —
`test -f /var/lib/jarvis/hermes/memories/MEMORY.md` · `curl -sS http://127.0.0.1:8642/health`.

Implémentation runtime = évolution Hermes + couche Mission Core — hors scope tant
que Device Router / Mission loop ne sont pas ouverts.

## Écart vs code actuel (2026-08-09)

| Vision | Repo aujourd’hui |
|--------|------------------|
| Contrat mission + evidence + verify runtime | Smokes dev, Policy partielle, pas de boucle mission complète |
| Bus événements agent silencieux | WS/Hermes SSE, notifications HUD — pas de schéma `TASK_*` unifié |
| VoicePolicy Core | voicebox/TTS + séquences auth ; pas de filtre événements agent |
| Mémoire mission traçable | Postgres, Hermes memory, `data/missions.json` — fragmenté |

**Prochaine évolution** : couche **Mission → Execute → Evidence → Verify → Report** dans le Core, alimentant HUD agentic + voix filtrée.
