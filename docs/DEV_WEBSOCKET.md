# Core WebSocket — contrat (dev)

Sur Windows / Linux, le Core écoute seul pour l’instant :

```
[python -m jarvis_core]  →  ws://127.0.0.1:8765
```

Les fronts React (`vendor/figma1`, `vendor/figma2`) seront clients WS plus tard.  
Le HUD Qt a été **supprimé** — ne plus lancer `hud/main.py`.

## Lancer le Core

```powershell
cd c:\laragon\www\jarvis-os-linux\core
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m jarvis_core
```

URL custom : `$env:JARVIS_CORE_WS="ws://127.0.0.1:8765"` (côté futur client).

## Ce qui circule (stub actuel)

| Direction | Exemple |
|-----------|---------|
| Client → Core | `{ "type": "user_event", "event": "chat", "text": "bonjour" }` |
| Client → Core | `{ "type": "ping" }` |
| Core → Client | `{ "command": "set_orb_state", "state": "thinking" }` |
| Core → Client | `{ "command": "display_notification", "message": "…" }` |
| Core → Client | `{ "command": "boot" }` |

Serveur : `core/jarvis_core/__init__.py` (port **8765**).

Réf. voix / panels / approvals : `vendor/refs/jarvis_ai/docs/ARCHITECTURE.md` (à porter, pas le HUD vanilla).
