# Intégration outils → Core → surfaces agentic

> Plan opérationnel. Inventaire détaillé : [`JARVIS-Outils.md`](./JARVIS-Outils.md).  
> Contrat UI : [`JARVIS-Agentic-UI.md`](./JARVIS-Agentic-UI.md).  
> Canvas session : `canvases/jarvis-outils-surfaces.canvas.tsx`.

## Règle

**Toolset Hermes** (pas outil unitaire) → `Capability` → Policy → exécution → `_publish_result_surface`.  
Hermes ne parle jamais au navigateur. Lampes / Plex = Core sans LLM.

## Vagues

| Vague | Objectif | Items |
|------|----------|--------|
| **1** | Fin des pages vides | web, browser, file, home état, video, tokens, cerveau → ResultPanel systématique |
| **2** | Console / admin | terminal→CommandConsole, code_execution, skills, crons, memory+todo Capability |
| **3** | Réfléchir / improviser | clarify, delegation, session_search, Spotify ON, Planner si intent ambigu |
| **4** | Perception & scènes | vision Hermes, scènes HA complexes |
| **5** | Périphérie | computer_use / Device Manager, a2a, image_gen |

## Perfectionner la compréhension

```
Entendre → Interpréter (match_intent + filets)
  → Planifier (manque : multi-étapes + clarify)
  → Autoriser (Policy + ROLE_TOOLSETS)
  → Exécuter (Core | Hermes)
  → Afficher (catalogue UI)
  → Parler (TTS)
```

Le trou principal aujourd’hui : **pas de Planner** — hors déclencheurs, tout tombe en chat OpenRouter sans surface. Vague 3 comble ça.

## Prochaine action code

Vague 1 : après chaque `_execute_*` / `_chat_via_capability`, toujours publier une surface admissible pour `cap.app_id`.
