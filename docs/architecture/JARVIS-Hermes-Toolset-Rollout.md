# JARVIS — Hermes toolsets (FULL sauf HA)

> **Statut :** prod (2026-08-16) — **GO Samir : tout Hermes sauf `homeassistant`**.  
> **Voisin :** [`JARVIS-Gateway-Hermes-HA.md`](JARVIS-Gateway-Hermes-HA.md)

---

## Principe

| Couche | Rôle |
|--------|------|
| **Hermes upstream** | 28 toolsets possibles |
| **Core `hermes_toolsets.py`** | Plafond prod = **catalogue complet − HA** + filtre rôle |
| **Hermes `config.yaml`** | `platform_toolsets.api_server` = même liste (script NUC) |
| **Policy Engine** | Tranche avant exécution (HOME, ADMIN, VPS allowlist) |

**Interdit toujours :** `homeassistant` — domotique = Core → HA NUC.

---

## Modes env (`core.env`)

| Variable | Effet |
|----------|--------|
| `JARVIS_HERMES_FULL=1` (défaut) | Tous les toolsets du catalogue sauf HA |
| `JARVIS_HERMES_MINIMAL=1` | Base : web, skills, memory, todo, session_search, vision |
| **`JARVIS_HERMES_CHAT_ONLY=1`** | **Chat casual : web + skills seulement** (prioritaire sur MINIMAL/FULL) |
| `JARVIS_HERMES_TOOLSETS_ENABLED` | CSV surcharge (ajoute des noms ; jamais HA) |

---

## Catalogue FULL (sans HA)

`web` · `browser` · `terminal` · `file` · `code_execution` · `skills` · `memory` · `todo` · `session_search` · `cronjob` · `delegation` · `vision` · `image_gen` · `bfl` · `video` · `video_gen` · `spotify` · `a2a` · `computer_use` · `x_search` · `tts` · `stt` · `clarify` · `context_engine` · `discord` · `discord_admin` · `yuanbao`

---

## Filtre rôle (délégation Core)

| Rôle | Toolsets |
|------|----------|
| **admin** | Tout le plafond platform |
| **user** | web, browser, skills, memory, todo, session_search, vision, delegation, clarify, x_search, image_gen, video |
| **child** | web, skills, vision, memory, session_search |
| **guest** | rien |

Admin-only côté catalogue : terminal, file, code_execution, cronjob, computer_use, a2a, messaging, spotify, tts/stt, etc.

---

## Procédure NUC

1. **`/etc/jarvis/core.env`** :
   ```env
   JARVIS_HERMES_FULL=1
   JARVIS_CHAT_PROVIDER=hermes
   JARVIS_HASS_URL=http://127.0.0.1:8123
   ```
2. **Sync repo**
3. **`deploy/scripts/_apply_hermes_toolsets_nuc.sh`** (lit `core.env`, écrit `platform_toolsets`)
4. **`systemctl restart jarvis-core jarvis-hermes`**
5. **Smoke** — `python -m jarvis_core._smoke_hermes_toolset_rollout`

---

## Fichiers code

| Fichier | Rôle |
|---------|------|
| `core/jarvis_core/hermes_toolsets.py` | Catalogue FULL + rôles + env |
| `core/jarvis_core/capabilities.py` | `toolsets_for()` |
| `deploy/hermes/config.snippet.yaml` | Template NUC |
| `deploy/scripts/_apply_hermes_toolsets_nuc.sh` | Apply live |

---

## Checklist prod

- [x] Code FULL except HA + smokes repo
- [x] NUC : HA sur loopback + `JARVIS_HERMES_MINIMAL=1` + fixes delegate/gateway déployés
- [ ] Re-seed skills (TRIGGER strict) + sync `bridge.py` chat instructions
- [ ] Test chat skills + intent admin (shell VPS, browser)
- [ ] HA reste Core-only (lumières, streaming TV)

---

## Latence chat (diagnostic 2026-08-16)

**Symptôme :** « j'arrive » ≈ 8–13 s ; **~11,7k tokens entrée** pour 2 mots (`POST /v1/runs` direct).

**Confirmé sur NUC (MINIMAL, 6 toolsets) :**

| Mesure | Valeur |
|--------|--------|
| `platform_toolsets` actifs | memory, session_search, skills, todo, vision, web |
| `input_tokens` (« j'arrive ») | **11 695** |
| `elapsed_s` (api_server seul) | **~6 s** |
| Skills seedés | 13 dossiers |
| SOUL.md | ~3,3 KB |

**Ce n'est PAS le corps des SKILL.md** — Hermes charge le corps via `skill_view` à la demande. Le prompt système inclut :

1. **Schémas JSON de tous les outils** des toolsets platform actifs (~90 % du volume) — **non filtrable par requête** : `/v1/runs` n'accepte pas `toolsets`, seul `config.yaml` compte.
2. **Index skills** (descriptions YAML frontmatter de chaque skill).
3. SOUL + contexte session.

`JARVIS_HERMES_MINIMAL=1` réduit les toolsets (27→6) mais pas le catalogue skills ; gain latence modeste (FULL ~11 s → MINIMAL ~8,6 s mesuré Samir ; probe api_server ~6 s).

**Pistes :**

| Piste | Effet attendu |
|-------|----------------|
| Garder MINIMAL prod ; FULL ponctuel admin | − tool schemas |
| Descriptions skills TRIGGER + « Ne PAS charger pour chat casual » | − confusion agent ; index inchangé |
| Core `bridge.py` : consigne `agent.skills` sans `skill_view` pour salutations | − appels outils superflus (pas − tokens entrée) |
| Upstream Hermes : `toolsets` / profil « chat » par requête `/v1/runs` | − gros du volume |
| `disabled_skills` Hermes config pour skills purement admin | − index skills |
| **`_dedupe_hermes_skills_nuc.sh`** — retirer 13 skills upstream (`apple`, `github`…) de `$HERMES_HOME/skills` | − index (~21→8 skills) |

**Mesures NUC (2026-08-16, MINIMAL) :**

| Étape | `input_tokens` | `elapsed_s` |
|-------|----------------|-------------|
| Avant dedupe (13 upstream + 8 seed) | 11 695 | 10,86 |
| Après dedupe (seed external_dirs seul) | **9 785** | 10,44 |

→ **−1 910 tokens (−16 %)** ; latence quasi inchangée — confirme que le gros reste les schémas outils platform.

**Profil chat-only (`JARVIS_HERMES_CHAT_ONLY=1`)** — platform = `web` + `skills` uniquement :

```bash
# NUC :
bash /opt/jarvis/seed/deploy/scripts/_apply_hermes_chat_only_nuc.sh
python3 /opt/jarvis/seed/deploy/scripts/_probe_hermes_latency.py
```

**Trade-off :** memory / todo / vision / delegation indisponibles côté Hermes tant que chat-only actif — repasser en MINIMAL ou FULL pour ces capacités (`_apply_hermes_toolsets_nuc.sh` après avoir retiré `JARVIS_HERMES_CHAT_ONLY` de `core.env`).

**Probe :** `deploy/scripts/_probe_hermes_latency.py` (NUC : `set -a; source /etc/jarvis/core.env; set +a; python3 …`)
