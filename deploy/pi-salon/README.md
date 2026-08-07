# JARVIS Ear / Cam — satellite salon (Pi)

Source deploy → runtime Pi `/opt/jarvis/pi-salon/` + systemd.

Pi = oreilles + bouche + relais ADB Freebox. NUC Core = cerveau. Pas de Chromium.

## Fichiers

| Fichier | Rôle |
|---|---|
| `jarvis_ear.py` | HTTP `:8767` — play WAV, wake+STT push, player ADB |
| `jarvis-ear.service` | systemd ear |
| `jarvis_cam.py` | MJPEG `:8768` — Freebox / navigateur |
| `jarvis-cam.service` | systemd cam |
| `jarvis_device_announce.py` | **Device 2** — register/capabilities/heartbeat → Core |
| `jarvis-device-announce.service` | systemd announcer |
| `install_player_apps*.py` | sideload TV Bro / ouverture Play (one-shot) |
| `test_push_beep.py` | test bouche depuis Core |

## Bouche (Core → Pi)

```
Core tts_audio → POST http://192.168.1.27:8767/v1/play.json → aplay jack
```

NUC `/etc/jarvis/core.env` : `JARVIS_SALON_SPEAKER_URL=http://192.168.1.27:8767`

## Oreilles (Pi → Core)

Wake **`hey_jarvis`** (openWakeWord ONNX) obligatoire, puis capture :

```
POST http://192.168.1.37:8080/v1/salon/utterance.json
nginx → Core :8766 → STT → chat → TTS → jack
```

Env service : `JARVIS_CORE_SALON_URL`, `JARVIS_EAR_WAKE=1`, `JARVIS_EAR_WAKE_THRESHOLD=0.55`

## Mains Freebox (Core → Pi → ADB)

```
POST http://192.168.1.27:8767/v1/player.json
{ "action": "launch"|"view_url"|"home"|"status", ... }
→ adb 192.168.1.49:5555
```

## Caméra

http://192.168.1.27:8768/ · flux `/stream.mjpg`

## Install Pi

```bash
sudo mkdir -p /opt/jarvis/pi-salon
sudo cp jarvis_ear.py jarvis_cam.py jarvis_device_announce.py /opt/jarvis/pi-salon/
sudo cp jarvis-ear.service jarvis-cam.service jarvis-device-announce.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jarvis-ear jarvis-cam jarvis-device-announce
# wake : pip3 install --break-system-packages --no-deps openwakeword
#         + onnxruntime numpy scipy scikit-learn tqdm
#         puis download modèles hey_jarvis (root une fois)
```

## Accès SSH hors maison

`jarvis-pi-wan` (:41223) peut être HS → `ssh jarvis-pi-via-nuc` (ProxyJump NUC `:41222`).
