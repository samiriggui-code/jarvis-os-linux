# JARVIS Setup Center

Installateur / configurateur (React + Vite) — génère un **manifeste** de déploiement.

```bash
cd setup
npm install
npm run dev
```

Ouvre http://localhost:5173

## Rôle

- Choix profil (Minimal / Assistant / Maison / …)
- Modules (HUD, Ollama, HA…)
- Export `jarvis-manifest.json`

Les clés API : plus tard via coffre `/etc/jarvis/secrets.env` (navigateur setup-only), pas dans ce MVP UI.

Inspiré du flux §5 du cahier des charges ; l’upstream `jarvis-installer` (vendor) pourra enrichir plus tard.
