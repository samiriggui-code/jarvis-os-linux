# JARVIS OS — contexte stable

> Contexte **immuable entre sessions**. Pour l'état courant → [`claude/JARVIS_SESSION_STATE.md`](claude/JARVIS_SESSION_STATE.md).  
> Pour les décisions validées → [`DECISIONS.md`](DECISIONS.md).

---

## Qu'est-ce que JARVIS

Plateforme personnelle d'intelligence distribuée — **pas** une app monolithique.

| Couche | Techno | Dossier |
|--------|--------|---------|
| HUD | React | `hud/` |
| Dashboard | React | `dashboard/` |
| Core | Python | `core/` |
| Setup | React | `setup/` |
| Deploy | scripts/systemd | `deploy/` |
| Hermes | amont NUC | clone `NousResearch/hermes-agent` |
| Voix | amont VPS | `jamiepine/voicebox` (docker) |

**Pas de Qt/QML.** `vendor/figma1` / `figma2` = backup uniquement.

---

## Invariant sécurité (non négociable)

```
IA → Proposition → Policy Engine → Autorisation → Exécution
```

- Jamais IA → root
- LLM **uniquement** via AI Provider Manager (`core/jarvis_core/providers.py`)
- Secrets hors git
- JARVIS BASE doit survivre sans HUD / IA / domotique

---

## Où lire quoi

| Sujet | Document |
|-------|----------|
| Reprise détaillée | [`REPRISE-2026-08-06.md`](REPRISE-2026-08-06.md) |
| Index architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Agentic UI (contrat validé) | [`architecture/JARVIS-Agentic-UI.md`](architecture/JARVIS-Agentic-UI.md) |
| Vision plateforme | [`architecture/JARVIS-Core-Plateforme.md`](architecture/JARVIS-Core-Plateforme.md) |
| Satellites / HA | [`architecture/JARVIS-Satellites.md`](architecture/JARVIS-Satellites.md) |
| Déploiement | [`INSTALLATION_DEPLOIEMENT.md`](INSTALLATION_DEPLOIEMENT.md) |
| Recovery | [`RECOVERY.md`](RECOVERY.md) |
| Spec produit HUD | [`../hud/cahierdecharges.md`](../hud/cahierdecharges.md) |
| Règles Cursor | [`.cursor/rules/project.mdc`](../.cursor/rules/project.mdc) |

---

## Modèle amont (trois briques, jamais copiées dans vendor)

| Brique | Cible | Source |
|--------|-------|--------|
| voicebox | VPS | docker-compose |
| hermes-agent | NUC | clone git |
| agent-reach | venv Core | commit épinglé dans `requirements.txt` |

`vendor/` = sas d'intégration temporaire, pas une archive.

---

## SSH — ne pas mélanger les clés

| Machine | Alias | Clé | Port WAN |
|---------|-------|-----|----------|
| Pi salon | `jarvis-pi-wan` | `jarvis_pi_salon_ed25519` | 41223 |
| NUC | `jarvis-nuc` / WAN manuel | `jarvis_nuc_ed25519` | 41222 |
| VPS | `hostinger` | `id_ed25519` | 22 |
