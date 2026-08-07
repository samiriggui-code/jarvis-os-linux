# État de session — JARVIS OS

> **Dernière mise à jour :** 2026-08-07  
> **À lire en premier** dans toute nouvelle conversation Claude/Cursor.  
> Runtime vérifié aligné avec le **working tree local** (hashes) ; commit = ce fichier + deploy.

---

## Topologie foyer

| Machine | IP / accès | Rôle runtime |
|---|---|---|
| **NUC** | LAN `192.168.1.37` · WAN SSH `:41222` (`jarvis-nuc-wan`) | Core + Hermes + nginx HUD · **pas** de kiosk Chromium |
| **Pi salon** | LAN `192.168.1.27` · WAN `:41223` souvent HS → **`jarvis-pi-via-nuc`** | HA + cam LG + jack + ear/cam |
| **Freebox Player** | `192.168.1.49:5555` (ADB via Pi) | Affichage apps / recherche |
| **VPS Hostinger** | `hostinger` | voicebox + Ollama (pas touché le 06/08 soir salon) |
| **Clients** | Twingate ou LAN | HUD web à la demande |

SSH Pi depuis l’extérieur : `ssh jarvis-pi-via-nuc` (`ProxyJump` NUC).

---

## Ce qui tourne (vérifié 2026-08-07)

### NUC

| Unité / chemin | État |
|---|---|
| `jarvis-core` | **active** · WS `127.0.0.1:8765` · ingest salon `127.0.0.1:8766` |
| nginx `:8080` | HUD + `/ws` + **`/v1/salon/` → :8766** |
| `/opt/jarvis/core/jarvis_core/` | `salon_ingest.py`, `salon_player.py`, `salon_speaker.py`, `__init__.py` |
| `JARVIS_SALON_SPEAKER_URL` | `http://192.168.1.27:8767` (dans `/etc/jarvis/core.env`) |
| `jarvis-hud` (kiosk) | **disabled** |

### Pi salon — deploy source : `deploy/pi-salon/`

| Unité | Port | Fichier deploy |
|---|---|---|
| `jarvis-ear` | **:8767** | `jarvis_ear.py` + `jarvis-ear.service` |
| `jarvis-cam` | **:8768** | `jarvis_cam.py` + `jarvis-cam.service` |
| HA container | **:8123** | (config `deploy/homeassistant/`) |

Install runtime Pi : `/opt/jarvis/pi-salon/` + units systemd.

`jarvis-ear` fait :
- **bouche** `POST /v1/play.json` → jack Headphones
- **oreilles** wake `hey_jarvis` → capture → Core `/v1/salon/utterance.json`
- **mains** `POST /v1/player.json` → `adb` Freebox (apps / URL)

Env Pi (service) :
- `JARVIS_CORE_SALON_URL=http://192.168.1.37:8080`
- `JARVIS_PLAYER_ADB=192.168.1.49:5555`
- `JARVIS_EAR_WAKE=1` · modèle `hey_jarvis` · seuil `0.55`

### VPS

| Conteneur | Rôle |
|---|---|
| `voicebox` | STT/TTS amont |
| `qwen-ollama` | LLM local VPS |

---

## Chaîne voix salon

```
« hey Jarvis » → wake Pi → micro → POST NUC /v1/salon/utterance.json
→ STT → handle_user_chat (Core / Hermes / Policy)
→ Netflix|YouTube|Disney|cam → POST Pi /v1/player.json → Freebox
→ TTS → POST Pi /v1/play.json → jack
```

## Freebox apps (affichage)

| App | Package / note |
|---|---|
| TV Bro | `com.phlox.tvwebbrowser` — Google / web |
| VLC | cam MJPEG `http://192.168.1.27:8768/` |
| YouTube TV / Netflix / Disney+ / Plex | déjà présents |
| Chrome | Play Store (optionnel ; sinon TV Bro) |

## HA Pi

- http://192.168.1.27:8123 · user `admin` (mdp hors git)

## Suite

- Freebox redirect WAN **41223** à rétablir (secours = via-nuc)
- Chrome / Spotify sur Player si besoin
- Zigbee / vraies commandes HA
- Token `JARVIS_SALON_TOKEN` (optionnel)
