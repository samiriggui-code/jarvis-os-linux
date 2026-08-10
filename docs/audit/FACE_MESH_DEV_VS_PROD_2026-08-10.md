# Diagnostic Face Mesh — DEV OK / PROD KO (2026-08-10)

> **Pas de changement d’algo Face Mesh** dans ce doc — runtime evidence only.

## 1. Build HUD servi en prod

| Élément | Valeur |
|---------|--------|
| Source produit | `hud/` (pas `vendor/hud`) |
| Build | `cd hud && npm run build` (`prebuild` → `fetch-mediapipe.mjs`) |
| Sortie | `hud/dist/` |
| Servi NUC | nginx `root /opt/jarvis/hud/dist` · `:8080` (`deploy/nginx/jarvis-hud.conf`) |
| Sync | `deploy/scripts/sync-fronts-nuc.ps1` → `/opt/jarvis/hud/dist/` |
| URL | `https://jarvis.global-it-ss.com/` (HTTPS Twingate/Caddy) ou LAN `:8080` |
| index NUC | `/opt/jarvis/hud/dist/index.html` daté **2026-08-09 22:47** |

## 2–4. Assets HUD MediaPipe (gestes ≠ Face Mesh)

Le Face Mesh **auth** ne tourne **pas** dans le navigateur.  
HUD MediaPipe = **Hand Landmarker** (`gestureLive.ts` → `/mediapipe/...`).

| Asset | Local `hud/dist` | NUC `/opt/jarvis/hud/dist` | HTTP `:8080` |
|-------|------------------|----------------------------|--------------|
| `mediapipe/hand_landmarker.task` | 7 819 105 o | présent | **200** `application/octet-stream` |
| `mediapipe/wasm/*.wasm` | ~11 Mo | présent | **200** `application/wasm` |
| `mediapipe/wasm/*.js` | ~323 Ko | présent | **200** `application/javascript` |

→ **Pas de rupture assets HUD** pour le déploiement front. Paths absolus `/mediapipe/...` OK derrière nginx root.

## 5. Face Mesh = Core (NUC), pas le HUD

Pipeline réel :

```
Caméra navigateur (getUserMedia)
  → JPEG base64 (faceAuthLive.ts)
  → WS holomat face_frame
  → Core FaceEngine (vision/face_engine.py)
  → MediaPipe Face Mesh SI AVX
  → sinon OpenCV YuNet+SFace
```

## 6. Premier point de rupture PROD (preuve)

| | DEV (smoke OK) | PROD NUC |
|--|----------------|----------|
| CPU | typ. AVX (portable) | **Intel Celeron J4005 — pas d’AVX** |
| Algo FaceEngine | `mediapipe_facemesh` | **`opencv_sface`** (fallback) |
| Si on charge MediaPipe | OK | **`FATAL ERROR: … avx … (go/sigill-fail-fast)`** — tue le process |

Journal NUC 2026-08-09 ~22:31 : boucle crash SIGILL en chargeant MediaPipe Face Mesh.  
Puis fallback OpenCV ; un moment SFace ONNX illisible, ensuite :

```
FaceEngine prêt · opencv_sface · seuil=0.363
```

## 7. Smoke (même script)

```bash
cd /opt/jarvis/core && .venv/bin/python -m jarvis_core._smoke_auth_face
```

**PROD 2026-08-10 :**

```
holomat_status face_engine=True algo=opencv_sface
[OK] face_frame reçu < 5s
[OK] FACE_PROGRESS reason=no_face (jpeg synthétique)
AUTH_SMOKE_TEST critères 4–5 : PASS
```

→ Chaîne HUD→Core→moteur **vivante**. « Pas de landmarks Face Mesh » en prod = **normal** : ce n’est plus Face Mesh, c’est SFace.

## 8. Profils biométriques

`data/users/*/face_profile` sur NUC : **taille 0** (vides) → aucun enroll facial utilisable pour verify, indépendamment du HUD.

`face_engine.py` refuse aussi un profil si `algo` ≠ moteur courant (`mediapipe_facemesh` vs `opencv_sface`) ou dim ≠ attendue (1404 vs 128).

## 9. Caméra / WASM navigateur

- WASM hand : servis correctement (voir §2).
- Face auth : pas de WASM Face Mesh côté HUD.
- Caméra : hors scope automatisé ici (HTTPS requis hors localhost) — à valider manuellement Network + console si preview noir.

## 10. Correction (ops, pas algo)

1. **Ne pas** attendre Face Mesh landmarks sur le NUC J4005.
2. Garder `JARVIS_FACE_BACKEND=opencv` (ou `auto` + `cpu_has_avx()==false`) — déjà le cas.
3. **Ré-enrôler** les visages **sur le NUC** (moteur `opencv_sface`) — profils vides aujourd’hui.
4. Smoke DEV avec Mesh ≠ preuve prod ; gate prod = `_smoke_auth_face` sur NUC (`algo=opencv_sface`).
5. HUD deploy : assets mediapipe **OK** — pas la cause Face Mesh.

## Critère E2E (quand ré-enroll fait)

Caméra HTTPS → frames JPEG → `FACE_PROGRESS` avec `face_found` → verify/`auth.login` si parcours face encore actif (sinon auth = phrase vocale, décision 2026-08-07).
