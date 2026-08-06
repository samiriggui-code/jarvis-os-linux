---
name: hud-apps
description: >-
  Catalogue apps HUD JARVIS : Hermes commande chaque app/outil, Dashboard ADMIN
  seul, VPS allowlist (pas root libre). Charger pour ouvrir une app, ajouter un
  tool, ou exécuter docker/shell distant. CE N’EST PAS UN MOCK.
---

# Skill — Apps HUD + outils Hermes + VPS limité

## Principe

1. Le **lanceur HUD** émet une **intention** (`intent`), jamais un nom d’outil.
2. Le **Core** résout l’intention : `core/jarvis_core/capabilities.py` dit qui exécute
   et avec quel **toolset**. C’est la seule source de vérité.
3. **Policy Engine** tranche AVANT tout appel (surtout `risk: vps|admin|home`).
4. Le Core te tend alors le toolset autorisé pour CETTE session — tu ne le réclames pas.
5. Ajout d’outils = nœud **Outils** — pas d’app inventée hors catalogue sans enrollment.

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

1. Vérifier que le **toolset** existe et est activé (`GET /v1/toolsets`).
2. Ajouter la capacité dans `core/jarvis_core/capabilities.py` (intent, owner, toolset,
   risk, permission).
3. Optionnel : entrée catalogue HUD `status: surface` + `intent` correspondant.
4. Risk correct ; si VPS → allowlist + confirmation ADMIN.

## Ne pas

- Simuler un terminal root dans le HUD.
- Ouvrir Dashboard pour USER/CHILD.
- Exécuter hors Policy.
