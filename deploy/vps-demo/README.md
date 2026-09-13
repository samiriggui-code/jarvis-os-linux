# Démo VPS — Core + HUD + ElevenLabs

Stack minimale pour tester **agentic UI**, toasts, WS. **Pas** HA, Pi, Hermes, Ollama.

## Prérequis

- Docker + Compose sur le VPS
- Clés : `ANTHROPIC_API_KEY` (ou `OPENROUTER_API_KEY`) + `ELEVENLABS_API_KEY`

## Lancer

Depuis la racine du repo :

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export ELEVENLABS_API_KEY=...
docker compose -f deploy/vps-demo/docker-compose.yml up -d --build
```

- HUD local : `http://127.0.0.1:18080/` (bind loopback — Traefik public)
- Prod VPS : Traefik `jarvis.global-it-ss.com` → `127.0.0.1:18080`
- WS : `wss://jarvis.global-it-ss.com/ws` (nginx → Core `:8765`)

## Arrêt

```bash
docker compose -f deploy/vps-demo/docker-compose.yml down
```
