# Agentic UI — architecture & décisions stratégiques

> Compléments à `docs/AGENTIC_UI_VENDOR_BRIEF.md` (refs vendor).  
> **Date** : 2026-08-03.  
> **Statut** : propositions + questions ouvertes — **pas encore tranché**.

---

## Philosophie (inchangée, quelle que soit la vision A/B)

- une seule bibliothèque visuelle JARVIS ;
- un registre unique de composants ;
- **aucun JSX généré librement** ;
- l’agent compose uniquement des composants **enregistrés** ;
- le Core conserve toujours l’autorité (Policy Engine + WebSocket `:8765`) ;
- CopilotKit, AG-UI ou tout autre moteur restent **interchangeables** : ils utilisent le protocole de composition défini par JARVIS.

```
IA → Proposition → Policy Engine → Autorisation → Exécution
```

---

## 1. Le registre appartient à JARVIS

Le registre est une **responsabilité produit**, pas CopilotKit, pas Hermes.

```
packages/ui  (ou hud design system)
        │
        ▼
Component Registry   ← source de vérité
        │
        ▼
Hermes / Agent       ← consulte le registre (métadonnées)
        │
        ▼
Core WS (:8765)      ← orchestrateur unique
        │
        ▼
HUD Renderer         ← affiche ComponentSpec
```

CopilotKit (ou tout futur moteur) **consulte** le registre ; il ne le possède pas.

---

## 2. AG-UI = protocole uniquement

**Décision proposée** (à valider) :

- conserver AG-UI comme **format d’échange** (événements / patch d’état) ;
- **ne pas** adopter son architecture interne ;
- **ne pas** connecter Hermes directement au navigateur.

Flux recommandé :

```
Hermes
    │
ComponentSpec JSON  (+ évent. AG-UI events)
    │
Core WebSocket (:8765)
    │
HUD Renderer
```

Le Core reste l’orchestrateur unique. Aucun moteur UI ne parle directement au navigateur.

---

## 3. Métadonnées du registre (enrichies)

Au-delà de `name` / `description` / `props` :

| Champ | Rôle |
|-------|------|
| `category` | famille (system, media, layout…) |
| `permissions` | ex. `terminal.read` — Policy |
| `requiredContext` | ex. `shell`, `camera` |
| `supportedActions` | `copy`, `scroll`, `execute`… |
| `preferredSize` | `small` / `medium` / `large` |
| `priority` | poids de composition |
| `tags` | recherche / matching Planner |

Exemple `Terminal` :

```yaml
name: Terminal
category: system
permissions: [terminal.read]
requiredContext: [shell]
supportedActions: [copy, scroll, execute]
preferredSize: large
```

L’agent raisonne mieux ; le Policy Engine filtre avant rendu / action.

---

## 4. Planner (obligatoire avant composition)

Ne pas faire `Hermes → UI` en direct.

```
Utilisateur
    → Intent
    → Planner
    → Component Composer
    → Policy Engine
    → Core WS
    → Renderer
```

Exemple — « Pourquoi la caméra ne détecte plus les gestes ? »

```
Objectif : Diagnostic caméra
Besoins  : flux vidéo, logs, métriques, historique, actions
```

Puis seulement le Composer sélectionne les composants. Réduit les hallucinations.

> **Point ouvert** : Planner = responsabilité **Hermes** ou **Core** (contrôle des règles de composition) ?

---

## 5. Où poser le code (court terme)

**Ne pas** créer tout de suite `packages/agentic-ui`.

Commencer dans le HUD :

```
hud/src/agentic/
  planner/     # ou stub qui délègue à Hermes/Core
  registry/
  renderer/
  protocol/    # ComponentSpec + mapping AG-UI events
```

Extraire vers `packages/agentic-ui` seulement quand plusieurs apps consomment le moteur.

`packages/ui` (design system unique) reste la cible pour Orb, Terminal, Metric, Chart… — timing monorepo à part.

---

## 6. Vision A vs Vision B (décision stratégique)

### Vision A — Produit d’abord

Pages manuelles (Home, Apps, Settings, Voix, Caméra, Gestes, Calibration, Mission Control, Plugins, Mémoire).  
L’Agentic UI **enrichit** (panneaux / vues temporaires), ne remplace pas.

```
Page Caméra (statique)
+--------------------------------------------+
| Aperçu / Calibration / Réglages            |
|  ┌──────────────────────────────────────┐  |
|  │ Analyse IA (composée)                │  |
|  │ FPS · Logs · Actions                 │  |
|  └──────────────────────────────────────┘  |
+--------------------------------------------+
```

| + | − |
|---|---|
| UX maîtrisée, prévisible | Moins « OS IA » |
| Design figé, peu de risques | Duplication page produit vs composition |

### Vision B — Agentic First

Le menu ne fait plus `ouvrir Camera.jsx` mais **« composer une interface de gestion caméra »**.  
Settings, Apps, Calibration, Voix… = compositions dynamiques depuis le registre + règles + design system.

| + | − |
|---|---|
| Vrai OS IA, adaptatif (matériel, permissions, profil) | UX moins figée, plus de tests |
| Une seule source : registre | Cache / déterminisme / drift à gérer |

### Questions à trancher avant de figer le moteur

1. Pages Apps / Settings / Caméra / Voix : **produit** ou **composées** ?
2. Le menu ouvre une page existante ou demande une composition ?
3. Composition recalculée à chaque ouverture ou **mise en cache** ?
4. Pages déterministes ou adaptatives (contexte, matériel, permissions, profil) ?
5. L’agent peut-il **réorganiser** toute la page ou seulement **ajouter** des panneaux ?
6. Une composition validée par l’utilisateur peut-elle devenir **disposition par défaut** ?
7. Planner : **Hermes** ou **Core** ?

---

## 7. Vision cible (si Agentic UI devient centrale)

```
Utilisateur
    → Hermes
    → Planner
    → Component Registry (packages/ui)
    → Policy Engine
    → Core WebSocket (:8765)
    → HUD Renderer
    → Composition dynamique
```

Les « pages » deviennent des **intentions de navigation** :

- ouvrir les paramètres  
- gérer la caméra  
- administrer les plugins  
- configurer la voix  

---

## 8. Décision stratégique (bloquante)

> JARVIS est-il :
>
> **A)** une application avec quelques fonctionnalités Agentic  
> **ou**  
> **B)** un système d’exploitation IA où chaque écran (Paramètres, Apps, Caméra…) est une composition intelligente depuis le registre ?
>
> Cette décision conditionne `packages/ui`, le protocole Agentic UI, et le rôle du Planner.

**Recommandation opérationnelle en attendant** : démarrer en **Vision A** dans `hud/src/agentic/` (registre + protocol + panneau d’enrichissement sur 1 page produit), tout en concevant le registre et le protocole pour ne pas bloquer un passage à B plus tard.

---

## 9. Lien vendors (lecture)

Voir `docs/AGENTIC_UI_VENDOR_BRIEF.md` :

| Ref | Apporte |
|-----|---------|
| second-brain | AG-UI + catalogue A2UI (composition) |
| human-in-the-loop-rag | HITL + état bidirectionnel |
| eve-analyst | tools / approval / sandbox |
| redis-iris-agent | data live vs mémoire |
| CopilotKit | orchestration (pas design system) |

⚠ Ne pas supprimer / toucher `vendor/second-brain-*` pendant qu’un agent teste le projet.
