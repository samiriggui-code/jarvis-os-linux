# Audit vendor — agent-swarm-main (patterns only)

> **Date :** 2026-08-08  
> **Amont :** [desplega-ai/agent-swarm](https://github.com/desplega-ai/agent-swarm) · MIT · v1.130.0  
> **Emplacement :** `vendor/agent-swarm-main/` (~67 Mo, Bun/TS, Docker)  
> **Statut :** **ne pas intégrer le runtime** — extraire les patterns ci-dessous, puis supprimer le dossier.

---

## Verdict

| Question | Réponse |
|----------|---------|
| Remplacer Core / Hermes ? | **Non** — produit entreprise (Slack→PR), stack incompatible |
| Remplacer agent Windows P4 ? | **Non** — autre problème (device tray, inventaire local) |
| Valeur pour JARVIS ? | **Patterns** mappés ci-dessous (~6/10 idées, ~2/10 runtime) |

---

## Patterns à piocher → équivalent JARVIS

### 1. HITL gates + litmus tests

**agent-swarm :** pause avant étape irréversible ; tests « capacité branchée » (eval asserte qu’un outil est câblé).

**JARVIS déjà :**

```
Intent → Policy Engine → Autorisation → Exécution
```

| Élément | Fichier / gate |
|---------|----------------|
| Policy + gravité | `core/jarvis_core/policy.py` |
| Approval HUD | `surface` `action=approval`, `ApprovalCard` |
| Refus tracé (pas succès silencieux) | `core/jarvis_core/surface.py`, `IntentExecutor` |
| Gate « capacité branchée » | `_smoke_p4_device_agent`, `_smoke_phase6`, `deploy/scripts/core-phase*-smoke.*` |

**JARVIS implémenté (2026-08-08) :**

- [x] **Litmus par capability** — `core/jarvis_core/litmus.py` + `python -m jarvis_core._smoke_litmus`
- [ ] Gate irréversible explicite (domotique critique, shell device…)

**Ne pas copier :** leur UI dashboard d’approbation — le HUD glass portera le HITL.

---

### 2. Workflows DAG (foreach, retries, approbations)

**agent-swarm :** moteur DAG, fan-out `foreach`, rejoin, retries, nœuds avec gate humain.

**JARVIS déjà :**

| Élément | Fichier |
|---------|---------|
| Missions longues | `core/jarvis_core/missions/store.py` |
| Mission DEV + kanban Hermes | `core/jarvis_core/mission_dev/kanban.py` |
| Tool events / timeline | `core/jarvis_core/tool_events.py` |
| Séquences auth/boot | `core/jarvis_core/sequences.py` |

**À renforcer (backlog) :**

- [x] **Mission = DAG léger** : étapes typées + `depends_on` — `missions/drain.py` + `MissionStore.start_drain`.
- [ ] **Retry policy** par étape (max 3, backoff) — aujourd’hui retry ad hoc dans agent WS reconnect.
- [ ] **foreach** reporté : liste de devices / pièces HA → N exécutions corrélées (Phase 6+).

**Ne pas copier :** leur SQLite workflow engine ni le dashboard workflow editor.

---

### 3. Eval harness (scénarios × checks + juge optionnel)

**agent-swarm :** matrice scénario × harness, artefacts, checks déterministes + juge LLM.

**JARVIS déjà :**

| Gate | Prouve |
|------|--------|
| `_smoke_phase0` … `_smoke_phase6` | phases Core |
| `_smoke_p4_device_agent` | Intent → Device → tool_event |
| `_smoke_p4_windows_apps` | inventaire agent |
| `deploy/scripts/core-phase*-smoke.ps1` | CI / NUC |

**À renforcer (backlog) :**

- [x] **Catalogue evals** : `docs/audit/EVAL_MATRIX.md` — généré depuis `litmus.py` (`python -m jarvis_core.eval_matrix`).
- [ ] **Juge LLM optionnel** : réservé aux intents flous (composer), jamais sur le chemin Policy/execute.
- [ ] **Artefacts** : dumps WS (`tool_event`, `surface_result`) dans `/tmp` ou CI artifact — inspiré de leurs transcripts E2B.

**Ne pas copier :** stack E2B / Docker eval workers.

---

### 4. Drain loop (1 ticket → chaîne reviewable)

**agent-swarm :** un ticket entrant déclenche une **chaîne** de sous-livrables reviewables (PRs, pages), pas un one-shot.

**JARVIS déjà :**

- Hermes délègue tâches dev (`bridge.ask`, skills kanban).
- `tool_event` `started` / `completed` par outil.

**À renforcer (backlog) :**

- [x] **Mission dev = drain** : `MissionStore` + étapes corrélées `tool_event_id` — smoke `_smoke_drain`.
- [x] **État mission** : `open | running | blocked_hitl | done | failed` dans `missions/store`.
- [ ] **Reprise** : après reboot Core, mission `running` reprend ou passe `blocked`.

**Ne pas copier :** leur modèle Slack thread tree / pages HTML agents.

---

### 5. MCP + scripts-only mode (réduction bruit outils)

**agent-swarm :** mode « code-mode » : surface MCP réduite, SDK via `script-run`.

**JARVIS déjà :**

| Élément | Fichier |
|---------|---------|
| Intents produit (peu, stables) | `core/jarvis_core/capabilities.py` |
| Routing host | `core/jarvis_core/capability_router.py`, `routing/router.py` |
| Owner DEVICE / HERMES / CORE | `Owner` enum + mappings |

**À renforcer (backlog) :**

- [x] **Tier outils Hermes** : `JARVIS_HERMES_SKILLS_ONLY` + `capabilities._apply_hermes_slim()` — smoke `_smoke_hermes_slim`.
- [ ] **CapabilityRouter** : le LLM ne voit que les intents `available=True` du device/session courant — déjà partiel, documenter contrat.
- [ ] **Script bundle device** : agent Windows expose `app.launch` + futur `shell.execute` — pas 200 `app.software.*` dans le prompt LLM ( résolution côté Core via `device_software.match`).

**Ne pas copier :** leur MCP server monolithique ni le CLI `agent-swarm x`.

---

## Matrice récap

| Pattern agent-swarm | Priorité JARVIS | Où vivre | Runtime agent-swarm |
|--------------------|-----------------|----------|---------------------|
| HITL + litmus | **P0** (déjà partiel) | Policy + smokes | Non |
| Workflow DAG | **P2** | `missions/` | Non |
| Eval harness | **P1** | `_smoke_*` + scripts deploy | Non |
| Drain loop | **P2** | Hermes + `mission_dev` | Non |
| Scripts-only / MCP slim | **P1** | CapabilityRouter + Hermes config | Non |

---

## Action vendor

1. Ce doc = **extraction terminée** pour agent-swarm-main.
2. **Supprimer** `vendor/agent-swarm-main/` quand Samir valide (67 Mo, aucun import produit).
3. Ne pas ajouter de `.pth`, alias Vite, ni service systemd vers ce dossier.

---

## Références JARVIS existantes

- `docs/architecture/JARVIS-Agentic-UI.md` §7 Policy / HITL
- `docs/AGENTIC_UI_VENDOR_BRIEF.md` — eve-analyst sandbox + evals
- `docs/audit/CORE_P4_DEVICES.md` — gate device E2E
- `vendor/README.md` — règle vendor = matière à lire, pas runtime
