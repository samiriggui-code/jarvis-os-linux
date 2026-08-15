# Changelog — JARVIS Windows Agent

Format : `MAJOR.MINOR.PATCH-windows`  
Source de vérité runtime : `windows_agent.py` → `AGENT_VERSION`  
Miroir install : `bootstrap.json` · défaut panel : `panel_server.py`

---

## 0.5.0-windows — 2026-08-11

Stabilisation process + sync efficace + tray/panel HUD.

### Breaking / comportement
- **Core** : `broadcast()` n’envoie plus le flux HUD (chat, surfaces, TTS…) aux sockets **agents machine** — uniquement messages ciblés (`device.execute`, ack). Corrige le flood « Messages ↓ » (ex. 2700+ frames inutiles).
- Heartbeat : **plus** de push métriques à chaque beat (opt-in `JARVIS_HEARTBEAT_METRICS=1`).
- Inventaire : resend caps **seulement si** fingerprint changé (`changed`), plus à chaque poll.

### Ajouts depuis 0.4.2
| Zone | Détail |
|------|--------|
| **0.4.3** | Mutex process `Local\JARVIS_WindowsAgent_SingleInstance` (`single_instance.py`) — 2ᵉ instance → exit 2 |
| **0.4.3** | `start-agent.ps1` refuse de spawn si agent déjà présent |
| **0.4.3** | Inventaire : PowerShell silencieux (`CREATE_NO_WINDOW`) ; scan menu **sans** 1 PS par `.lnk` |
| **0.5.0** | Tray : orbe HUD `ring-glowing-points-black` + pulse vivant (~8 fps) |
| **0.5.0** | Panel glass **night/light** : onglets Vue / Apps / Caps / Sync / Automatismes / Paramètres |
| **0.5.0** | APIs : `/api/apps`, `/api/capabilities`, `/api/sync`, `/api/cache/clear`, `/api/automations` |
| **0.5.0** | HUD navigateur forcé `https://jarvis.global-it-ss.com` (caméra/micro) |
| **0.5.0** | Télémétrie : `sent_by_action` / `recv_by_type` / `recv_noise` / `recv_commands` |
| **0.5.0** | Config : `JARVIS_HEARTBEAT_S`, `JARVIS_HEARTBEAT_METRICS`, `JARVIS_INVENTORY_APPX` |

### Fichiers touchés (jalon)
`single_instance.py`, `windows_agent.py`, `start-agent.ps1`, `inventory.py`, `tray_app.py`, `panel.html`, `panel_server.py`, `status.py`, `agent_lib.py`, `runtime.py`, `config.py`, `bootstrap.json`, `install-agent.ps1`  
Core : `ws/connection.py`, `orchestrator_session.py` (broadcast)

### Pas encore (hors 0.5.0)
- window.* / shell.exec / process control
- `rediscover_on_disconnect` = flag stocké, runtime pas encore branché
- Tâche planifiée réactivée après disable urgence (manuel)

---

## 0.4.3-windows — 2026-08-11

- Mutex anti-cascade process
- Garde lanceur `start-agent.ps1`
- Inventaire sans cascade de terminaux PowerShell

## 0.4.2-windows

- Panel HTTP local + tray glass basique
- Caps slim au boot + inventaire warmup hors chemin WS
- Heartbeat + metrics sur beat (comportement retiré en 0.5.0 défaut)

## 0.4.0-windows

- Inventaire logiciel + `app.launch` (P4+)
- Découverte Core LAN / Internet / local
- Install ProgramData + tâche logon
