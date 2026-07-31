# Arborescence NUC — JARVIS OS

Cible de déploiement (indépendante du monorepo Windows).  
Base OS : Ubuntu **ou** CachyOS — peu importe.

## Vue d’ensemble

```
/
├── opt/jarvis/
│   ├── hud/                       # build React (dist/) — quand prêt
│   ├── dashboard/                 # build React (dist/) — quand prêt
│   ├── core/                      # Orchestrateur
│   ├── setup/                     # Setup Center (optionnel hors kiosque)
│   ├── bin/                       # jarvis-hud (Chromium kiosk), jarvis-core
│   └── share/                     # Assets (orbe, fonts, sons…)
│
├── etc/jarvis/
│   ├── config.yaml
│   ├── hardware.yaml
│   ├── modules.yaml
│   ├── manifest.json
│   ├── secrets.env                # chmod 600
│   └── systemd/
│
├── storage/jarvis/
│   ├── models/
│   ├── backups/
│   ├── logs/
│   ├── media/
│   └── cache/
│
├── var/lib/jarvis/
│   ├── state/
│   └── devices/
│
└── etc/systemd/system/
    ├── jarvis-core.service
    ├── jarvis-hud.service         # Chromium kiosk (pas Qt)
    └── jarvis.target
```

## Ports

Tout écoute sur **127.0.0.1**, jamais `0.0.0.0` : l'accès extérieur passe par
le tunnel sortant NUC → VPS, et rien n'est exposé sur le réseau local.

| Port | Service | Servi par |
|------|---------|-----------|
| 8080 | **HUD** (build React) | nginx — `deploy/nginx/jarvis-hud.conf` |
| 8081 | Dashboard | *réservé — front non finalisé* |
| 8082 | Setup Center | *réservé — front non finalisé* |
| 8642 | Hermes | `JARVIS_HERMES_URL` |
| 8765 | Core WebSocket | `jarvis-core.service` |
| 17600 | voicebox (TTS/STT) | `jarvis-voicebox.service` |

8080 figurait dans `jarvis-hud.service` depuis le début, mais **personne ne
servait ce port** : Chromium démarrait sur « connexion refusée ». `file://`
n'est pas une solution de repli — Chromium bloque les modules ES chargés
ainsi, et le build Vite en produit.

## Mapping monorepo → NUC

| Repo (PC) | NUC |
|-----------|-----|
| `core/` | `/opt/jarvis/core/` |
| `setup/` | `/opt/jarvis/setup/` |
| futur `hud/dist` | `/opt/jarvis/hud/dist/` |
| futur `dashboard/dist` | `/opt/jarvis/dashboard/dist/` |
| `assets/` | `/opt/jarvis/share/` (copie) |
| `deploy/manifests/*.json` | `/etc/jarvis/manifest.json` |
| `vendor/**` | **ne pas déployer** (sauf builds issus de figma* une fois promu) |

## Services

```
jarvis.target
 ├── jarvis-core.service     # WS :8765
 └── jarvis-hud.service      # Chromium --kiosk $JARVIS_HUD_URL
```

## Créer l’arbre

```bash
sudo bash deploy/scripts/bootstrap-nuc-tree.sh
./deploy/scripts/sync-to-nuc.sh
```
