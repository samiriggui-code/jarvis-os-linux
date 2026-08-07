# Agentic UI - Surface Runtime

## Objectif

L'Agentic UI de JARVIS n'a pas pour objectif de permettre à un agent de générer librement du code React ou de créer des interfaces arbitraires.

L'objectif est de fournir un runtime de surfaces contrôlées par le système.

L'agent ne crée pas d'interface.

Il produit des événements d'action.
Le Core décide si une représentation visuelle est nécessaire.
Le HUD rend uniquement des surfaces déclarées et validées.

---

# Position dans l'architecture JARVIS

L'Agentic UI intervient après la couche d'exécution et d'événements.

Flux complet actuel :

Utilisateur
↓
Hermes Agent
↓
Raisonnement + Tool Calling
↓
Hermes Events (SSE)
↓
HermesBridge
↓
Core Event Bus
↓
AgentToolEvent / ToolEvent
↓
Surface Decision Layer
↓
Surface Document
↓
SurfaceBroadcaster.snapshot()
↓
SURFACE_SNAPSHOT WebSocket
↓
AgentSurface Runtime
↓
Surface Registry
↓
React Rendering HUD

L'agent ne parle jamais directement au HUD.

---

# Séparation des responsabilités

## Hermes

Responsabilité :

* raisonnement
* sélection des outils
* exécution des tool calls

Hermes expose déjà les événements via SSE :

* `/v1/runs/events`
* `stream:true` sur `/v1/chat/completions`

Le Core consomme ces événements.

Le raisonnement interne du modèle ne doit jamais être exposé au HUD.

Filtrer :

* reasoning.*
* contenu privé du raisonnement
* données internes modèle

Exposer uniquement :

* outil utilisé
* état d'exécution
* progression
* résultat synthétique
* erreur

---

# Phase 1 - Tool Bus Governance

Phase réalisée.

Le Core possède maintenant :

* ToolEvent journal
* émission d'événements vers le HUD
* suivi started/completed/failed/not_executable
* séparation Core / Hermes

Fichiers principaux :

* `tool_events.py`
* `db/models.py`
* `policy.py`
* `capabilities.py`

Objectif :

Observer et gouverner les actions sans dupliquer Hermes.

---

# Phase 2 - Hermes Events Integration

Phase réalisée.

Flux actuel :

Hermes

↓

SSE events

↓

HermesBridge

↓

AgentToolEvent

↓

Core Event Bus

↓

ToolEvent

↓

HUD / journal

Le Core agit comme adaptateur.

Il ne reconstruit pas le système d'outils Hermes.

---

# Phase 3 - Surface Decision Layer

Phase réalisée partiellement.

Découverte importante :

Le runtime de surfaces existe déjà.

Il n'est pas nécessaire de créer un nouveau Surface Registry.

Le bloc manquant était :

ToolEvent → décision visuelle

La nouvelle chaîne :

ToolEvent

↓

Surface Decision

↓

Surface ID / App ID

↓

Surface Document

↓

SURFACE_SNAPSHOT

↓

AgentSurface

↓

React Rendering

---

# Surface Runtime existant

Le HUD possède déjà :

* AgentSurface
* Surface Registry
* renderers
* documents de surfaces
* validation de documents

Le protocole réel utilisé est :

SURFACE_SNAPSHOT

et non un nouveau protocole `surface.create`.

---

# Exemple réel

Entrée :

```json
{
"type": "tool.started",
"tool": "system.cpu"
}
```

Décision Core :

```text
tool system.cpu
        ↓
surface_id = monitor
        ↓
component = SystemMonitor
```

Document produit :

```json
{
  "surfaces": {
    "monitor": {
      "root": ["mon-main"],
      "components": {
        "mon-main": {
          "name": "SystemMonitor",
          "props": {},
          "state": "idle"
        }
      }
    }
  }
}
```

Puis :

```
SurfaceBroadcaster.snapshot()
        ↓
SURFACE_SNAPSHOT
        ↓
AgentSurface(surfaceId="monitor")
        ↓
SystemMonitor React
```

---

# Le vrai problème résolu

Le problème n'était pas :

* React
* WebSocket
* Surface Registry
* composants HUD

Le problème était l'absence d'une couche :

```
ToolEvent
    ↓
Surface Decision
```

Cette couche permet au système de transformer une action en représentation visuelle.

---

# Architecture cible finale

```
Hermes
 |
 | tool events
 ↓
HermesBridge
 |
 ↓
Core Event Bus
 |
 ↓
ToolEvent
 |
 ↓
Surface Decision Engine
 |
 ↓
Surface Document
 |
 ↓
SurfaceBroadcaster
 |
 ↓
SURFACE_SNAPSHOT
 |
 ↓
AgentSurface Runtime
 |
 ↓
Surface Registry
 |
 ↓
React HUD
```

---

# Prochaines évolutions

Ajouter des règles Surface Decision :

## Caméra

```
camera.capture
        ↓
camera
        ↓
CameraPreview
```

## Enrôlement facial

```
face.enrollment
        ↓
camera.enrollment
        ↓
FaceEnrollmentSurface
```

## Validation humaine

```
policy.needs_confirmation
        ↓
approval.card
        ↓
ApprovalSurface
```

---

# Règle fondamentale

Ne jamais permettre à l'agent de créer une interface arbitraire.

Le modèle demande une intention visuelle.

Le Core choisit une surface autorisée.

Le HUD rend uniquement ce qui est enregistré dans le catalogue.
