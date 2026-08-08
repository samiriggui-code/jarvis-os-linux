# JARVIS Core

Orchestrateur Python : Policy Engine + AI Provider Manager + WebSocket HUD.

```
cd core
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m jarvis_core
```

Écoute : `ws://127.0.0.1:8765`

## Modes IA (Provider Manager)

**Cible prod** : `Ollama VPS` (`JARVIS_REMOTE_LLM_URL`) → `OpenRouter` → mode système.  
ProLiant = Plex Windows uniquement (pas d’Ollama). Détail : [`docs/INSTALLATION_DEPLOIEMENT.md`](../docs/INSTALLATION_DEPLOIEMENT.md).

| Variable | Effet |
|----------|--------|
| (aucune) | `system` — pas de LLM |
| `JARVIS_REMOTE_LLM_URL` | `remote` — **Ollama VPS (#1)** |
| `OLLAMA_HOST` / `JARVIS_OLLAMA_URL` | `local` (machine courante) |
| `OPENROUTER_API_KEY` | `cloud` — **#2 API** |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | `cloud` (détecté, OpenRouter prioritaire) |
| `JARVIS_OPENROUTER_MODEL` | défaut `qwen/qwen3.5-flash-02-23` |
| `ELEVENLABS_API_KEY` | TTS cache + hors domicile |
| `JARVIS_FORCE_SYSTEM=1` | force mode système |

Copier `core/.env.example` → `core/.env` (gitignored).

## Layout

```
core/
├── jarvis_core/
│   ├── __main__.py
│   ├── __init__.py      # Orchestrator + WS server + table ROUTES
│   ├── bus.py           # bus d'événements (queues bornées, débounce gestuel)
│   ├── supervisor.py    # registre + heartbeat + circuit breaker + sd_notify
│   ├── policy.py        # Policy Engine (sécurité) — ≠ RatePolicy du bus
│   ├── providers.py
│   ├── locale.py
│   ├── auth/            # User Manager — SQLAlchemy (§10.1)
│   ├── db/              # PostgreSQL/SQLite + sessions + modèles
│   ├── voice/           # Voice Manager → voicebox HTTP (§3.4)
│   └── holomat/         # FaceRunner (async) + FaceEngine (CV pur) (§6.8)
├── alembic/             # Migrations Alembic
├── alembic.ini
├── data/                # jarvis.db (SQLite fallback) + users/<id>/ (gitignored)
├── dialogues/
├── requirements.txt
└── README.md
```

Sous-systèmes : `jarvis_core/auth/README.md`, `jarvis_core/voice/README.md`.

## Boot

`Orchestrator.__init__` ne fait **aucun** appel réseau et ne charge **aucun**
modèle : `serve()` accepte les connexions tout de suite, puis
`start_background()` lance les chargements lents (modèles Holomat, sonde
voicebox). Chaque brique annonce son état par `component_state` au fur et à
mesure — d'où une séquence de boot HUD réelle plutôt qu'un écran mort.

## Ajouter un type de message WS

Une ligne dans `ROUTES` (`jarvis_core/__init__.py`) + une méthode
`handle_<x>(ws, data)`. L'enveloppe d'erreur du HUD est portée par la route,
pas dupliquée dans chaque handler.

## Supervision

Le superviseur **signale, il ne redémarre pas** — systemd redémarre. Deux
superviseurs qui se battent sur la même brique, c'est pire que zéro.

- transitions seulement sur le bus (`component_state`), pas de heartbeat bavard
- 3 échecs → `degraded`, puis l'intervalle double jusqu'à 120 s : on n'inonde pas
  un service déjà connu comme mort
- `WatchdogSec=30` + `Type=notify` dans `jarvis-core.service` couvrent le Core
  qui se **fige**, cas que `Restart=on-failure` ne voit pas

État courant : `{ "type": "supervisor", "action": "status" }` (ou `"check"` pour
sonder tout de suite). `JARVIS_HERMES_URL` suffit à mettre Hermes sous
surveillance.

## Smoke tests

```bash
# Gate Phase 0 (offline, sans HUD)
python -m jarvis_core._smoke_phase0
# Gate Phase 2 (refactor post Phase 1)
python -m jarvis_core._smoke_phase2
# ou : ./deploy/scripts/core-phase0-smoke.sh

# Client WS minimal (Core doit tourner)
python tools/ws_cli.py ping
python tools/ws_cli.py holomat status

python -m jarvis_core.auth._smoke        # auth + rôles + permissions
python -m jarvis_core._smoke_bus         # back-pressure + politiques gestuelles
python -m jarvis_core._smoke_supervisor  # transitions + circuit breaker + backoff
python -m jarvis_core._smoke_auth_face   # AUTH_SMOKE : face_frame < 5s → FaceEngine
```

**Gate P1/P2 auth / Holomat** (décision 2026-08-07) :

```bash
# Linux / NUC
./deploy/scripts/auth-smoke-test.sh
# Windows (tunnel SSH :8765 → NUC si besoin)
.\deploy\scripts\auth-smoke-test.ps1
```

Chaîne : Camera → AuthScene → `face_frame` → Core → FaceEngine → `FACE_*`.
Pas de rename `holomat/` tant que ce smoke + enroll multi-profil ne sont pas verts.

Les outils voix/STT/TTS upstream vivent dans `vendor/` — appelés en HTTP comme
services, jamais copiés ici.
