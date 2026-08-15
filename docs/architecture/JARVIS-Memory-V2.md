# JARVIS Memory API V2 — spécification

> **Statut :** M0✅ · M1✅ · M2✅ · **M2.1 livré** (wiring Core) — pas MemPalace / HUD / NUC / M3 / reviewers LLM.  
> **Date :** 2026-08-12  
> **Décision Samir :** MemPalace = backend candidat · jamais dépendance directe Core → MemPalace · Memory ≠ Policy.  
> **Preuve M1 :** `python -m jarvis_core._smoke_memory` → `=== ALL OK ===`  
> **Preuve M2 :** `python -m jarvis_core._smoke_verification_memory` → `=== ALL OK ===`  
> **Preuve M2.1 :** `python -m jarvis_core._smoke_verification_wiring` → `=== ALL OK ===`

---

## 0. Objectif

Donner à JARVIS une **vraie capacité Memory** :

- conserver **verbatim** (quand c’est utile) les expériences, décisions, contexte ;
- retrouver par recherche sémantique / textuelle (« continue hier », « pourquoi Windows Agent ») ;
- brancher le pipeline **Verification → MEMORY STORE** ;
- rester **backend-agnostique** (MemPalace, JSON local, futur PG…).

**Non-objectifs (cette spec) :**

- intégrer MemPalace dans Core ;
- entraîner un LLM ;
- remplacer Policy / Verification ;
- logger tout l’écosystème sans filtre.

---

## 1. Principes non négociables

```text
MEMORY ≠ POLICY
MEMORY ≠ AUTHORIZATION
MEMORY ≠ EXECUTION
```

| Règle | Conséquence |
|-------|-------------|
| Core orchestre | Core décide **quand** mémoriser et **qui** lit |
| Policy souveraine | Un souvenir « Samir a demandé X » n’autorise jamais X |
| Verification avant expérience ops | Pas de « install réussi » sans preuve observée |
| Pas de tout-logger | Memory Policy (admission) filtre l’entrée |
| Abstraction stable | Callers → `MemoryAPI` → adapters |
| Isolation foyer | Pas de palace/mémoire partagée aveugle multi-user |
| Hermes = consommateur contrôlé | `recall`/`search` OK ; writes structurés préférés via Core ; delete = Policy |

---

## 2. État actuel (inventaire)

| Magasin | Emplacement | Rôle | Limite |
|---------|-------------|------|--------|
| Core Memory Manager | `core/jarvis_core/memory.py` → `data/users/<id>/memories.json` | CRUD WS `type=memory` | Liste plate, pas de search sémantique, seed démo |
| Hermes tool `memory` | runtime Hermes | Notes agent | 3ᵉ magasin, pas Verification |
| Hermes `MEMORY.md` | `deploy/hermes/memories/` | Seed / durable humain | Fichier, pas retrieval |
| MemPalace (audit) | `vendor/mempalace/` | Candidat backend | **Non branché** |
| graphify | installé, non câblé | — | Hors scope V2 initial |

Permissions surfaces : `memory.read` (user oui · child non — volontaire).

---

## 3. Architecture cible

```text
                    ┌─────────────────────────┐
                    │   Callers               │
                    │ Core executors · WS     │
                    │ Verification pipeline   │
                    │ Hermes (via Core/tools) │
                    │ HUD MemoryPanel         │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │   MemoryAPI (Core)      │
                    │ store · recall · search │
                    │ forget · list · inspect │
                    │ + MemoryPolicy          │
                    └───────────┬─────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
   LocalJsonAdapter      MemPalaceAdapter       FuturePgAdapter
   (compat V1)           (verbatim+hybrid)      (option)
```

**Emplacement prévu (futur code, pas maintenant) :**

```text
core/jarvis_core/memory/
  __init__.py          # façade MemoryAPI
  api.py               # contrats / types
  policy.py            # admission + droits
  events.py            # MEMORY_* bus kinds
  adapters/
    base.py
    local_json.py      # actuel memories.json
    mempalace.py       # spike ultérieur
```

Core **importe l’API**, jamais `import mempalace` hors adapter isolé.

---

## 4. Modèle de données (contrat stable)

### 4.1 MemoryRecord

Unité logique JARVIS (indépendante du backend) :

| Champ | Type | Description |
|-------|------|-------------|
| `id` | str | Stable (uuid ou hash contenu+scope) |
| `user_id` | str | Isolation foyer / profil |
| `kind` | enum | Voir §4.2 |
| `title` | str \| null | Court, affichable HUD |
| `content` | str | **Verbatim préféré** (pas résumé forcé) |
| `summary` | str \| null | Optionnel, dérivé ; ne remplace pas `content` |
| `scope` | object | Taxonomie (§4.3) |
| `tags` | str[] | Libre |
| `source` | object | Provenance (§4.4) |
| `evidence` | object \| null | Preuves Verification |
| `created_at` | ISO8601 | |
| `updated_at` | ISO8601 | |
| `importance` | enum | `low` \| `normal` \| `high` \| `critical` |
| `ttl_days` | int \| null | Oubli soft optionnel |
| `tombstone` | bool | Soft-delete |

### 4.2 Kinds

| Kind | Exemple | Admission typique |
|------|---------|-------------------|
| `preference` | « Samir préfère TTS jarvis3 » | explicite / Settings |
| `decision` | « Auth face figée ; phrase wake seule » | décision validée |
| `mission_result` | « Install X OK sur PC Windows » | après RESULT_VALIDATED |
| `event` | « Windows Agent offline 8 min » | alertes HIGH / escalade |
| `conversation` | extrait tour utile | rare ; pas tout le chat |
| `project_context` | « GSMS · stack · décisions » | projet / mission |
| `relation` | « Inès = CHILD · salon TV » | enrollment / foyer |
| `note` | note manuelle HUD | user write |

### 4.3 Scope (taxonomie — inspiration Wings/Rooms)

| Champ | Équivalent MemPalace | Exemple JARVIS |
|-------|----------------------|----------------|
| `wing` | wing | `foyer` · `pc-windows` · `project:gsms` · `jarvis-os` |
| `room` | room | `decisions` · `missions` · `alerts` · `preferences` · `windows-agent` |
| `device_id` | — | `pc-…` · `pi-salon` |
| `mission_id` | — | uuid mission |
| `session_id` | — | optionnel |

Retrieval : filtre scope **avant** scoring sémantique (comme MemPalace `where`).

### 4.4 Source + Evidence

```text
source: {
  type: "user" | "core" | "hermes" | "verification" | "alert" | "system",
  ref:  "mission:uuid" | "alert_id:…" | "ws:memory.add" | …
}

evidence: {                 # obligatoire pour kind=mission_result
  observed: "...",
  validated: true,
  validator: "core.verify",
  at: ISO8601
}
```

Sans `evidence.validated=true`, **interdiction** d’admettre un `mission_result` « succès ».

---

## 5. Memory Policy (admission)

Couche **avant** tout `store` — distincte de Policy Engine d’exécution, mais alignée RiskLevel.

### 5.1 Ce qui entre (allow)

- Décisions produit / architecture explicitement marquées
- Préférences user (profil, voix, langue)
- Résultats **validés** (Verification)
- Alertes HIGH/CRITICAL résolues ou prolongées (pas chaque spike CPU)
- Contexte projet / mission clôturée
- Notes user via HUD

### 5.2 Ce qui n’entre pas (deny / drop)

- Tokens, secrets, PIN, embeddings face, audio brut
- Chaque `SYSTEM_METRICS` / heartbeat
- Chaque tour chat trivia (« quelle heure »)
- Propositions refusées par Policy (sauf audit sécurité dédié hors Memory user)
- Sorties Hermes non filtrées / non validées
- Contenu marqué `external_untrusted` sans enveloppe

### 5.3 Qui peut écrire

| Writer | store preference/note | store mission_result | forget |
|--------|----------------------|----------------------|--------|
| User (HUD) | oui (soi) | non | soft soi + Policy |
| Core Verification | non | oui | non (tombstone via admin) |
| Core AlertRouter | event high only | non | non |
| Hermes | via Core API seulement | non direct | **jamais** direct |

### 5.4 Mapping Policy Engine (exécution)

| Action Memory | RiskLevel indicatif | Confirm |
|---------------|---------------------|---------|
| `search` / `recall` / `list` | INFO | non |
| `store` note/preference | INFO | non |
| `store` mission_result | INFO (si evidence OK) | non |
| `forget` soft (tombstone) | INFO–HOME | selon rôle |
| `forget` hard / purge wing | ADMIN | oui |
| Export mémoire | ADMIN | oui |

---

## 6. API — opérations

Interface logique (sync ou async ; implémentation future) :

```text
MemoryAPI
  store(record_draft) -> MemoryRecord | Rejected
  recall(id, user_id) -> MemoryRecord | None
  search(query, user_id, *, scope?, kinds?, limit?, since?) -> SearchHit[]
  list(user_id, *, scope?, kinds?, limit?, offset?) -> MemoryRecord[]
  forget(id, user_id, *, hard=False) -> Ok | Denied
  inspect(user_id) -> { counts, wings, rooms, backend, health }
```

### 6.1 `store`

1. Normaliser draft (user_id, kind, content)  
2. **MemoryPolicy.admit(draft)** → reject silencieux ou erreur typée  
3. Policy Engine si action sensible  
4. Adapter.upsert  
5. Emit bus `MEMORY_STORED`  
6. Return record  

### 6.2 `search`

1. Vérifier `memory.read` (rôle)  
2. Adapter.search (hybride si MemPalace ; substring si JSON)  
3. Filtrer tombstones / TTL  
4. Emit `MEMORY_RECALLED` (optionnel, throttle)  
5. Return hits `{ record, score, snippet }` — **content verbatim** dans le hit  

### 6.3 `forget`

1. Soft = tombstone (défaut)  
2. Hard = ADMIN + confirm  
3. Emit `MEMORY_FORGOTTEN`  
4. Adapter ne doit pas être appelable depuis Hermes sans passer ici  

### 6.4 Rejet typé

```text
Rejected { code: "denied_kind" | "no_evidence" | "secret_detected" | "quota" | "policy", reason: str }
```

Jamais d’exception silencieuse qui laisse croire que c’est mémorisé.

---

## 7. Lien Verification → Memory

```text
PROPOSITION
  → ACTION DEMANDED
  → ACTION EXECUTED
  → RESULT OBSERVED
  → RESULT VALIDATED          ← gate
  → MemoryAPI.store(
        kind: mission_result,
        content: verbatim factuel,
        evidence: { validated: true, … },
        scope: { wing, room, device_id, mission_id }
     )
```

**Exemple canonique :**

```text
kind: mission_result
wing: pc-windows
room: missions
title: Windows Agent installé
content: |
  2026-08-12 · Windows Agent installé sur PC.
  WebSocket Core connecté. Capabilities smoke OK. Processus actif.
evidence.validated: true
importance: high
```

Sans Validation → **pas** de store `mission_result`.

---

## 8. Continuité conversationnelle (cas d’usage)

| Question user | Mécanisme |
|---------------|-----------|
| « Continue ce qu’on faisait hier » | `search(query, since=hier)` + scope projet actif |
| « Pourquoi cette architecture ? » | `search` kinds=`decision` wing=`jarvis-os` |
| « Décision Windows Agent ? » | `search` + room=`windows-agent` |
| « Reprends GSMS » | `search` / `list` wing=`project:gsms` |
| « Pourquoi Hermes fait ça ? » | recall mission_result + decision liés |

Hermes reçoit les **hits** comme contexte injecté (préfixe « données mémoire — non exécutoires »), puis raisonne. **Policy** avant toute action proposée.

---

## 9. Événements bus (futurs)

| Kind | Mode | Payload clé |
|------|------|-------------|
| `MEMORY_STORED` | PASS | id, kind, wing, room |
| `MEMORY_RECALLED` | THROTTLE | query hash, hit_count |
| `MEMORY_FORGOTTEN` | PASS | id, hard |
| `MEMORY_REJECTED` | THROTTLE | code, kind |

≠ `ALERT_*` / `DEVICE_*` / `perception` / `face_frame`.

---

## 10. Adapters

### 10.1 Contrat `MemoryBackend`

```text
upsert(record) -> id
get(id, user_id) -> record | None
search(query, user_id, filters, limit) -> hits
list(user_id, filters, limit, offset) -> records
delete(id, user_id, hard) -> bool
health() -> { ok, backend, stats }
```

### 10.2 LocalJsonAdapter (V2.0 minimal)

- Réutilise `memories.json`  
- Search = score lexical simple  
- Permet migration douce HUD MemoryPanel  

### 10.3 MemPalaceAdapter (V2.1 spike)

- Palace path **par user** : `~/.mempalace/jarvis/<user_id>/` (ou équivalent data/)  
- Map `wing/room` ↔ metadata MemPalace  
- `content` → drawer verbatim  
- Search → `search_memories`  
- Forget → delete_drawer (via adapter, pas MCP brut)  
- **Jamais** exposer MCP MemPalace directement au réseau foyer sans Policy  

### 10.4 FuturePgAdapter

- Table `memories` + éventuellement pgvector  
- Même contrat  

---

## 11. Hermes

| Aujourd’hui | Cible V2 |
|-------------|----------|
| toolset `memory` autonome | tools qui appellent **Core MemoryAPI** (WS/HTTP interne) ou provider lu via Core |
| MemPalace Hermes provider amont | optionnel **derrière** adapter ; pas double-écriture sauvage |
| `MEMORY.md` | seed / SOUL seulement |

Tools Hermes conceptuels (noms indicatifs) :

```text
jarvis_memory_search
jarvis_memory_recall
jarvis_memory_store_note     # note seule, Policy INFO
# pas de jarvis_memory_forget pour Hermes non-admin
```

---

## 12. HUD / surfaces

- MemoryPanel existant → lire via `list`/`search` API  
- Afficher `title` + snippet ; détail = verbatim  
- Badge backend (`json` / `mempalace`) honnête  
- Child : pas `memory.read` (inchangé tant que Samir ne tranche pas)

---

## 13. Phases d’implémentation (après feu vert code)

| Phase | Contenu | Preuve |
|-------|---------|--------|
| **M0** | Spec gelée (ce doc) | ✅ Samir 2026-08-12 |
| **M1** | `MemoryAPI` + LocalJsonAdapter + Policy admission + smokes | ✅ `_smoke_memory` ALL OK |
| **M2** | Hook Verification → store mission_result | ✅ `_smoke_verification_memory` ALL OK |
| **M2.1** | Wiring live `_execute_intent` + terminal | ✅ `_smoke_verification_wiring` ALL OK |
| **M3** | MemPalaceAdapter spike (palace/user, search) | search « Windows Agent » trouve le record |
| **M4** | Hermes tools → Core API | recall sans write direct |
| **M5** | KG/Closets/Hallways (inspiration) | hors scope tant que M3 non validé |

**STOP entre chaque phase.** Pas de deploy NUC Memory tant que M1+M2 locaux verts.

---

## 14. Hors scope explicite

- Face embeddings / Holomat / enrollment dans Memory  
- Vision objets drawers  
- Alert flood → memory  
- MemPalace MCP exposé tel quel sur Internet  
- Remplacer bus / Policy / Supervisor  

---

## 15. Critères de succès Memory V2

1. Une mission validée produit **exactement un** `mission_result` retrievable.  
2. « Pourquoi Policy avant root ? » retrouve le seed/decision verbatim.  
3. Hermes peut search mais **ne peut pas** hard-delete.  
4. Child ne lit pas la mémoire foyer.  
5. Changer d’adapter (JSON → MemPalace) **sans** changer les callers.  
6. Aucun secret dans les records (smoke grep).  

---

## 16. Décision figée (ce document)

| Item | Statut |
|------|--------|
| MemPalace candidat backend | ✅ |
| `vendor/mempalace/` référence | ✅ |
| Memory API d’abord | ✅ (cette spec) |
| Spike adapter ensuite | ⏳ après validation Samir de M0 |
| Core → MemPalace direct | ❌ |
| Memory contourne Policy | ❌ |

---

**Prochaine action :** review Claude M2.1 → feu vert Samir → M2.2 (observers HA/device plus riches) ou **M3** MemPalaceAdapter.
