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

### Progressive load (confirmé Hermes 0.20)

Hermes injecte dans **chaque** run api_server :

1. **Schémas outils** de tous les `platform_toolsets.api_server` actifs — **pas filtrable par requête** (`POST /v1/runs` n'accepte pas `toolsets` ; seul le plafond `config.yaml` compte). C'est le gros du volume (~10k+ tokens) en MINIMAL comme en FULL si les toolsets restants exposent beaucoup d'outils.
2. **Index skills** — descriptions YAML de tous les skills (corps chargé via `skill_view` seulement). Les `description` TRIGGER décident ce que l'agent *devrait* ouvrir, pas ce qui entre dans le prompt système.
3. **SOUL.md** + contexte session.

`JARVIS_HERMES_MINIMAL=1` réduit les toolsets platform, pas le catalogue skills.

**Diagnostic NUC :** `deploy/scripts/_probe_hermes_latency.py`

**Pistes :**
- Garder MINIMAL prod ; FULL seulement si besoin admin explicite
- Descriptions skills strictes (TRIGGER + « Ne PAS charger pour chat casual »)
- Core `bridge.py` : consigne chat skills sans `skill_view` pour salutations
- Upstream Hermes : demander `toolsets` / `compact_categories` par requête `/v1/runs` (non exposé aujourd'hui)

**Règles description (index skills) :**

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
| `jarvis-memory` | Mémoire foyer via Core MemoryAPI (M4) |
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
