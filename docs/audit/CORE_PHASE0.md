# Core Phase 0 — gate avant refactor

> **Date :** 2026-08-08  
> Objectif : Core testable **sans HUD**, auth multi-profil validée, smokes verts.

---

## Checklist Phase 0

| # | Item | Commande / artefact | Statut |
|---|------|---------------------|--------|
| 1 | Device registry P0–P2 | `_smoke_devices` | ✅ |
| 2 | Auth login sécurisé (pas de user_id client) | `auth._smoke_login` | ✅ |
| 3 | Auth multi-profil (ADMIN → USER) | `_smoke_auth_multi` | ✅ |
| 4 | Face pipeline WS (si Core up) | `_smoke_auth_face` | requiert Core |
| 5 | Policy + HITL | `_smoke_p2` | ✅ |
| 6 | Capabilities + surface | `_smoke_capabilities`, `_smoke_p3`, `_smoke_surface_decision` | ✅ |
| 7 | Tool events / Hermes | `_smoke_tool_events`, `_smoke_hermes_events` | ✅ |
| 8 | Client WS sans HUD | `core/tools/ws_cli.py` | ✅ |
| 9 | Orchestrateur Phase 0 | `_smoke_phase0` | ✅ |

**Bloque Phase 1 (extraction `__init__.py`)** : item 9 ALL PASS offline.

**Bloque rename `holomat/`** : items 3 + 4 + enroll produit multi-profil manuel.

---

## Lancer Phase 0

```bash
# Offline (venv dans core/)
cd core
python -m jarvis_core._smoke_phase0

# Linux script
./deploy/scripts/core-phase0-smoke.sh

# Windows
.\deploy\scripts\core-phase0-smoke.ps1

# + smokes WS (Core doit tourner sur :8765)
python -m jarvis_core._smoke_phase0 --ws
./deploy/scripts/core-phase0-smoke.sh --ws
```

---

## ws_cli — tester sans HUD

```bash
cd core
python tools/ws_cli.py ping
python tools/ws_cli.py auth status
python tools/ws_cli.py holomat status
python tools/ws_cli.py face verify
python tools/ws_cli.py chat "quels outils as-tu"
python tools/ws_cli.py supervisor status
python tools/ws_cli.py usage
python tools/ws_cli.py reach
```

Env : `JARVIS_CORE_WS=ws://127.0.0.1:8765` (tunnel NUC possible).

---

## Auth multi-profil (détail)

`_smoke_auth_multi` vérifie :

1. `first_run` → 1er compte **ADMIN**
2. 2e et 3e comptes → **USER**
3. `attest_biometric` + `login` + `logout` par utilisateur
4. Attestation non transférable entre profils

**Face optionnel** (même photo ou webcam) :

```bash
JARVIS_SMOKE_FACE_IMAGE=C:\photos\samir.jpg python -m jarvis_core._smoke_auth_multi
python -m jarvis_core._smoke_auth_multi --webcam
```

Enroll ×2 + verify → doit identifier l'un des deux profils.

---

## Prochaine étape (Phase 1)

Quand Phase 0 est vert :

1. Extraire `chat_handler.py` + `intents/executors.py` depuis `__init__.py`
2. Re-lancer `_smoke_phase0` après chaque extraction
3. Ne pas toucher Capability Router / HUD avant multi-profil produit validé

---

*Voir aussi : `docs/audit/VENDOR_BOUNDARY_AUDIT.md` · `docs/architecture/FACE_AUTH_CONTRACT.md`*
