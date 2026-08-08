# Vision / Face — MVP Core (§6.8)

## Stack

- **MediaPipe Face Mesh** — 468 landmarks → embedding normalisé (neutre, inter-oculaire)
- **OpenCV** — decode JPEG uniquement
- Algo stocké : `mediapipe_facemesh` (profils v3)

Seuil match cosine : `VERIFY_THRESHOLD = 0.88`.

Les profils `opencv_sface` (v2) sont ignorés — **ré-enrôlement** requis après migration.

## WS `type: holomat`

| Action | Effet |
|--------|--------|
| `status` | `holomat_status` + `algo: mediapipe_facemesh` |
| `face_enroll_begin` + **`user_id`** | reset buffer |
| `face_frame` + `mode` + `jpeg_b64` | `FACE_*` |
| `face_enroll_commit` | `users/<id>/face_profile` |

Contrat : `docs/architecture/FACE_AUTH_CONTRACT.md`.

Tout le pipeline (detect, enroll, verify, attestation) est **dans le Core**.
Le client (HUD futur, `ws_cli`, script) n'envoie que des **JPEG** — pas de landmarks côté client.

## Dépendances

```bash
pip install mediapipe opencv-python-headless
```

Python **3.10–3.12** recommandé (roue mediapipe). Sur 3.14+, installer un venv 3.12 pour le Core si besoin.

## Tests

```bash
python -m jarvis_core.vision.smoke_face path/to/face.jpg
  python -m jarvis_core._smoke_face_webcam
  python -m jarvis_core._smoke_face_webcam --ws   # + Core WS si actif
  python tools/face_smoke_serve.py               # viewer HTML webcam + mesh
python tools/ws_cli.py face --image photo.jpg
```

## Suite

Capture caméra locale Core (sans client WS) · service `jarvis-holomat` séparé · calibration Charuco.
