# Deploy

> **Prod** : Core + Hermes + HA + Postgres sur le **NUC** ; VPS = TLS + app + WSS + **Ollama #1** ;  
> chaîne LLM `Ollama VPS → OpenRouter → système` ; ProLiant Windows = Plex/NAS (pas SSH) ;  
> ElevenLabs = extérieur / cache. Guide : [`docs/INSTALLATION_DEPLOIEMENT.md`](../docs/INSTALLATION_DEPLOIEMENT.md).

- [`NUC_TREE.md`](NUC_TREE.md) — arborescence cible sur le NUC
- [`hermes/`](hermes/) — **conscience Hermes** (SOUL + skills produit, pas des mocks)
- `manifests/` — profils JSON (Setup Center)
- `systemd/` — units de référence (Core + kiosque Chromium)
- `scripts/bootstrap-nuc-tree.sh` — crée `/opt/jarvis`, `/etc/jarvis`, `/storage/jarvis`

## Sync NUC — méthode validée (2026-08-09)

**SSH** : alias `jarvis-nuc-wan` (Windows) ou `jarvis-nuc` (WSL) — **pas** `root@192.168.1.37` nu (pas de clé → hang).

| Cible | Chemin NUC | Accès public |
|-------|------------|--------------|
| Core Python | `/opt/jarvis/core/` | WS loopback `127.0.0.1:8765` |
| HUD build | `/opt/jarvis/hud/dist/` | nginx `:8080` |
| Dashboard build | `/opt/jarvis/dashboard/dist/` | nginx `/dashboard/` (si conf) |
| Service | `systemctl restart jarvis-core` | — |

**Jamais écrasé au sync** : `core/.env`, `data/*.db`, `data/users/`, `data/holomat/`.

```powershell
# Core seul (PowerShell — méthode prod)
pwsh deploy/scripts/sync-core-only-nuc.ps1

# HUD + Dashboard (après npm run build local)
pwsh deploy/scripts/sync-fronts-nuc.ps1
```

```bash
# Core seul (WSL)
NUC_SSH=jarvis-nuc ./deploy/scripts/sync-core-only-nuc.sh

# Full sync (Core + assets + dist si présents)
NUC_SSH=jarvis-nuc ./deploy/scripts/sync-to-nuc.sh
# pip sur NUC seulement si besoin explicite :
NUC_PIP=1 NUC_SSH=jarvis-nuc ./deploy/scripts/sync-to-nuc.sh
```

**Note** : `pip install -r requirements.txt` sur le NUC peut échouer (`tflite-runtime`) — le venv prod existant reste valide ; `-Pip` / `NUC_PIP=1` seulement si deps changées.

```bash
# Conscience Hermes (obligatoire pour que le cerveau applique la loi produit)
pwsh deploy/scripts/seed-hermes-consciousness.ps1 -ForceSoul
```

**HUD** : build React servi par nginx `:8080`. Kiosk Chromium (`jarvis-hud.service`) **disabled** sur NUC actuel — normal.
