---
name: hud-apps
description: >-
  TRIGGER — ouvrir une app HUD, tuile admin, docker/shell VPS allowlist. Charger
  si « ouvre mission control », « terminal », « docker » explicite. Ne PAS charger
  pour chat casual, salutation, recherche web, domotique (→ Core/HA).
---

# Skill — Apps HUD + outils Hermes + VPS limité

## Principe

1. Le **lanceur HUD** émet une **intention** (`intent`), jamais un nom d'outil.
2. La **couche JARVIS** (`core/`) résout via `capabilities.py` + Policy. Domotique/TV = **HA NUC**, pas toolset HA Hermes.
3. **Policy Engine** tranche AVANT tout appel (surtout `risk: vps|admin|home`).
4. Hermes reçoit les toolsets autorisés (web, skills, vision…) — pas la maison.
5. Spec : `docs/architecture/JARVIS-Gateway-Hermes-HA.md`

⚠ Le champ `hermesTool` n’existe plus. Il nommait des outils (`home_assistant`,
`node_cerveau`, `agent_reach`) dont aucun n’existait chez toi. Il est remplacé par
`intent`, résolu côté Core.

## Catalogue (ids)

Déclaration des tuiles : `hud/src/app/apps/catalog.ts`.
Résolution intention → toolset : `core/jarvis_core/capabilities.py`.

| id | risk | notes |
|----|------|-------|
| settings, jarvis, monitor, vision | info/live | HUD local |
| hub | admin | `requestDashboard` — ADMIN seul |
| terminal, docker, code, storage | **vps** | allowlist uniquement |
| home | home | HA NUC via couche JARVIS (`home.control`) |
| music, video | media | HA `media_player` + Plex |
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

1. Vérifier que le **toolset** existe et est activé (`GET /v1/toolsets`).
2. Ajouter la capacité dans `core/jarvis_core/capabilities.py` (intent, owner, toolset,
   risk, permission).
3. Optionnel : entrée catalogue HUD `status: surface` + `intent` correspondant.
4. Risk correct ; si VPS → allowlist + confirmation ADMIN.

## Ne pas

- Simuler un terminal root dans le HUD.
- Ouvrir Dashboard pour USER/CHILD.
- Exécuter hors Policy.
