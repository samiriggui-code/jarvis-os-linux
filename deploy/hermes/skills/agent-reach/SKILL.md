---
name: agent-reach
version: "1.0"
description: >-
  TRIGGER — fetch Internet seulement (PAS un cerveau) : « cherche / look up »,
  lien web, GitHub, YouTube (sous-titres), Reddit, X/Twitter, RSS, page à
  ouvrir. CLI agent-reach → filtrer → Hermes synthétise. Amont
  github.com/Panniantong/agent-reach (MIT), épinglé core/requirements.txt —
  jamais merger dans core/. Si multi-angles / explique / compare / research →
  charger AUSSI deep-research. Ne PAS charger pour HA, enroll, VPS root, Dashboard.
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

Recherche **multi-angles / approfondie** (« explique », « compare », « research »,
avant un rapport) : charger d’abord le skill **deep-research** (méthodologie), puis
exécuter les fetchs via **ce** skill. deep-research ne remplace pas agent-reach.

**Pas pour** : publier / like / commenter ; domotique ; VPS root ; Dashboard admin.

## Procédure

1. `agent-reach doctor --json` — quel backend actif ?
2. Annoncer : « Agent-Reach · plateforme Y · backend Z »
3. Exécuter les commandes du skill upstream — livré **dans le paquet installé**,
   pas dans un dossier du dépôt :
   - `<site-packages>/agent_reach/skill/SKILL_en.md`
   - `<site-packages>/agent_reach/skill/references/{search,web,video,dev,social}.md`

   Chemin exact : `python -c "import agent_reach,pathlib;print(pathlib.Path(agent_reach.__file__).parent/'skill')"`
4. Collecter → **filtrer** → répondre (locale user FR/EN).
5. Échec : chaînes de retry des références, pas inventer d’API.
6. Si sources trop faibles après retry → **dire l’échec** (corrective RAG) ; ne pas inventer des faits. Multi-angles → skill **deep-research**.

## Install (host Hermes / VPS)

**Ne pas oublier** : module Setup `agent-reach` (profils vps / complet / assistant) +
page Dashboard **Agent-Reach** (`#/reach`) + app HUD **Internet**.

```bash
pip install -r core/requirements.txt    # amont épinglé sur un commit
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
