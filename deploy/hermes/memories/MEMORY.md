# Mémoire JARVIS OS (faits durables)

> Wiki **Markdown lisible** (idée memU) — pas un 4ᵉ store opaque.  
> Seed : `deploy/hermes/memories/MEMORY.md` → `HERMES_HOME/memories/`.  
> Les 3 magasins autorisés : Core `memory.py` · outil Hermes `memory` · **ce fichier**.

## Projet

- Monorepo `jarvis-os-linux` : `hud/` · `core/` · `dashboard/` · `deploy/`.
- Cerveau agent : **Hermes** (`jarvis-hermes` NUC `:8642`). Conscience : `SOUL.md` + `deploy/hermes/skills/`.
- LLM : Provider Manager (Ollama VPS → OpenRouter → mode système).

## Foyer & rôles

- Admin foyer : seul rôle **Dashboard**. Famille = **HUD** seulement.
- Auth HUD : phrase STT « Jarvis, active-toi » (Holomat = gestes / objets, pas facteur d’accès).
- Policy Engine entre toute action IA et exécution système.

## Vocal

- Commandes préfixées « Jarvis … » ; cycle veille après chaque réponse.
- Secrets / PIN / clés : **jamais** en TTS.

## Progressive retrieve (avant tâche non triviale)

Avant une mission / recherche / multi-étapes, Hermes doit :

1. Lire **ce wiki** + skills `TRIGGER` pertinents (`jarvis-os`, `deep-research`, …).
2. Consulter l’outil `memory` Hermes si un fait user/session est attendu.
3. Ne **pas** inventer un store memU / vector cloud.

L’agent **décide** quoi retenir ; le store indexe / rappelle — pas un LLM dans le magasin.

## Faits à tenir à jour (éditer ici)

- Topologie : NUC Core+Hermes · Pi salon (HA/ear/cam) · VPS voicebox+Ollama · ProLiant = Plex/NAS only.
- Décisions figées : `docs/DECISIONS.md` (ne pas contredire depuis la mémoire).

## Interdit

- Installer memU cloud / `memu-hermes` sur le NUC (patche `SOUL.md`).
- Auto-générer des skills sous `deploy/hermes/skills/` depuis l’historique.
- Fusionner les 3 magasins en un sidecar tiers.
