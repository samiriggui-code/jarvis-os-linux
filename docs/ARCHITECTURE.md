# Architecture JARVIS OS — index

> **Session 1** : lire ce fichier + les docs pointés ci-dessous.  
> Ne pas refaire l'architecture dans le chat — ces documents sont la source.

---

## Documents canoniques

| Document | Statut | Contenu |
|----------|--------|---------|
| [`architecture/JARVIS-Gateway-Hermes-HA.md`](architecture/JARVIS-Gateway-Hermes-HA.md) | **Spec migration** | Couche JARVIS (`core/`), HA NUC, Hermes skills, Policy vs HA, checklist |
| [`architecture/JARVIS-Agentic-UI.md`](architecture/JARVIS-Agentic-UI.md) | **Validé** | Surfaces, catalogue, Policy, admission, renderer |
| [`architecture/JARVIS-Core-Plateforme.md`](architecture/JARVIS-Core-Plateforme.md) | Vision | Plateforme, agents, mémoire cible, écarts |
| [`architecture/JARVIS-Satellites.md`](architecture/JARVIS-Satellites.md) | Référence | Pi, HA, VPS, NUC, classes réseau |
| [`AGENTIC_UI_ARCHITECTURE.md`](AGENTIC_UI_ARCHITECTURE.md) | Supplanté | Questions ouvertes tranchées par Agentic-UI |
| [`AGENTIC_UI_VENDOR_BRIEF.md`](AGENTIC_UI_VENDOR_BRIEF.md) | Référence | Analyse vendor (CopilotKit, Eve, etc.) |
| [`../hud/ARCHITECTURE.md`](../hud/ARCHITECTURE.md) | Technique | Couches monorepo, contrats WS |
| [`COMPOSANTS.md`](COMPOSANTS.md) | Inventaire | Briques et statut |

---

## Schéma distribué (prod cible)

```
HUD/Dashboard ──WS──► Couche JARVIS (core/) ──► HA :8123 (NUC, maison unique)
                              │
                              ├──► Hermes :8642 (skills)
                              └──► Pi salon · Agent Windows (satellites)

VPS — TLS, WSS relais, Ollama (LLM #1 si activé)
```

Détail migration : [`architecture/JARVIS-Gateway-Hermes-HA.md`](architecture/JARVIS-Gateway-Hermes-HA.md).

---

## Flux agentique (résumé)

```
Utilisateur → HUD → Core (WS) → Policy → surface.py (admission)
                              → composer.py (LLM via Provider Manager)
                              → HUD renderer (composants catalogue)
```

Hermes **ne parle jamais au navigateur**. Le Core est le seul interlocuteur du HUD.

---

## Généré / contrats

`architecture/generated/` — index YAML généré par `architecture/build.py`.  
**Échoue si les contrats dérivent** (commit `346bf5c`).
