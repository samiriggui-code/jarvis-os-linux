# Core Phase 2 — multi-profil face + gate refactor

**Statut :** terminée (2026-08-08)  
**Prérequis :** [CORE_PHASE1.md](./CORE_PHASE1.md) — orchestrateur découpé, Phase 0 ALL PASS

## Objectif

Consolider le refactor Core après Phase 1 :

1. **Preuve multi-profil face** offline (cross-identify sans webcam) ✅
2. **Gate Phase 2** (`_smoke_phase2`) = Orchestrator + smokes Phase 0 ✅
3. **Auth enroll à la demande** — `enroll_member`, `face_reset_user` ✅
4. **Nettoyage mixins WS** — imports morts retirés ✅
5. **`PERIPHERAL_LINES`** → `ws/peripherals.py` ✅
6. Smokes WS live optionnels (`--ws`) si `jarvis-core` écoute

## Structure ajoutée Phase 2

```
core/jarvis_core/
├── _smoke_face_multi.py      # cross-identify 2 profils (offline)
├── _smoke_phase2.py          # gate Phase 2
└── ws/
    ├── peripherals.py        # dialogues cam/mic/audio_out
    └── handlers/             # en-têtes Phase 2, imports nettoyés
```

## Multi-profil face — état Core

### Implémenté (`holomat/face_engine.py`)

| Mécanisme | Détail |
|-----------|--------|
| Stockage | `core/data/users/<user_id>/face_profile` |
| Verify | scan tous profils → cosine → meilleur ≥ 0.88 |
| Enroll à la demande | `auth.enroll_member` — pas d'ordre imposé |

### Reporté (produit — foyer vide)

| Brique | Statut |
|--------|--------|
| Enroll webcam / 2 visages réels | **Reporté** — tests manuels au retour famille |
| Session par device / WS | **Phase 3** |
| HUD enrollment surface | **Après** Core Phase 3 |

## Validation

```bash
cd core
python -m jarvis_core._smoke_phase2
python -m jarvis_core._smoke_phase2 --ws   # optionnel

# Linux / Windows
./deploy/scripts/core-phase2-smoke.sh
.\deploy\scripts\core-phase2-smoke.ps1
```

Gate offline : **ALL PASS**.

## Actions WS Phase 2

| Action | Rôle |
|--------|------|
| `auth.enroll_member` | Compte existant ou nouveau → scan face |
| `auth.start_enrollment` | `hud_command` + pré-crée compte si `username` |
| `holomat.face_reset_user` | Efface un profil facial (pas tout le foyer) |

## Prochaine étape (Phase 3)

- Session par connexion WS / `device_id`
- `device_mode: personal|shared|gateway` + `bound_user_id`
- Découpe `intents/executors.py` + `orchestrator_lifecycle.py` (gros modules restants)
- Rename package `holomat/` si noms cibles arbitrés

## Hors scope Phase 2

- Capability Router · HUD produit · voix speaker-ID · tests enroll réels
