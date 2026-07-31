# Holomat / Face — MVP Core (§6.8)

## Stack (OpenCV 5)

- **YuNet** `FaceDetectorYN` — détection
- **SFace** `FaceRecognizerSF` — embedding + cosine
- Modèles ONNX dans `holomat/data/` (opencv_zoo)

Seuil match SFace : `VERIFY_THRESHOLD = 0.363` (doc OpenCV).

## WS `type: holomat`

| Action | Effet |
|--------|--------|
| `status` | `holomat_status` |
| `face_enroll_begin` + `username` | reset buffer |
| `face_frame` + `mode` + `jpeg_b64` | `FACE_PROGRESS` / `FACE_SUCCESS` / `FACE_FAILED` |
| `face_enroll_commit` + `username` + `user_id` | `users/<id>/face_profile` + flag DB |

## HUD

`hud/src/app/bridge/faceAuthLive.ts` — frames caméra → Core.

## Retester from scratch

1. Stop Core  
2. Supprimer `core/data/jarvis_users.db` + `core/data/users/`  
3. Relancer Core (**obligatoire** après install OpenCV) + HUD  
4. First setup : face à la caméra jusqu’à 100 %  
5. Auth : même visage → unlock  

## Suite

Gestes MediaPipe · service `jarvis-holomat` séparé si besoin.
