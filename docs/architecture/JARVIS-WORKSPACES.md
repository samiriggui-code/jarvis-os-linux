# JARVIS — Convention workspaces Mission DEV

Document mis à jour le 2026-08-15 (V2 device-resolved).  
Sources : `core/jarvis_core/workspace/conventions.py`, `deploy/windows-agent/workspace_local.py`.

## Rôles des machines

| Machine | Rôle |
|---------|------|
| **Portable (Laragon)** | Source DEV autoritaire — Git, Claude, Cursor, Mission DEV, tests, Verification |
| **NUC `/opt/jarvis/...`** | Runtime prod uniquement — Core, Hermes, HUD, services. **Pas** workspace DEV |

Le passage DEV → PROD reste un chantier de déploiement séparé.

## V2 — Découplage Core / Device (priorité architecturale)

**Le Core/NUC ne doit pas dépendre de chemins Windows.**

| Couche | Sait quoi |
|--------|-----------|
| **Core / NUC** | `workspace_id` + `authoritative_device_id` |
| **Windows Agent** | mapping local `workspace_id` → chemin physique |
| **Claude / Cursor** | reçoivent `workspace_id` ; le cwd est résolu **sur le device** |

```
Mission DEV
    ↓
Core : jarvis-main → authoritative_device = pc-33a88e343339
    ↓  (pas de C:\... dans le message WS)
Windows Agent : workspace_bindings.json / JARVIS_MAIN_LOCAL_PATH
    ↓
cwd local → Claude + Cursor
```

### V2 jarvis-main (cible NUC)

```env
# /etc/jarvis/core.env — NUC uniquement
JARVIS_MAIN_DEVICE_ID=pc-33a88e343339
```

`local_path` Core = **vide** (`device-resolved`). Pas de `JARVIS_WORKSPACE_ROOT` ni `JARVIS_MAIN_LOCAL_PATH` sur le NUC.

### Windows Agent (portable)

```env
# %ProgramData%\JARVIS\agent.env
JARVIS_WORKSPACE_ROOT=C:\laragon\www
JARVIS_MAIN_LOCAL_PATH=C:\laragon\www\jarvis-os-linux
```

Mapping persisté : `%ProgramData%\JARVIS\workspace_bindings.json`

Auto-détection au 1er boot si `jarvis-main` absent : scan Git sous `JARVIS_WORKSPACE_ROOT` (présence `core/jarvis_core/`).

### Migration nouveau PC

1. Installer Windows Agent
2. Configurer `JARVIS_WORKSPACE_ROOT` + `JARVIS_MAIN_LOCAL_PATH` (ex. `D:\Dev\jarvis-os-linux`)
3. Vérifier Claude/Cursor CLI
4. Register au Core
5. Mettre à jour `JARVIS_MAIN_DEVICE_ID` sur le Core → nouveau `device_id`
6. Mission DEV fonctionne **sans modifier le code Python Core**

### V1 compat (temporaire)

Si le Core tourne **sur la même machine** que le repo (smokes, dev local) :

```env
JARVIS_WORKSPACE_LEGACY_CORE_PATH=1
JARVIS_MAIN_LOCAL_PATH=C:\laragon\www\jarvis-os-linux
```

Le Core stocke alors le chemin en DB — **à éviter en prod NUC**.

## Arborescence Laragon (exemple portable actuel)

```
C:\laragon\www\
├── jarvis-os-linux\          ← jarvis-main (aujourd'hui)
│   ├── core\
│   ├── vendor\
│   └── .git\
├── projet-independent-A\
└── projet-independent-B\
```

Demain sur un autre PC : `D:\Dev\jarvis-os-linux` — même `workspace_id`, chemin différent côté agent.

## WorkspaceRegistry (unique)

Champs : `workspace_id`, `authoritative_device_id`, `local_path`, `repo_name`, `sync_mode`, `project_id`

| `local_path` Core | Signification |
|-------------------|---------------|
| vide | V2 — résolu sur le device autoritaire |
| chemin absolu | V1 compat — hint Core (legacy) |

Catégories logiques via `classify_workspace_id()` :

| ID pattern | Catégorie | Résolution chemin |
|------------|-----------|-------------------|
| `jarvis-main` | JARVIS_MAIN | Agent : racine Git JARVIS |
| `jarvis-vendor-*` | JARVIS_VENDOR | Agent : `<jarvis-main>/vendor/...` |
| autre | INDEPENDENT | Agent : `<JARVIS_WORKSPACE_ROOT>/<id>` |

## Git safety (repo dirty)

Le Windows Agent compare **porcelain AVANT vs APRÈS** chaque run.  
Les ~267 lignes dirty préexistantes ne sont **pas** attribuées à Claude/Cursor — seul le **delta** compte dans `files_changed`.

Interdit côté agent : `git reset`, `git clean`, `git stash`, auto-commit.

## Sécurité chemins

1. **Core** — `validate_local_path()` si `local_path` non vide à l'enregistrement
2. **Windows Agent** — `validate_workspace_local_path()` vs `JARVIS_WORKSPACE_ROOT`

## Policy

Workspace authorization ≠ Policy authorization.

## Futur Capability Discovery (NON IMPLÉMENTÉ)

Voir version précédente — pas d'auto-modification prod.

## Boot Core

Si `JARVIS_MAIN_DEVICE_ID` est défini, `ensure_jarvis_main()` enregistre `jarvis-main` en **V2 device-resolved** par défaut.

Les smokes enregistrent manuellement avec chemin explicite (V1 en mémoire).
