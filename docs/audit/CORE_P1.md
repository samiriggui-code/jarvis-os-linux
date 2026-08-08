# Core P1 — intégrations services (2026-08-08)

Gate : `python -m jarvis_core._smoke_p1` (inclus dans `_smoke_phase6`).

## Livrables

| Sujet | Fichiers | Comportement |
|-------|----------|--------------|
| Mission DEV ↔ kanban | `mission_dev/kanban.py`, `mission_dev/__init__.py`, `executors/surfaces.py` | Au jalon `hermes`, sync kanban via Hermes (`skills` + outils `kanban_*`). Échec = log + suite locale. |
| Entrée unique mission | `_start_mission_dev_run` | Tuile, voix (« nouveau projet X »), WS `mission_dev` → même runner + Policy. |
| Chat libre | `ws/handlers/chat.py` | Défaut : Provider Manager (`llm`). `JARVIS_CHAT_PROVIDER=hermes` → `_open_intent` sur `agent.tools` / skills. |
| Surface Decision | `surface_decision.py` | Mapping `kanban_*`, fichiers, `core.mission_dev`, `files.browse`, `data.analyze`. |

## Divergence documentée — chat

| Chemin | Quand | LLM / agent |
|--------|-------|-------------|
| **llm** (défaut) | Phrases non routées | Ollama VPS → OpenRouter → sans LLM |
| **hermes** | `JARVIS_CHAT_PROVIDER=hermes` | Hermes `/v1/runs` + toolsets (seed, mémoire, skills) |

Les deux passent par Policy ; Hermes réutilise le circuit intent unifié (tuile = voix).

## Non scope P1

- Tests enroll voicebox réels (foyer vide)
- HUD React consommateur
- `core.missions`, `vps.code`, Spotify
