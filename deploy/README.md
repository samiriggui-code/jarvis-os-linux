# Deploy

> **Prod** : Core + Hermes + HA + Postgres sur le **NUC** ; VPS = TLS + app + WSS + **Ollama #1** ;  
> chaîne LLM `Ollama VPS → OpenRouter → système` ; ProLiant Windows = Plex/NAS (pas SSH) ;  
> ElevenLabs = extérieur / cache. Guide : [`docs/INSTALLATION_DEPLOIEMENT.md`](../docs/INSTALLATION_DEPLOIEMENT.md).

- [`NUC_TREE.md`](NUC_TREE.md) — arborescence cible sur le NUC
- [`hermes/`](hermes/) — **conscience Hermes** (SOUL + skills produit, pas des mocks)
- `manifests/` — profils JSON (Setup Center)
- `systemd/` — units de référence (Core + kiosque Chromium)
- `scripts/bootstrap-nuc-tree.sh` — crée `/opt/jarvis`, `/etc/jarvis`, `/storage/jarvis`
- `scripts/sync-to-nuc.sh` — rsync `core/` (+ fronts quand prêts)
- `scripts/seed-hermes-consciousness.ps1` / `.sh` — installe SOUL/skills dans `$HERMES_HOME`

```bash
# Conscience Hermes (obligatoire pour que le cerveau applique la loi produit)
pwsh deploy/scripts/seed-hermes-consciousness.ps1 -ForceSoul
# ou : bash deploy/scripts/seed-hermes-consciousness.sh --force-soul
```

```bash
# Sur le NUC (root) — créer l'arbre
sudo bash bootstrap-nuc-tree.sh

# Depuis le PC — pousser le code
NUC_HOST=192.168.1.xx NUC_USER=root ./deploy/scripts/sync-to-nuc.sh
```

**HUD** : plus de PySide. Cible = build React servi en local + Chromium `--kiosk` (voir `jarvis-hud.service`). Tant que `hud/dist` n’existe pas, le service kiosque reste non opérationnel — normal.
