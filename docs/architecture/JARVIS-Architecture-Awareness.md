# JARVIS — Architecture Awareness / Self-Awareness

> **Statut :** **D2.2 ✅** · D2.1 contrat ✅ · D2 ✅ · D3 ✅ · D1 ✅ · `explain_live()` via Provider Manager · **pas Hermes / voix / HUD**.  
> **Date :** 2026-08-13  
> **Amendement :** intègre les BLOCKERS / CORRECTIONS de la review indépendante (PHASE C) — checklist complète ci-dessous.  
> **Prérequis :** audit read-only · Memory V2 M0–M2.1 · Verification pipeline.  
> **Code :** `core/jarvis_core/architecture/` · smokes snapshot / audit / explain / llm_payload / llm_live · **STOP** avant Hermes/voix/HUD/probes/propose.  
> **D2.2 :** `explain_live()` — LLM via AI Provider Manager, borné au payload D2.1, `validate_llm_explanation` ; pas de wiring vocal/HUD.

---

## Changelog B → B′

| # | Correction | Section B′ |
|---|------------|------------|
| 1 | Freshness : `snapshot_id`, `schema_version`, `as_of`, `ttl_s`/`stale_after_s`, FRESH/STALE/PARTIAL, `observed_at` | §5 |
| 2 | Contrat probes IN_MEMORY / BACKGROUND_HTTP / ON_DEMAND_AUDIT ; snapshot() non bloquant | §7 |
| 3 | Invariant machine AVAILABLE | §4 |
| 4 | Pas de 4ᵉ Runtime Registry ; Snapshot = vue consolidée ; `Capability.available` ≠ Architecture AVAILABLE | §3, §8 |
| 5 | Conflits DOC/CODE/OBSERVED via `claims[]` ; pas de résolution silencieuse | §9 |
| 6 | `connections[]` / `depends_on[]` pour chaînes Netflix / Apple TV | §10 |
| 7 | Anti-hallucination LLM explain (D2) | §14 |
| 8 | Ordre D1 → D3 → D2 → propose → F | §16 |
| 9 | Redaction secrets (principes MemoryPolicy) | §11 |
| 10 | `schema_version` | §5 |
| 11 | Questions self-awareness listées, non implémentées | §0, §15 |
| 12 | `capability.propose` hors D1 ; recettes CODE/DOC only | §13 |
| 13 | Graph/HUD/Graphify/NeuralMap clarifiés | §12 |
| 14 | `limitations[]` obligatoires | §5, §5.4 |

---

## 0. Objectif

Donner à JARVIS une connaissance **factuelle** de son écosystème :

machines · services · agents · LLM · outils · connexions · capacités · état réel.

JARVIS **ne doit pas deviner**.

### Questions cibles (spécifiées, **non implémentées** en B′/D1)

| Question | Mécanisme futur |
|----------|-----------------|
| Comment fonctionnes-tu ? | Template parcours CODE + snapshot |
| Où tourne Hermes ? | claims + OBSERVED health |
| Quels agents sont connectés ? | DeviceRegistry → snapshot.devices/agents |
| Quels services / LLM sont disponibles ? | capabilities/llms avec invariant AVAILABLE |
| Pourquoi cette capacité ne fonctionne pas ? | `architecture.audit()` + `depends_on` |
| Que manque-t-il pour réaliser X ? | `capability.propose` (post-D3) |
| Apple TV / Netflix ? | chaînes + états honnêtes |

---

## 1. Architecture logique (B′)

```text
                 ENVIRONNEMENT RÉEL
                        │
        ┌───────────────┼───────────────┐
        │               │               │
   IN_MEMORY      BACKGROUND_HTTP   ON_DEMAND_AUDIT
   (DeviceReg,     (health HTTP      (SSH, scans,
    Supervisor,     async → store)    HA deep, …)
    env/CODE/DOC)
        │               │               │
        └───────────────┼───────────────┘
                        ↓
                 Probe / observation store
                 (cache d'observations)
                        ↓
              ArchitectureSnapshot()
              = compilation read-only
              = SOURCE DE VÉRITÉ runtime
                        │
        ┌───────────────┼───────────────┐
        ↓               ↓               ↓
   Core/Policy    architecture.audit  LLM explain (D2)
   Verification   (D3, déterministe)  borné au snapshot
        │                               │
        ↓                               ↓
   HUD / Voice / Missions  ←  projections, jamais vérité
```

**Il n’y a pas de Runtime Capability Registry séparé en D1.**  
`ArchitectureSnapshot.capabilities[]` **est** la vue de disponibilité runtime.

---

## 2. Séparation des concepts (non négociable)

| Concept | Rôle | N’est pas |
|---------|------|-----------|
| **Core** | Propriétaire de la vérité opérationnelle | — |
| **LLM / Hermes (explicateur)** | Interprète du snapshot (D2) | Source de vérité |
| **Hermes (runtime)** | Exécution / outillage | Owner architecture |
| **Memory** | Historique, décisions, expériences | État live |
| **Verification** | Preuve qu’une **action** a réussi | Inventaire global |
| **ArchitectureSnapshot** | État runtime consolidé (vue) | Memory / Policy / Verification |

```text
MEMORY ≠ ARCHITECTURE SNAPSHOT
VERIFICATION ≠ ARCHITECTURE SNAPSHOT
LLM ≠ VÉRITÉ
HERMES ≠ OWNER ARCHITECTURE
Capability.available (capabilities.py) ≠ Architecture AVAILABLE
```

Un souvenir Memory n’autorise jamais une action. Policy souveraine.  
Verification = seul gate `RESULT_VALIDATED` (Memory V2).  
Observations du snapshot = preuves d’**inventaire/santé**, pas de succès d’action.

---

## 3. Couches capabilities (pas de 4ᵉ magasin)

| Couche | Existe (CODE) | Rôle |
|--------|---------------|------|
| **IntentCapability** | `capabilities.py` | Catalogue produit (intent → owner/risk/toolset) |
| **HostCapability** | `devices.py` | Caps physiques annoncées par devices |
| **DeviceRegistry** | `devices.py` | Devices connectés / online / TTL |
| **ArchitectureSnapshot.capabilities[]** | à créer (D1) | **Seule** vue runtime availability |

### Interdiction sémantique

Le property `Capability.available` actuel (règles env / owner — **pas** un probe) :

- peut rester pour le routing produit existant ;
- **ne doit jamais** être exposé ni traduit comme `status: AVAILABLE` Architecture Awareness ;
- en D1, le compilateur ignore ce flag pour le statut runtime (utilise probes + catalogues séparément).

---

## 4. États · qualifiers · invariant AVAILABLE

### Status primaire

| Status | Signification |
|--------|----------------|
| `AVAILABLE` | Observé utilisable **maintenant** |
| `CONFIGURED` | Config présent (env/clé/URL) |
| `DISCOVERED` | Découvert, non validé |
| `PLANNED` | Vision / cahier, pas runtime |
| `DEGRADED` | Joignable partiel |
| `OFFLINE` | Connu, injoignable au dernier probe |
| `UNCONFIGURED` | Attendu sans config |
| `UNKNOWN` | Insuffisant pour conclure |
| `BLOCKED` | Policy / rôle / flag |

### Qualifiers (flags additionnels, non exclusifs)

`UNPAIRED` · `STALE` · `PARTIAL` · `CONFLICT` · …

Exemple Apple TV : `status=DISCOVERED`, `qualifiers=["UNPAIRED"]`.  
Exemple Ollama : `status=OFFLINE`, `qualifiers=[]`, avec claim CONFIGURED dans `claims[]` ou champ `configured: true`.

### Invariant machine (smoke D1 obligatoire)

```text
AVAILABLE  ⇒  provenance == OBSERVED
           AND  len(evidence) > 0
           AND  stale == false
```

Interdit de produire AVAILABLE depuis : DOC seule, CODE seul, env, IntentCapability, `Capability.available`, texte LLM, Memory.

**Aucun LLM** ne peut transformer UNKNOWN/CONFIGURED/DISCOVERED/STALE en AVAILABLE.

---

## 5. ArchitectureSnapshot — contrat

### 5.1 Identité & version

| Champ | Rôle |
|-------|------|
| `schema_version` | Version du contrat (ex. `"1.0.0"`) — évolutif sans casser HUD/LLM |
| `snapshot_id` | Id unique de cette compilation |
| `timestamp` / `as_of` | Instant de compilation (ISO8601) |
| `freshness` | Agrégat snapshot : `FRESH` \| `STALE` \| `PARTIAL` |

### 5.2 Freshness

| Niveau | Signification |
|--------|----------------|
| `FRESH` | Données critiques dans leur TTL famille |
| `STALE` | Au moins une famille OBSERVED hors TTL ; dernières valeurs encore visibles |
| `PARTIAL` | Partition / probe manquante / sous-ensemble seulement |

**Règle :** une entrée avec `stale: true` **reste lisible** mais **ne peut pas** être `AVAILABLE`.  
Si elle était AVAILABLE et expire → rétrograder (ex. `OFFLINE` ou conserver dernier status non-AVAILABLE + qualifier `STALE`).

### Champs de fraîcheur (obligatoires sur les entrées OBSERVED)

| Champ | Rôle |
|-------|------|
| `observed_at` | Instant de la dernière observation (ISO8601) |
| `ttl_s` | Durée de validité de cette famille / entrée (secondes) |
| `stale_after_s` | Âge max avant `stale=true` (souvent = `ttl_s` ; peut être plus strict) |
| `stale` | `now - observed_at > stale_after_s` |

Freshness **par famille** (indicatif D1 — valeurs exactes configurables, pas magiques) :

| Famille | Source typique | TTL indicatif |
|---------|----------------|---------------|
| devices/agents | DeviceRegistry | aligné TTL registry (~120s) |
| supervisor services | Supervisor in-memory | court |
| docs/topology claims | fichiers versionnés | pas d’expiry OBSERVED |
| llm probes | BACKGROUND_HTTP store | 60–300s |
| remote/SSH | ON_DEMAND_AUDIT only | hors snapshot sync |

Chaque observation porte `observed_at`.  
Chaque entrée runtime porte `stale: bool` dérivé de `observed_at` + TTL famille.

### 5.3 Schéma minimal (schema_version 1.0.0)

```json
{
  "schema_version": "1.0.0",
  "snapshot_id": "uuid",
  "timestamp": "ISO8601",
  "as_of": "ISO8601",
  "freshness": "FRESH|STALE|PARTIAL",
  "core": {},
  "machines": [],
  "devices": [],
  "agents": [],
  "services": [],
  "tools": [],
  "llms": [],
  "providers": [],
  "capabilities": [],
  "connections": [],
  "depends_on": [],
  "health": {},
  "limitations": [],
  "evidence": []
}
```

### 5.4 `limitations[]` (obligatoire)

Le snapshot **doit** exposer clairement :

- données `UNKNOWN`
- données `STALE`
- partition réseau / Core isolé
- probe indisponible ou jamais exécutée
- conflits documentaires (`conflict: true`)
- capacités non observées
- familles absentes du compilateur D1 (honnêteté de couverture)

### 5.5 Entrée capability (exemple)

```json
{
  "id": "home.control",
  "provider": "home_assistant",
  "status": "CONFIGURED",
  "qualifiers": [],
  "configured": true,
  "stale": false,
  "device_id": "pi-salon",
  "observed_at": null,
  "provenance": "CODE",
  "evidence": [],
  "claims": []
}
```

AVAILABLE valide :

```json
{
  "status": "AVAILABLE",
  "provenance": "OBSERVED",
  "stale": false,
  "observed_at": "ISO8601",
  "evidence": [{ "kind": "http_health", "at": "ISO8601", "ok": true, "target": "redacted" }]
}
```

---

## 6. Compilation vs probes — Snapshot ≠ datastore

```text
architecture.snapshot()  =
  lecture Probe store + DeviceRegistry + Supervisor + catalogues CODE/DOC
  + compilation déterministe
  + redaction secrets
  + calcul freshness / stale / limitations
```

**ArchitectureSnapshot est une vue compilée**, pas un nouveau magasin persistant de vérité parallèle.

- Les **sources** restent : DeviceRegistry, Supervisor, catalogues Intent/Host, docs claims, probe store (cache d’observations).
- `snapshot()` **projette** ces sources en JSON versionné à un instant `as_of`.
- On ne duplique pas durablement l’état devices/services dans une « Architecture DB » en D1.
- Persister un snapshot (fichier/log) pour audit/debug est optionnel et **n’en fait pas** la source live — la recompilation à la demande (ou cache court avec `stale_after_s`) prime.

**D1 :** read-only, **rapide**, **non bloquant**.  
Aucun effet de bord d’exécution métier.  
Aucun SSH / scan lourd / HA deep / Ollama sync dans `snapshot()`.

---

## 7. Contrat des probes

| Catégorie | Exemples | Quand | Dans `snapshot()` sync ? |
|-----------|----------|-------|---------------------------|
| **IN_MEMORY** | DeviceRegistry, Supervisor, env « configured? », IntentCapability catalog, docs claims | Toujours | **Oui** (lecture seule) |
| **BACKGROUND_HTTP** | Hermes `/health`, voice probe, HA/Plex `health()`, Ollama `/api/tags`, OpenRouter key check | Async / périodique → **probe store** | **Non** — lit le store seulement |
| **ON_DEMAND_AUDIT** | SSH `remote_exec`, ADB check, inventaire HA entities, scans | `architecture.audit()` ou job explicite | **Non** |

### Règles

1. Panne d’un nœud → ce nœud `OFFLINE`/`STALE`/`UNKNOWN` ; **pas** wipe global en UNKNOWN.  
2. Partition → freshness `PARTIAL` + limitation dédiée.  
3. Probe jamais lancée → pas d’AVAILABLE ; limitation « probe not run ».  
4. D1 n’implémente pas forcément tous les BACKGROUND probes — ceux absents restent UNKNOWN + limitation de couverture.

---

## 8. Sources d’agrégation D1 (réelles)

| Source | Couche | Catégorie probe |
|--------|--------|-----------------|
| `DeviceRegistry` | devices/agents | IN_MEMORY |
| `Supervisor` | health subset | IN_MEMORY |
| `capabilities.py` (sans `.available` runtime) | catalogue intents | IN_MEMORY (CODE) |
| HostCapability sur devices | tools/caps physiques | IN_MEMORY |
| Docs host map + skill claims | machines claims | IN_MEMORY (DOC) |
| Probe store (si déjà rempli) | services/llms | lecture cache |
| Hermes/HA/Ollama HTTP | — | BACKGROUND (hors sync snapshot) |
| `remote_exec` | — | ON_DEMAND_AUDIT only |

---

## 9. Conflits DOC / CODE / OBSERVED

Ne **jamais** résoudre silencieusement.

### Schéma `claims[]`

```json
{
  "id": "hermes.host",
  "claims": [
    {
      "source": "doc:JARVIS_CONTEXT",
      "role": "hermes_host",
      "value": "nuc",
      "provenance": "DOC"
    },
    {
      "source": "doc:ecosystem-hosts",
      "role": "hermes_host",
      "value": "vps",
      "provenance": "DOC"
    }
  ],
  "conflict": true,
  "resolved_by": null,
  "runtime_value": null,
  "status": "UNKNOWN",
  "limitations": ["doc_conflict:hermes_host"]
}
```

| `resolved_by` | Signification |
|---------------|----------------|
| `null` | Conflit ouvert |
| `observed_health` | Un endpoint OBSERVED tranche la **réalité ops** |
| `samir_decision` | Décision figée (`DECISIONS.md`) |

Même si `observed_health` fixe `runtime_value` (ex. Hermes répond sur NUC) :

- le **conflit DOC reste visible** dans `claims[]` / `limitations[]` jusqu’à correction des docs/skills ;
- on ne réécrit pas l’histoire documentaire en silence.

Cas connu B′ : `deploy/hermes/skills/ecosystem-hosts` (Hermes/Dashboard sur VPS) vs `docs/JARVIS_CONTEXT.md` / NUC_TREE (Core/Hermes sur NUC).

---

## 10. Connections & dependencies

### `connections[]` (minimal)

```json
{
  "id": "core-to-pi",
  "from": "core",
  "to": "device:pi-salon",
  "kind": "ws_or_http",
  "provenance": "CODE",
  "status": "UNKNOWN"
}
```

### `depends_on[]` (chaînes de capacité)

```json
{
  "capability_id": "media.netflix.freebox",
  "chain": [
    "core",
    "device:pi-salon",
    "service:adb",
    "device:freebox-player",
    "app:netflix"
  ],
  "provenance": "DOC"
}
```

```json
{
  "capability_id": "apple_tv.control",
  "chain": [
    "core",
    "service:home_assistant",
    "device:apple_tv"
  ],
  "provenance": "DOC"
}
```

`architecture.audit()` (D3) marche la chaîne : premier maillon non AVAILABLE/OBSERVED → explication déterministe.

D1 peut embarquer des chaînes **DOC/CODE** même si tous les nœuds sont UNKNOWN — l’honnêteté prime.

---

## 11. Secrets & redaction

Aligné sur les principes **MemoryPolicy** (`secret_detected` : clés API, bearer, passwords, private keys, tokens…).

Le snapshot et ses `evidence[]` **doivent** être redactés :

- pas de token HA / Hermes / OpenRouter / ElevenLabs en clair ;
- pas de password, clé SSH, PIN ;
- URLs : host/path OK si besoin ; query secrets strip ;
- sorties de probes : scrub avant insertion.

Un snapshot contenant un secret = **bug** (smoke D1).

---

## 12. Graph / HUD / Graphify

| Couche | Rôle |
|--------|------|
| **ArchitectureSnapshot** | Source de vérité runtime |
| **Runtime graph** | Projection du snapshot (PHASE G — graphe interne léger recommandé) |
| **HUD** | Projection visuelle / agentic (PHASE F) — **jamais** vérité |
| **Graphify CLI** | CODE GRAPH (AST/imports) — **outil séparé**, hors D1 |
| **NeuralMap hardcodé** (`hermesNodes.ts`) | Non-source de vérité ; ne pas l’étendre comme topologie réelle |

Aucune intégration Graphify en D1.  
Corrélation CODE GRAPH ↔ RUNTIME GRAPH = option future explicite, pas fusion.

---

## 13. `capability.propose()` — hors D1

Spécifié pour plus tard (après D3 au plus tôt) :

```text
capability.propose(id) ->
  REQUIRED, CURRENT, REASON, DEPENDENCIES, SOLUTIONS, RISKS, IMPACT
```

Contraintes :

- solutions depuis **recettes versionnées** connues de Core (DOC/CODE allowlist) — **pas** invention libre LLM ;
- hors catalogue de recettes → `UNKNOWN` / « je dois vérifier », pas d’install inventée ;
- flux `propose → Policy → approbation → exécution` ;
- **aucune** install automatique sensible.

Hors scope D1 / D3 initiaux.

---

## 14. Anti-hallucination / Explain (D2)

```text
ArchitectureSnapshot → architecture.audit() → explain() → (optional bounded LLM) → réponse
```

**D2 livré** (`core/jarvis_core/architecture/explain.py`) :

1. Entrée : snapshot redacté → injecte `snapshot_id` + `timestamp`/`as_of` dans Report **et** `llm_bound_payload`.  
2. Diagnostics via `architecture.audit(snapshot)`.  
3. Parcours « comment fonctionnes-tu » = `ARCHITECTURE_WALKTHROUGH_V1` (USER→…→Memory/HUD/Voice).  
4. `hermes_history` / `memory_hints` **ignorés** (jamais dans le bound payload).  
5. `validate_llm_explanation` : rejette résolution conflit Hermes, invention Ghost, promotion UNKNOWN→AVAILABLE, succès d'action sans Verification.  
6. Intent `action_outcome` : device ONLINE ≠ preuve d'action.  
7. Aucun appel réseau interne ; `llm_formatter` = injection caller (tests). D2.2 = `explain_live()` via Provider Manager.  

Smoke : `_smoke_architecture_explain`.

---

## 14.1 Contrat D2.1 — ancrage LLM (payload pur)

```text
ArchitectureSnapshot + ArchitectureAudit
        → build_llm_bound_payload(snapshot, audit)
        → llm_bound_payload
        → (futur) LLM
```

**Statut :** contrat + constructeur purs livrés. Appel LLM = D2.2 (`explain_live`), pas dans ce constructeur.

### API

```python
from jarvis_core.architecture import build_llm_bound_payload, audit, snapshot

snap = snapshot(...)
aud = audit(snap)
payload = build_llm_bound_payload(snap, aud)  # déterministe, JSON, redacté
```

Module : `core/jarvis_core/architecture/llm_payload.py`  
Smoke : `_smoke_architecture_llm_payload`

### Contenu minimal du payload

| Champ | Rôle |
|-------|------|
| `schema_version` | Contrat payload (`LLM_BOUND_SCHEMA_VERSION`) |
| `snapshot_id` | Ancre identité snapshot |
| `timestamp` / `as_of` | Instant de compilation |
| `freshness` / `stale` | Fraîcheur snapshot |
| `audit` | Rapport audit (diagnostics, certainty, ecosystem) |
| `limitations` | Union snapshot + audit + flags D2.1 |
| `provenance` | Index id → provenance/status par famille |
| `evidence` | Evidence non sensibles (redactées) |
| `connections` / `depends_on` | Topologie DOC/CODE du snapshot |
| `conflicts` | Conflits DOC non résolus (`resolved_by` intact) |
| `components` | Index mince machines/devices/… (status non promu) |
| `meta` | `llm_called=false`, `network_probes=false`, `contract=D2.1` |

### Interdits (constructeur)

- Aucun nœud inventé (ex. `agent:ghost` absent du snapshot → absent du payload).  
- Aucune promotion `UNKNOWN`/`CONFIGURED` → `AVAILABLE`.  
- Aucune résolution de conflit DOC.  
- Aucun secret en clair.  
- Aucun réseau / SSH / Memory / Hermes / LLM.  
- Aucune mutation du snapshot/audit d'entrée.  
- **Pas** de mémoire conversationnelle comme source de vérité.

### Séparation D2 explain vs D2.1 ancre

| Couche | Fonction | Rôle |
|--------|----------|------|
| D2 explain | `explain()` / `build_explain_llm_context` | Templates + question + facts dérivés |
| D2.1 ancre | `build_llm_bound_payload(snapshot, audit)` | Payload pur consommé par D2.2 |

`explain().llm_bound_payload["anchor"]` embarque l'ancre D2.1 quand explain tourne.

**STOP D2.1 :** l'ancre reste pure (pas d'appel réseau dans le constructeur). L'appel LLM est D2.2.

---

## 14.2 D2.2 — LLM live contrôlé

```text
explain(snapshot, question)
  → llm_bound_payload (ancre D2.1 + contexte explain)
  → prompt_from_bound_payload()
  → AIProviderManager.complete()   # ou complete= injectable
  → validate_llm_explanation()
  → réponse LLM  |  fallback template si rejet / erreur / mode SYSTEM
```

**API**

```python
from jarvis_core.architecture import explain_live

report = await explain_live(snap, "Où tourne Hermes ?")
# tests : complete=fake_async, skip_llm=True
```

Module : `core/jarvis_core/architecture/llm_live.py`  
Smoke : `_smoke_architecture_llm_live` (provider **injecté**, pas de réseau par défaut)

| Règle | Garantie |
|-------|----------|
| Source | Uniquement le payload borné (ancre D2.1) |
| Provider | `AIProviderManager` — jamais OpenRouter/Ollama en dur |
| Mode SYSTEM | pas d'appel, template D2 |
| Rejet anti-hallucination | fallback `explanation_template` |
| Erreur réseau / provider | fallback template, `meta.llm_error` |
| Hors scope D2.2 | Hermes · voix · HUD · WS · probes · HA · propose |

**STOP D2.2 :** pas de branchement vocal / HUD / Hermes / D3.1 sans feu vert.

Intent Core livré (2026-08-13) : `architecture.explain` — joignable depuis le chat (`match_intent` → `chat_reply`, pas de TTS/HUD). Smoke `_smoke_architecture_intent`.

---

## 15. `architecture.audit()` (D3)

```text
architecture.audit(snapshot) -> AuditReport
```

- Déterministe (pas de LLM).  
- **D3.0 livré :** consomme uniquement un `ArchitectureSnapshot` — **pas** de ON_DEMAND_AUDIT / SSH / HTTP dans ce livrable (feu vert D3 explicite).  
- B′ autorise ON_DEMAND budgeté plus tard (D3.1) — **hors scope** actuel.  
- Sorties : `CONNECTED` · `DEGRADED` · `OFFLINE` · `MISSING` · `UNCONFIGURED` · `UNKNOWN` + preuves.  
- Marche `depends_on` / `connections`.  
- Module : `core/jarvis_core/architecture/audit.py` · smoke `_smoke_architecture_audit`.

Exemple Netflix : Pi AVAILABLE, ADB UNKNOWN → chaîne non validée — **pas** « Netflix lancé » sur `ok: true` executor.

Observations Architecture **aident** Verification ; **ne remplacent pas** `RESULT_VALIDATED`.  
Interdit : audit → `MemoryAPI.store(mission_result)` direct.

---

## 16. Ordre des phases (corrigé)

| Phase | Contenu | Code ? |
|-------|---------|--------|
| A | Audit READ ONLY | ✅ |
| B / B′ | Spec + amendement review | **doc only** |
| C′ | Review indépendante de **B′** | aucun code |
| **D1** | `architecture.snapshot()` read-only, invariants, claims, connections DOC, redaction | oui après GO |
| **D3** | `architecture.audit()` déterministe | oui |
| **D2** | Explain LLM **borné** au snapshot | oui |
| **D2.2** | `explain_live()` via Provider Manager + `validate_llm_explanation` | oui |
| propose | `capability.propose` + recettes | plus tard |
| E | Observations → Verification (candidats) | plus tard |
| F | HUD Architecture View | plus tard |
| G | Runtime graph interne ; Graphify option CODE | plus tard |

```text
D1 → D3 → D2 → (propose) → F
```

(Phases E Verification-bridge et G runtime graph restent optionnelles / postérieures ; elles ne précèdent pas F.)

**D1 + D3 + D2.0 + D2.1 + D2.2 livrés** (2026-08-13). **STOP** avant propose / HUD / D3.1 probes / branchement vocal / Hermes sans feu vert.

---

## 17. Hors scope jusqu’à D1 inclus

- Deploy NUC / Pi / VPS  
- MemPalace / Memory M3  
- Remplacement Hermes / changement Policy globale  
- Holomat / FaceEngine  
- Auto-pairing Apple TV  
- Intégration Graphify  
- Explain LLM  
- `capability.propose` runtime  
- Refactor NeuralMap comme vérité  
- SSH / HA deep / Ollama **dans** `snapshot()` sync  

---

## 18. Critères de succès

### D1

1. `schema_version` + `snapshot_id` + `freshness` présents.  
2. Invariant AVAILABLE tenu (smoke).  
3. Aucun secret dans le JSON (smoke).  
4. Conflit Hermes host représenté (`conflict: true`, pas de choix silencieux).  
5. `Capability.available` non mappé vers Architecture AVAILABLE.  
6. `limitations[]` non vide si couverture partielle.  
7. `snapshot()` ne fait pas d’appel SSH/HA/Ollama bloquant.

### D3

8. ✅ Audit Netflix/Apple TV explique via `depends_on` sans LLM (`_smoke_architecture_audit`).

### D2

9. ✅ Smoke anti-invention composant absent (Ghost Agent).  
10. ✅ Explain cite `snapshot_id` ; ne promote pas UNKNOWN → AVAILABLE.

---

## 19. Décisions figées (B′)

| Item | Statut |
|------|--------|
| Core owner vérité ops | ✅ |
| Snapshot = source de vérité runtime (pas 4ᵉ registry) | ✅ |
| LLM = interprète borné (D2) | ✅ |
| AVAILABLE invariant machine | ✅ |
| Probes catégorisées ; snapshot non bloquant | ✅ |
| Claims / conflits DOC visibles | ✅ |
| Secrets redactés | ✅ |
| Ordre D1→D3→D2 | ✅ |
| Graphify / NeuralMap ≠ vérité runtime | ✅ |
| Runtime graph = projection snapshot | ✅ |
| propose / HUD / Graphify intégration | ❌ hors D1 |

---

## 20. Contradictions restantes (honnêteté)

| Item | État |
|------|------|
| Skill `ecosystem-hosts` vs NUC_TREE | **Représenté** en claims ; **pas** corrigé dans les fichiers skill/docs (correction humaine / DECISIONS séparée) |
| `Capability.available` legacy | Reste dans le code produit ; B′ interdit son usage Architecture — dette à documenter à l’implémentation D1 |
| Mission Control HOME | Toujours ⚠️ absent comme package — hors Awareness |
| Couverture BACKGROUND probes D1 | Volontairement partielle → `limitations[]` |
| Chaînes `depends_on` Netflix/ADB | DOC en D1 ; probes ADB = ON_DEMAND plus tard |

Ces points **n’empêchent pas** de figer B′ ; ils doivent rester visibles dans `limitations` / dette.

---

## 21. Checklist d’implémentation D1 (sans interprétation)

Livrable **D1 ✅** (2026-08-13) :

1. ✅ Module `core/jarvis_core/architecture/` — `snapshot() -> dict` · `schema_version: "1.0.0"`.  
2. ✅ Lecture **uniquement** IN_MEMORY + probe store déjà rempli ; **zéro** appel SSH/HA/Ollama/Hermes HTTP synchrone dans `snapshot()`.  
3. ✅ Rempli : `schema_version`, `snapshot_id`, `timestamp`/`as_of`, `freshness`, `machines` (claims Hermes conflict), `devices`/`agents` DeviceRegistry, `capabilities[]` (catalogue CODE sans mapper `.available`), `connections[]`/`depends_on[]` DOC Netflix/Apple TV, `limitations[]`, redaction.  
4. ✅ `assert_available_invariant` + `enforce_available_or_downgrade` à la compilation + smoke.  
5. ✅ TTL : entrées OBSERVED portent `observed_at`, `ttl_s`, `stale_after_s`, `stale`.  
6. ✅ Smokes `_smoke_architecture_snapshot` : invariant AVAILABLE ; no secrets ; conflict hermes.host `conflict=true` `resolved_by=null` ; snapshot() mock sans réseau.  

Hors D1 : audit ON_DEMAND, explain LLM, propose, HUD, Graphify, BACKGROUND workers (D1.1 / D3).

---

**D2.0 ✅** (2026-08-13) : `architecture.explain` déterministe + smokes.

**Prochaine étape (hors feu vert actuel) :** propose / HUD / branchement vocal / LLM formatter live / D3.1 ON_DEMAND — **aucun** sans go Samir.
