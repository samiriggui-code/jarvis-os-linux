# Core P4 — Device Manager + Agents (contrat figé)

> **Statut :** validé 2026-08-08 · milestone 2 = agent Windows + `cursor`  
> **Hors scope :** HUD React, orbe, terminal distant, filesystem, PowerShell, Android, contrôle fenêtres

## Objectif gate 1

```
Intent → Policy → CapabilityRouter → DeviceDispatch → WS → Fake Agent
  → device.execute_result → tool_event
```

Intent produit : `core.cursor` · `Owner.DEVICE` · `app_id=cursor`.

## Principes

- Extension du protocole `device.*` existant — **pas** de nouveau canal parallèle.
- `device_id` agent **stable**, persisté sur disque.
- Lien HUD ↔ agent via `metadata.machine_fingerprint`.
- Agent Windows futur : `deploy/windows-agent/` · `runtime_kind=windows_agent`.
- Milestone 1 : fake agent · `runtime_kind=fake_agent`.
- Policy Core inchangée ; agent vérifie `policy.granted`.

## Messages agent → Core

### `device.register`

```json
{
  "type": "device",
  "action": "register",
  "device_id": "pc-portable-samir-7f3a",
  "device_type": "pc_client",
  "runtime_kind": "fake_agent",
  "label": "Portable Samir (fake)",
  "device_mode": "personal",
  "bound_user_id": "",
  "metadata": {
    "platform": "windows",
    "platform_version": "10.0.26200",
    "hostname": "SAMIR-LAPTOP",
    "agent_version": "0.1.0-fake",
    "machine_fingerprint": "sha256:…",
    "session_user": "samir"
  }
}
```

Réponse : `device_registered` (existant).

### `device.capabilities`

```json
{
  "type": "device",
  "action": "capabilities",
  "device_id": "pc-portable-samir-7f3a",
  "capabilities": [
    {
      "capability_id": "app.launch",
      "value": true,
      "metadata": { "allowed_apps": ["test_app"] }
    },
    {
      "capability_id": "app.software.test_app",
      "value": true,
      "metadata": { "display_name": "Test App (fake)" }
    }
  ]
}
```

Réponse : `device_capabilities_ack` (existant).

### `device.heartbeat`

Inchangé · TTL `JARVIS_DEVICE_TTL_S` (défaut 120 s).

### `device.execute_result`

```json
{
  "type": "device.execute_result",
  "request_id": "req-uuid",
  "device_id": "pc-portable-samir-7f3a",
  "ok": true,
  "capability_id": "app.launch",
  "status": "success",
  "summary": "test_app lancé (fake)",
  "duration_ms": 5,
  "result": { "app_id": "test_app", "pid": 0, "simulated": true }
}
```

Erreurs : `error_code` ∈ `policy_denied` | `capability_unsupported` | `app_not_found` | `app_not_allowed` | `launch_failed` | `timeout` | `device_offline`.

## Messages Core → agent

### `device.execute`

```json
{
  "type": "device.execute",
  "request_id": "req-uuid",
  "device_id": "pc-portable-samir-7f3a",
  "capability_id": "app.launch",
  "intent": "core.cursor",
  "params": { "app_id": "test_app" },
  "policy": {
    "granted": true,
    "role": "admin",
    "user_id": "local",
    "risk": "media",
    "operation": "execute"
  },
  "timeout_ms": 30000
}
```

## Routage Core

| Registre | Valeur |
|----------|--------|
| `INTENT_HOST_CAPABILITY["core.cursor"]` | `app.launch` |
| `INTENT_CAPABILITY_PROVIDER["core.cursor"]` | `SATELLITE` |
| `DEVICE_INTENT_APPS["core.cursor"]` | `cursor` |

`CapabilityRouter.resolve_launch_device(ctx, app_id)` :

- Exclut `runtime_kind` ∈ `{browser, web_hud, web}`.
- Requiert `app.launch` + `app.software.{app_id}` online.
- Score : origin (+100), personal (+40), bound user (+30), **machine_fingerprint match (+50)**.

## Fichiers

| Fichier | Rôle |
|---------|------|
| `core/jarvis_core/device_dispatch.py` | Dispatch + corrélation `request_id` |
| `core/jarvis_core/ws/connection.py` | `ws_for_device` |
| `core/jarvis_core/routing/router.py` | `resolve_launch_device` |
| `core/jarvis_core/executors/device.py` | Exécutant `Owner.DEVICE` |
| `deploy/windows-agent/windows_agent.py` | Agent Windows réel |
| `deploy/windows-agent/fake_agent.py` | Agent factice (CI) |
| `core/jarvis_core/_smoke_p4_device_agent.py` | Gate E2E |

## Env

| Variable | Défaut | Note |
|----------|--------|------|
| `JARVIS_DEVICE_AGENT_ENABLED` | `1` | `Capability.available` DEVICE |
| `JARVIS_DEVICE_EXECUTE_TIMEOUT_S` | `30` | Timeout dispatch |

## Ordre implémentation (validé)

1. Ce document  
2. Fake agent  
3. DeviceDispatch + WS inverse  
4. `device.execute_result`  
5. Smoke P4  
6. Gate `cursor` (fake agent en CI, Windows agent en prod)
7. ~~Agent Windows réel~~ ✅
8. ~~`test_app` → `cursor`~~ ✅
9. ~~Inventaire logiciel complet Windows~~ ✅

## Inventaire logiciel (P4+)

L'agent Windows scanne le PC (registre Uninstall + menu Démarrer) et déclare :

| Cap | Rôle |
|-----|------|
| `system.inventory` | Métadonnées `{total_apps, launchable_apps}` |
| `app.launch` | Exécution + `allowed_apps[]` |
| `app.software.{slug}` | Une entrée par app (exe, publisher, launchable) |
| `shell.execute` | `value: false` · `planned` — terminal local futur |
| `filesystem.browse` | `value: false` · `planned` |

Refresh : au boot + toutes les 6 h (`JARVIS_INVENTORY_REFRESH_S`).

Scan local : `python windows_agent.py --scan-only`

Core :
- `devices.software` — liste inventaire agents
- `devices.list` — compte apps par device
- `device.app_launch` — lance une app matchée dans la phrase
- `match_software_app()` — résolution phrase → app_id

## Matrice câblage Core vs Hermes (cible)

| Besoin | Owner | Exécutant | Statut |
|--------|-------|-----------|--------|
| App Windows locale | DEVICE | Agent · `app.launch` | ✅ |
| Cursor (tuile) | DEVICE | Agent · `app.software.cursor` | ✅ |
| Phrase « ouvre X » | DEVICE | `device.app_launch` + inventaire | ✅ |
| Terminal NUC / VPS | HERMES | Hermes `system.shell` | ✅ existant |
| Terminal **local** Windows | DEVICE | `shell.execute` | 🔜 planned |
| Fichiers locaux PC | DEVICE | `filesystem.browse` | 🔜 planned |
| Recherche web / LLM | HERMES | Hermes toolsets | ✅ existant |
| Domotique | CORE | HA adaptateur | ✅ existant |

Règle : **local à la machine qui a le logiciel → DEVICE** ; **raisonnement / cloud / NUC → Hermes** ; **adaptateurs foyer → Core**.
