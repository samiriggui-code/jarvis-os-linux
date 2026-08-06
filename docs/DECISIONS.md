# Décisions validées — JARVIS OS

> **Ne pas réouvrir** sans demande explicite de Samir.  
> Décisions ouvertes → [`TODO.md`](TODO.md) §Décisions ouvertes.

---

## Sécurité & auth

| Date | Décision |
|------|----------|
| 2026-08 | Le Core **ne fait pas confiance** à une identité envoyée par le HUD |
| 2026-08 | La voix **n'est pas** un facteur d'authentification |
| 2026-08 | Contournements dev **retirés** de la prod |
| 2026-08 | Gravité d'une action **dérivée côté Core** (`gravity_for`), jamais reçue du client |
| 2026-08 | Chaîne complète : approbation → **IntentExecutor** exécute l'intention |

## Agentic UI

| Date | Décision |
|------|----------|
| 2026-08-04 | Contrat [`architecture/JARVIS-Agentic-UI.md`](architecture/JARVIS-Agentic-UI.md) = **source de vérité** |
| 2026-08 | Pas de JSX généré ; catalogue `ui_catalog.json` ; admission côté Core |
| 2026-08 | `composer.py` appelle `providers.complete()` — pas Hermes directement (Provider Manager = passage unique LLM) |
| 2026-08 | Plancher de confiance sur les compositions LLM (question hors-sujet → refus) |
| 2026-08 | P2 **avant** P3 — garde-fou avant composition agentique |

## Déploiement & vendor

| Date | Décision |
|------|----------|
| 2026-08 | Agent-Reach **épinglé** dans `core/requirements.txt` (commit GitHub, pas PyPI) |
| 2026-08 | hermes-agent sur NUC = **clone git amont**, pas copie `vendor/` |
| 2026-08 | voicebox sur VPS = docker-compose amont |
| 2026-08 | `vendor/` = sas temporaire ; Agent-Reach dispatché ; CopilotKit supprimé |
| 2026-08 | Core + HUD tournent sur **portable en dev** ; NUC = Hermes + PG seulement |

## Infra réseau

| Date | Décision |
|------|----------|
| longtemps | IP WAN Freebox **fixe** : `82.66.254.106` |
| 2026-08 | NUC WAN SSH port **41222**, clé `jarvis_nuc_ed25519` |
| 2026-08 | Pi salon WAN SSH port **41223**, clé `jarvis_pi_salon_ed25519`, user `pi` |
| 2026-08 | PostgreSQL tunnel local **5433** (pas 5432 — conflit Laragon) |
| 2026-08 | Tout en loopback sur chaque machine ; tunnels = prod, pas bricolage |

## Télémétrie

| Date | Décision |
|------|----------|
| 2026-08 | `record_event` async, file bornée 512, fil unique d'écriture — **hors chemin critique voix** |

## Gestes

| Date | Décision |
|------|----------|
| 2026-08-05 | Pilotage gestuel **désactivé par défaut** (`?gestures=1` ou localStorage) |
