---
name: hud-apps
description: >-
  Catalogue apps HUD JARVIS : Hermes commande chaque app/outil, Dashboard ADMIN
  seul, VPS allowlist (pas root libre). Charger pour ouvrir une app, ajouter un
  tool, ou exécuter docker/shell distant. CE N’EST PAS UN MOCK.
---

# Skill — Apps HUD + outils Hermes + VPS limité

## Principe

1. Le **lanceur HUD** ouvre une **surface** (fenêtre).
2. **Hermes** exécute l’outil (`hermesTool`) déclaré dans le catalogue.
3. **Policy Engine** tranche (surtout `risk: vps|admin|home`).
4. Ajout d’outils = nœud **Outils** / `tool_manager` — pas d’app inventée hors catalogue sans enrollment.

## Catalogue (ids)

Voir monorepo `hud/src/app/apps/catalog.ts` → `hermesAppsManifest()`.

| id | risk | notes |
|----|------|-------|
| settings, jarvis, monitor, vision | info/live | HUD local |
| hub | admin | `requestDashboard` — ADMIN seul |
| terminal, docker, code, storage | **vps** | allowlist uniquement |
| home | home | Home Assistant |
| music, video | media | média |
| outils, skills | info | **ajouter tools ici** |
| reach | info | Agent-Reach Internet — Dashboard `#/reach` pour param |
| mail, calendar | soon | pas encore |

## VPS allowlist (obligatoire)

Autorisé (exemples) :
- `systemctl status jarvis-*`
- `journalctl -u jarvis-* -n 50`
- `docker ps` / `docker logs --tail 100` / restart **services allowlist**
- chemins : `/opt/jarvis`, `/storage/jarvis`, `/etc/jarvis`

Interdit : root libre, `rm -rf /`, reboot/shutdown, passwd, iptables flush, pipe curl|bash.

Services docker restartables : `jarvis-core`, `jarvis-hud`, `ollama`, `homeassistant`, `plex`.

## Voice

Commandes : « Jarvis ouvre terminal » / « Jarvis ouvre musique » / « Jarvis cherche … » (app Internet)…
Préfixe Jarvis obligatoire (skill jarvis-os / SOUL).

## Ajouter un outil

1. Déclarer dans Hermes Tool Manager (`outils`).
2. Optionnel : entrée catalogue HUD `status: hermes` + `hermesTool`.
3. Risk correct ; si VPS → allowlist + confirmation ADMIN.

## Ne pas

- Simuler un terminal root dans le HUD.
- Ouvrir Dashboard pour USER/CHILD.
- Exécuter hors Policy.
