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
│   ├── bin/                       # jarvis-hud, jarvis-core, jarvis-hermes
│   ├── hermes-agent/              # install vendor Hermes (venv + CLI)
│   └── share/                     # Assets (orbe, fonts, sons…)
│
├── etc/jarvis/
│   ├── config.yaml
│   ├── hardware.yaml
│   ├── modules.yaml
│   ├── manifest.json
│   ├── secrets.env                # chmod 600
│   ├── hermes.env                 # API_SERVER_* — chmod 600
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
│   ├── devices/
│   └── hermes/                    # HERMES_HOME (SOUL, skills, config)
│
└── etc/systemd/system/
    ├── jarvis-core.service
    ├── jarvis-hud.service         # Chromium kiosk (pas Qt)
    ├── jarvis-hermes.service      # Alias: hermes-agent.service
    ├── jarvis-voicebox.service
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
| 8766 | Core salon ingest (HTTP loopback) | `jarvis-core` · nginx `/v1/salon/` |
| 17600 | voicebox (TTS/STT) | `jarvis-voicebox.service` (ou tunnel VPS) |

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
| `deploy/pi-salon/` | **Pi** `/opt/jarvis/pi-salon/` (pas sur le NUC) |
| ~~`vendor/agents/hermes-agent/`~~ | **rien à déployer** — voir ci-dessous |
| `vendor/**` (reste) | **ne pas déployer** : références de lecture uniquement |

⚠ Ce tableau annonçait un `rsync` de `vendor/agents/hermes-agent` vers
`/opt/jarvis/hermes-agent`. **Ce rsync n'a jamais existé dans aucun script.**
Constaté sur le NUC le 2026-08-05 : `/opt/jarvis/hermes-agent` est un **clone git**
de `NousResearch/hermes-agent` (commit `f5be923`), avec son propre `.venv` et le
binaire `hermes` — installé à la main, pas synchronisé depuis le dépôt.

C'est d'ailleurs le bon modèle, le même que voicebox sur le VPS : **l'amont est
cloné sur la machine cible**. La copie sous `vendor/` a donc été supprimée.
Pour réinstaller ailleurs :

```bash
git clone https://github.com/NousResearch/hermes-agent /opt/jarvis/hermes-agent
cd /opt/jarvis/hermes-agent && git checkout f5be923
python3 -m venv .venv && .venv/bin/pip install -e .
```

## Services

```
jarvis.target
 ├── jarvis-core.service       # WS :8765
 ├── jarvis-hud.service        # Chromium --kiosk $JARVIS_HUD_URL
 ├── jarvis-voicebox.service   # TTS/STT :17600 (Wants, pas Requires)
 └── jarvis-hermes.service     # HTTP :8642 — alias hermes-agent.service
```

## Créer l’arbre

```bash
sudo bash deploy/scripts/bootstrap-nuc-tree.sh
./deploy/scripts/sync-to-nuc.sh
```
