---
name: agent-reach
description: >-
  Couche Internet pour Hermes (PAS un cerveau). Recherche web, GitHub, YouTube
  (sous-titres), Reddit, X/Twitter, RSS, etc. via CLI agent-reach + outils
  amont. Déléguer fetch → filtrer → synthétiser avec LLM. Vendor =
  vendor/Agent-Reach-main (MIT). Ne jamais merger dans core/.
---

# Skill — Agent-Reach (capability layer)

## Rôle dans JARVIS OS

```
Hermès (orchestrateur)
  ├── LLM (Ollama / cloud via Provider Manager)
  ├── HA / Holomat / Voix / Mémoire / Policy
  └── Agent-Reach  ← fetch Internet seulement
         ├── web / Exa search
         ├── GitHub (gh)
         ├── YouTube (yt-dlp sous-titres)
         ├── Reddit / X / RSS / …
         └── doctor (santé backends)
```

Hermes **décide** et **synthétise**. Agent-Reach **récupère**.  
Données externes → **filtre anti prompt-injection** avant LLM (§ sécurité JARVIS).

## Quand l’utiliser

- « Cherche les nouveautés sur X »
- « Trouve un repo GitHub holographique »
- « Résume cette vidéo YouTube »
- Lien Reddit / Twitter / RSS / page web

**Pas pour** : publier / like / commenter ; domotique ; VPS root ; Dashboard admin.

## Procédure

1. `agent-reach doctor --json` — quel backend actif ?
2. Annoncer : « Agent-Reach · plateforme Y · backend Z »
3. Exécuter les commandes du skill upstream (réfs vendor) :
   - `vendor/Agent-Reach-main/agent_reach/skill/SKILL_en.md`
   - `references/{search,web,video,dev,social}.md`
4. Collecter → **filtrer** → répondre (locale user FR/EN).
5. Échec : chaînes de retry des références, pas inventer d’API.

## Install (host Hermes / VPS)

**Ne pas oublier** : module Setup `agent-reach` (profils vps / complet / assistant) +
page Dashboard **Agent-Reach** (`#/reach`) + app HUD **Internet**.

```bash
pip install -e vendor/Agent-Reach-main
agent-reach install --env=auto --safe   # prod / VPS : --safe
agent-reach doctor
```

Core WS : `{ "type": "agent_reach", "action": "doctor" }` → statut pour le Dashboard.
Config / cookies : `~/.agent-reach/config.yaml` (600) — **jamais** git / `core/.env`.

## Policy

- Risk **info** (lecture) — confirmation si volume massif / scrape sensible.
- Pas de write social.
- Cookies utilisateur uniquement (Cookie-Editor) — pas d’auto-login opaque.

## Interdit

- Merger `agent_reach` dans `core/`
- Appels LLM directs depuis Agent-Reach
- Contourner Policy / allowlist VPS
