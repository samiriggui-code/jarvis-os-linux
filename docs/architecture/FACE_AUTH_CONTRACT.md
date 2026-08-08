# Contrat Face / Auth (figé 2026-08-07)

> Source de vérité WS + machine d’états.  
> Hors scope : YuNet / SFace / ONNX / grab caméra bas niveau.  
> Holomat (produit) = interaction / viz / gestes — **pas** le conteneur auth.

## Machine d’états

```
IDLE → AUTH_REQUIRED → VERIFYING → AUTHENTICATED
                 ↘ ENROLLING → AUTH_REQUIRED
```

| État | Qui | Condition |
|------|-----|-----------|
| `IDLE` | HUD sans gate | — |
| `AUTH_REQUIRED` | Gate IDENTIFY/INSTALL | pas de session Core valide |
| `ENROLLING` | FirstSetup / enroll membre | `user_id` SQL déjà créé |
| `VERIFYING` | AuthScene / LockScene | boucle `face_frame` verify |
| `AUTHENTICATED` | session Core + HUD | `auth.login` OK |

**Règle session :** un refresh HUD repart en `AUTH_REQUIRED` (sauf bypass dev). Soft-lock → LockScene (`sessionWasUnlocked`).

**Gesture :** uniquement en `AUTHENTICATED` (GestureBridge).

---

## Identité

| Champ | Rôle |
|-------|------|
| `user_id` | **Clé unique** buffer enroll + fichier `face_profile` + login |
| `username` | Slug SQL (label) — jamais clé biométrique seule |
| `display_name` | UI |

Slug HUD : minuscules, espaces → `_`, max 24.

Fichier : `core/data/users/<user_id>/face_profile` (JSON v2, moyenne 8 samples, seuil 0.363).

---

## ENROLL (ordre imposé)

```
1. auth.enroll          → { user_id, username }
2. face_enroll_begin    → { user_id, username? }
3. face_frame × N       → mode=enroll, user_id, jpeg_b64
4. FACE_SUCCESS         → mode=enroll (buffer plein) — PAS d’attest, PAS de login
5. face_enroll_commit   → { user_id, username? }
6. face_enroll_commit_result { ok }
7. mark_biometrics(face=true)
```

### Payloads

**`face_enroll_begin`**
```json
{ "type": "holomat", "action": "face_enroll_begin", "user_id": "<uuid>", "username": "<slug>" }
```
Réponse : `FACE_PROGRESS` progress=0 **ou** `holomat_error`.

**`face_frame` enroll**
```json
{ "type": "holomat", "action": "face_frame", "mode": "enroll", "user_id": "<uuid>", "username": "<slug>", "jpeg_b64": "..." }
```
Réponse : `FACE_PROGRESS` | `FACE_SUCCESS` (mode enroll) | `holomat_error`.

**`face_enroll_commit`**
```json
{ "type": "holomat", "action": "face_enroll_commit", "user_id": "<uuid>", "username": "<slug>" }
```
Réponse : **toujours** `face_enroll_commit_result` `{ ok, error?, path?, samples? }`.

### Signaux séquence (enrollment)

| Événement FaceEngine | Signal |
|----------------------|--------|
| sample accepté (`face_found` + PROGRESS) | `face.landmarks` |
| commit OK | `face.model` |

---

## VERIFY (ordre imposé)

```
1. face_frame           → mode=verify, jpeg_b64
2. FACE_SUCCESS         → user_id + username + confidence
3. Core attest_biometric(user_id, face)   // TTL 120s — seul endroit
4. auth.login           → { user_id, method: "face", confidence }
5. auth_login_result ok → unlockSession HUD
```

**`face_frame` verify**
```json
{ "type": "holomat", "action": "face_frame", "mode": "verify", "jpeg_b64": "..." }
```
Filtres optionnels `user_id` / `username` ; si trop strict → fallback tous profils disque.

`FACE_FAILED` `reason=no_profile` → offrir enroll (gate admin si users > 0).

Signal séquence : `face.matched` uniquement sur `FACE_SUCCESS` + `user_id`.

---

## Interdits

- Login face sans attestation Core (sauf PIN / `JARVIS_AUTH_ALLOW_UNVERIFIED`)
- Buffer enroll indexé par display name
- `auth.enroll` **après** les frames (trop tard pour `user_id`)
- Deux implémentations enroll divergentes (FaceCamPanel vs `runFaceEnrollLive` doivent partager le contrat `user_id`)
- Gesture pendant ENROLLING / VERIFYING

---

## Fichiers d’implémentation

Voir `docs/DECISIONS.md` (entrée 2026-08-07 Face Auth contract) + rapport session.
