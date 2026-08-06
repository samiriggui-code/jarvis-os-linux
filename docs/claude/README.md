# Mémoire Claude — JARVIS OS

La mémoire longue vit **dans le repo**, pas dans le chat.

## Démarrer une session

1. Lire **[`JARVIS_SESSION_STATE.md`](JARVIS_SESSION_STATE.md)** — état courant, prochaine action.
2. Si besoin de contexte stable : **[`../JARVIS_CONTEXT.md`](../JARVIS_CONTEXT.md)**.
3. Ne pas réinterpréter les décisions de **[`../DECISIONS.md`](../DECISIONS.md)**.

## Découper par session (une thématique par conversation)

| Session | Sujet | Docs de référence |
|---------|--------|-------------------|
| 1 | Architecture JARVIS | `docs/ARCHITECTURE.md`, `docs/architecture/` |
| 2 | Home Assistant | `docs/architecture/JARVIS-Satellites.md` |
| 3 | HUD / Agentic UI | `docs/architecture/JARVIS-Agentic-UI.md`, `hud/src/agentic/` |
| 4 | Code uniquement | module ciblé + `DECISIONS.md` + contraintes explicites |

## Avant la limite de contexte

Demander : *« Fais-moi un résumé de transfert de session »* puis mettre à jour :

- `docs/claude/JARVIS_SESSION_STATE.md`
- `docs/TODO.md` si la priorité a changé
- `docs/CHANGELOG.md` pour les jalons de session
- `docs/DECISIONS.md` si une décision a été validée

## Prompt type (code ciblé)

```
Objectif : [une seule tâche]
Contexte : docs/claude/JARVIS_SESSION_STATE.md + docs/JARVIS_CONTEXT.md
Contraintes : [ce qu'il ne faut pas toucher]
Fichiers : [chemins précis]
```
