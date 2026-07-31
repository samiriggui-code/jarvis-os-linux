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
