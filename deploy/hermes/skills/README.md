# Skills Hermes (JARVIS OS)

Conscience produit sous `deploy/hermes/skills/`. Seed → `HERMES_HOME`
(`/var/lib/jarvis/hermes` sur NUC) via `deploy/scripts/seed-hermes-consciousness.*`.

## Convention (skill pack)

Inspirée de DeerFlow, **sans** leur Gateway / install `.skill` :

```
skills/<name>/
  SKILL.md          # obligatoire
  references/       # optionnel — docs annexes
  scripts/          # optionnel — helpers (rare ; préférer CLI amont)
```

### Frontmatter YAML

| Champ | Obligatoire | Rôle |
|-------|-------------|------|
| `name` | oui | id = nom du dossier |
| `description` | oui | **Triggers** pour progressive load — commencer par `TRIGGER —` |
| `version` | recommandé | semver string (`"1.0"`) |

Pas de champ `enabled` dans le SKILL : l’activation reste côté Hermes
(`config.yaml` / outils `skill_*`). Le Core n’exécute pas ces fichiers.

### Progressive load

Hermes ne doit **pas** avaler tout le SOUL + tous les skills à chaque tour.
La `description` décide du chargement. Règles :

1. Verbes / intents concrets dans la description (« explique », « cherche un lien »…).
2. Dire explicitement ce qui **ne** charge **pas** ce skill.
3. Skills méthodo (`deep-research`) ≠ couche fetch (`agent-reach`) ≠ Capabilities Core.

### Deux registres (figé)

| Type | Où | Rôle |
|------|-----|------|
| Skill Hermes | ici | Consigne de raisonnement |
| Capability Core | `core/jarvis_core/capabilities.py` | Contrat exécutable + Policy |

## Catalogue produit

| Skill | Rôle |
|-------|------|
| `jarvis-os` | Loi produit / Policy / voix / rôles |
| `family-enroll` | Enrollment foyer |
| `hud-apps` | Catalogue apps + intents |
| `ecosystem-hosts` | Routage multi-hôte |
| `user-locale` | Langue / profil |
| `agent-reach` | Fetch Internet |
| `deep-research` | Méthodo recherche multi-angles |

## Fan-out sous-tâches

Pattern **lead → sous-tâches → synthèse** : doc vision
[`docs/architecture/JARVIS-VISION-ORCHESTRATION.md`](../../../docs/architecture/JARVIS-VISION-ORCHESTRATION.md)
§ Fan-out. Implémentation = Hermes (`delegate_task` / toolsets), **pas** LangGraph / DeerFlow.
