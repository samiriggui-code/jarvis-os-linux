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

`hud/src/app/bridge/faceAuthLive.ts` — frames caméra **du device** → Core.

Holomat (Core) = moteur partagé. La webcam est un périphérique **par appareil**
(NUC kiosk, laptop, tablette). Un client sans caméra ne dégrade pas Holomat
pour les autres.

## Retester from scratch

1. Stop Core  
2. Supprimer `core/data/jarvis_users.db` + `core/data/users/`  
3. Relancer Core (**obligatoire** après install OpenCV) + HUD  
4. First setup : face à la caméra jusqu’à 100 %  
5. Auth : même visage → unlock  

## Gestes

Faits, mais **hors de ce module** : MediaPipe tourne dans le HUD
(`hud/src/app/bridge/gestureLive.ts`), pas ici — le Core est en Python 3.14
où la roue `mediapipe` n'existe pas, et Chromium tient déjà la caméra.

Chaîne : HUD mesure des confidences → `type: gesture` → `bus.py`
discrétise (EDGE / hystérésis / cooldown) → `gestures.py` résout contre
`gesture_profile.bindings` → `GESTURE_DETECTED` → HUD exécute.

Assets : `cd hud && npm run mediapipe` (~19 Mo, hors git).
Test : `python -m jarvis_core._smoke_gestures`.

## Suite

Service `jarvis-holomat` séparé si besoin. La projection sur table (homographie
Charuco, `M.npy`, `calibration.json`) reste **non développée** — sans
vidéoprojecteur elle n'a pas d'objet, et la route `holomat_calibrate_start`
est encore un stub.
