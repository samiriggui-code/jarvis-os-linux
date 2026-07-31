# JARVIS Dashboard Core

Cockpit admin React (§13.7) — **cible de déploiement : VPS**.

```bash
cd dashboard
npm install
npm run dev
# http://127.0.0.1:5174
```

## Périmètre

| Zone | Modules |
|------|---------|
| Survie | **Recovery** (JARVIS BASE — clavier/souris) |
| Cockpit | Command Center, Hermes Core |
| Managers | Voice, **Holomat**, Entités, Agents, Tools, Apps |
| Host VPS | **Docker**, **Terminal**, **Déploiements**, Système |
| Admin | IA / Providers, Réglages (Policy) |

- **Recovery** : si HUD figé, micro KO, clé API, Hermes down, HA mal paramétré → ouvrir le Dashboard dans un navigateur normal (pas le kiosk). Deep-link `#/recovery`, raccourci `Ctrl+Alt+R`. Indépendant de la voix / Hermes.
- **Holomat** = vision fusionnée (`vendor/vision/`) — FaceEngine, gestes, calib (auth multi-facteurs).
- **VPS** = terminal host, Docker UI (Portainer), projets sous `/opt/jarvis` + slots futurs — actions via Policy admin.
- Distinct du HUD (`hud/`) et du Setup (`setup/`).

Données actuelles = **mocks** jusqu’au protocole Core (`list_tools` / `get_config` / shell agent).
