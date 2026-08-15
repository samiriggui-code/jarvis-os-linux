# Agent Control Plane — patterns (idées only)

> **Source :** [shannhk/hermes-agent-control-room](https://github.com/shannhk/hermes-agent-control-room)  
> **Statut :** idées prises 2026-08-11 — **pas** de runtime multi-Hermes, **pas** de task bus fichiers comme bus produit.  
> **Aligné :** Core = chef d’orchestre (`JARVIS-VISION-ORCHESTRATION.md`). Hermes = agent #1.

## Prendre

### 1. Templates par agent

Pour chaque runtime agent (aujourd’hui surtout Hermes NUC) :

| Fiche | Contenu |
|-------|---------|
| `inventory` | rôle, hôte, ports, exposition, dépendances |
| `docker` / unit | image, compose/systemd, volumes |
| `env-map` | variables **noms seulement** (jamais secrets) |
| `runbook` | start/stop, health, diag, rollback |
| `backup` | quoi sauver, où, hors secrets |

Cible future : `deploy/hermes/agents/<name>/` ou registre Core — **pas** `/root/agent-control-room` comme front door.

### 2. Progression manuel → automate

```
manuel prouvé → runbook → cron / Mission → automate
```

Aligné Mission Control : pas de Level 4 (équipe auto) tant que le flux manuel + verify Core ne tiennent pas.

### 3. Checklist sécurité

- Ports : loopback / tunnel, pas d’exposition large par défaut  
- Secrets hors git (`.env` machine, pas vendor)  
- Scope clés (API / SSH) minimal  
- Dashboards / SSH / Docker audit périodique  

Complète Policy Engine ; ne la remplace pas.

### 4. Registry agents documenté

Liste : nom, rôle, endpoint, toolsets, risque, owner.  
Prépare « Agent Registry plus tard » (`DECISIONS` Device / Tool Bus) — **document + Core**, pas un second Hermes orchestrateur.

### 5. Control plane docs ≠ runtime data

| Control plane | Runtime |
|---------------|---------|
| Docs, inventaires, runbooks, maps | État live, sessions, mémoire, logs, `.env` |

Chez JARVIS : `docs/` + `deploy/` = control plane ; `/opt/jarvis/…`, `core/data/`, venvs = runtime.

## Refuser

| Idée Control Room | Pourquoi |
|-------------------|----------|
| `hermes-orchestrator` front door | Core orchestre déjà |
| Multi-conteneurs Hermes seo/dev/cmo | 1 Hermes + toolsets / skills |
| Task bus `/srv/agent-bus` fichiers | Tool Bus / SSE / Mission |
| Bootstrap Hetzner comme topo foyer | NUC / Pi / VPS déjà figés |

## Prochaine action (quand ouvert)

1. Fiche `inventory` + `runbook` pour Hermes NUC (seul agent #1).  
2. Étendre le registre quand Device Router / multi-agents Mission s’ouvrent.
