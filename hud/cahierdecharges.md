# Cahier des charges — JARVIS OS

> Document vivant : structuré à partir des échanges de conception. D'autres parties seront ajoutées et intégrées au fur et à mesure.

## 1. Vision

JARVIS n'est pas qu'un assistant sur PC : l'objectif est un véritable système d'exploitation d'assistance, qui découvre automatiquement les équipements de la maison et de la machine locale, les configure avec l'accord de l'utilisateur, les contrôle quand c'est possible, et reste utilisable même en cas de panne partielle (dégradation progressive plutôt que panne totale).

Vision produit (Iron Man) : **pas seulement des commandes vocales** — un système qui comprend le contexte, garde une **mémoire permanente**, orchestre des **agents** et contrôle les outils de l'utilisateur. Rôles :

| Pièce | Rôle |
|-------|------|
| **JARVIS** | Interface intelligente + mémoire utilisateur + voix / HUD |
| **Hermes** | Orchestrateur d'agents (reçoit, choisit, exécute, met à jour la mémoire) |
| **Core (NUC)** | Cerveau central, autorité, auth, policy, Postgres — **survit sans HUD** |
| **Agents** | Exécutants spécialisés (maison, média, dev, services…) |
| **Mission Control DEV** | Cockpit d'orchestration logicielle — projets, Cursor, agents (§15.1.1) |
| **Mission Control HOME** | Cockpit du foyer — domotique, sécurité, tablette murale (§15.1.2) |
| **HUD** | Affichage temps réel ; commandes simples = voix seule |

> Les deux cockpits sont **distincts** et ne partagent que le Core. Le nom « Mission Control » nu ne désigne rien : toujours préciser DEV ou HOME (§15.1).

Flux canonique : Utilisateur → HUD / cockpit → Hermes → Agents → résultat → mémoire (§15). Détail topologie machines : guide `docs/INSTALLATION_DEPLOIEMENT.md` + §14.

### 1.1 Base upstream — ne pas refaire le moteur

Point de départ produit : [eadmin2/jarvis_ai](https://github.com/eadmin2/jarvis_ai) (référence locale : `vendor/refs/jarvis_ai/`). Ce dépôt fournit déjà une base JARVIS autour de [Hermes Agent](https://github.com/NousResearch/hermes-agent) (NousResearch) :

- Hermes Agent (cerveau agentique), mémoire, outils, skills, sessions persistantes
- pipeline voix (Whisper STT local, TTS, barge-in / STOP, WebSocket)
- proxy Hermes, contrôle des actions agent (approvals), plugins HUD
- HUD navigateur + dashboard + wizard / installation (à **remplacer** côté front — §1.2)

**Objectif** : ne pas refaire le moteur. Transformer cette base en OS d'assistance personnelle type JARVIS — un cerveau Hermes, un visage React, des yeux Holomat, des oreilles Whisper, une voix TTS, des mains via les agents d'appareil (§13).

### 1.2 Scission front / moteur (décision tranchée)

| Conservé du dépôt original | Personnalisé / remplacé |
|---|---|
| Hermes Agent, mémoire, skills, tools | **HUD** → React propriétaire (maquette `vendor/figma1`, §3) |
| Pipeline voix, Whisper, TTS, WebSocket | **Dashboard** → React propriétaire (maquette `vendor/figma2`, §13.7) |
| Sessions Hermes, contrôle d'actions, idées wizard | Setup Center React déjà amorcé (`setup/`, §5) |
| Contrat API / événements Core ↔ UI | Holomat Engine, Tool Manager, agents multi-machines, profils & auth multi-facteurs |

Le fonctionnement JARVIS reste le même (micro → STT → Hermes → outils → TTS → UI). Seule la **peau** change : les fronts `jarvis_ai` (HUD vanilla + dashboard embarqué) ne sont **pas** le code produit.

### 1.3 Vision d'ensemble

```
                         UTILISATEUR
                              │
                       JARVIS HUD REACT
              Orbe + interface + hologrammes (§3)
                              │
                     API / WebSocket / Events
                              │
                         HERMES CORE
                     Cerveau de JARVIS (§2, §13)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
  Voice Manager         Holomat Engine        System Manager
  Whisper / TTS         Camera / gestes       Linux / Docker
  Wake word             Calibration           Services
        │                     │                     │
                       Tool / Skill Manager
                              │
        ┌──────────┬──────────┼──────────┬──────────┐
      Plex   Home Assistant  Agents   Applications
                              │
        Windows · Linux · Android · Raspberry · Apple TV · NUC
```

## 2. Architecture Core

```
JARVIS CORE
├── Orchestrateur (Hermes)
├── Dialogue Manager
├── Personality Manager
├── Health Manager / System Manager
├── Security Manager
├── Capability Manager
├── Tool Manager
├── Voice Manager
├── Holomat Manager
├── Agent Manager          (détail §13)
├── Discovery Manager
├── Device Manager
├── Provider Manager
├── Memory Manager
├── IoT Gateway
│     ├── Matter
│     ├── MQTT
│     ├── Zigbee
│     ├── Bluetooth
│     ├── WiFi
│     └── API fabricants
├── Home Agent
└── Recovery Manager
```

- **Orchestrateur (Hermes)** : point central, sait ce qui existe, où c'est, comment communiquer, quelles permissions sont nécessaires. L'IA (LLM) est un service qu'il pilote parmi d'autres, jamais le centre du système — voir la sous-partie ci-dessous. Sa déclinaison multi-appareils (agents d'appareil, entités, jumelage) est décrite au §13. Upstream : `vendor/agents/hermes-agent` en **lecture / Docker** ; le Core parle HTTP (`:8642`) comme le client `HermesAPI` de `vendor/refs/jarvis_ai` — **ne pas merger** Hermes dans `core/`.
- **Health Manager / System Manager** : surveillance de l'état du système (CPU, RAM, GPU, stockage, réseau, température, Docker, services, processus) — vue Dashboard §13.7.
- **Security Manager** : gestion des permissions, autorisations, séparation des comptes.
- **Dialogue Manager** : bibliothèque centrale des phrases JARVIS. Reçoit les événements système (boot, auth, erreur, agent, maison, admin, conversation), choisit une formulation selon le contexte, le rôle utilisateur et le niveau de formalité, puis émet un paquet unifié vers TTS + HUD. Le HUD ne stocke pas les phrases.
- **Personality Manager** : style d'élocution de JARVIS (`human`, `technical`, `cinematic`, `security_alert`, `silent`), variations autorisées, ton par utilisateur ou par contexte — sans casser les garde-fous du Dialogue Manager (§13.10).
- **User Manager** : après Auth (§10.1) — charge le profil, le rôle (ADMIN / USER / CHILD / GUEST) et la liste de permissions ; le HUD et le Dashboard ne décident jamais seuls des droits.
- **Capability Manager** : détection au démarrage des capacités matérielles et logicielles réellement disponibles, construit dynamiquement la liste des fonctions actives — voir §6.7.
- **Tool Manager** : cycle de vie des capacités installables (enregistrer, installer, activer/désactiver, configurer, tester, logs) — manifests sous `tools/` (whisper, piper, homeassistant, plex, docker, ssh, holomat…). Complète le Capability Manager : l'un détecte *ce qui est possible*, l'autre gère *ce qui est déployé*. Toute exécution d'outil passe encore par le Policy Engine (§6.10, §10).
- **Voice Manager** : service dédié `jarvis-voice` (indépendant du HUD et du Core métier) — Whisper STT, wake word, micros / sorties, **TTS Engine** swappable, **Voice Filter** (post-traitement), **Lip Sync Generator**. Identité vocale originale JARVIS (§3.4) — pas une copie de la voix cinéma.
- **Holomat Manager** : vision & gestes (caméra, calibration, MediaPipe, profils) — plugin au même niveau que la voix, §6.8 et §3.
- **Agent Manager** : registre, jumelage PIN, déploiement et suivi des agents d'appareil — §13.
- **Discovery Manager** : détection automatique des équipements (réseau local + machine).
- **Device Manager** : configuration des périphériques détectés.
- **Provider Manager** : gestion des fournisseurs de service IA (Ollama, VPS, API externes).
- **Memory Manager** : mémoire / contexte utilisateur — courte, projet, documentaire (§15).
- **IoT Gateway** : passerelle protocolaire pour la domotique (Matter, MQTT, Zigbee, Bluetooth, WiFi, API fabricants).
- **Home Agent** : logique d'automatisation domestique au-dessus de l'IoT Gateway.
- **Recovery Manager** : sauvegarde, diagnostic, restauration — voir §12. C'est le composant jugé le plus critique de l'architecture : la panne d'une couche ne doit jamais détruire les autres couches.

### Positionnement face à JARVIS OS (WSU Everett) — s'inspirer sans copier l'objectif

JARVIS OS ([jarvisoslinux.org](https://www.jarvisoslinux.org)) est une distribution de recherche académique (Arch Linux + KDE Plasma 6 + Ollama + orchestration MCP) dont le but affiché est d'étudier ce qui casse quand un LLM dispose des pleins privilèges système. Comparaison directe :

| JARVIS OS | Ce projet |
|---|---|
| Distribution Linux de recherche | Assistant personnel complet |
| KDE Plasma (réel, tel quel) | HUD web personnalisé (React, kiosque) |
| Ollama local | Multi-fournisseurs (local, VPS, API) — §11 |
| MCP | Orchestrateur Hermes |
| LLM centré | Maison connectée + sécurité + multimédia + vision |
| Installateur générique | Installateur avec découverte réseau (§5, §8) |

**À reprendre de leur côté** : leur système de build de distribution, leur pipeline d'installation, leur gestion des services, leur organisation de projet — tout ce qui relève de la couche OS/build, pas de la couche IA.

**À ne pas reprendre** : mettre le LLM au centre du système. Ce projet garde le LLM comme **un service parmi d'autres**, piloté par l'Orchestrateur Hermes, au même niveau que les autres managers :

```
                    JARVIS CORE

                Orchestrateur Hermes
                         │
 ┌──────────────┬────────┼────────┬──────────────┐
 │              │        │        │              │
Sécurité    Discovery  Device   Home      AI Provider
Manager     Manager    Manager  Manager    Manager
```

Conséquence directe, déjà posée par le Mode 4 du §11 : si Ollama tombe, si l'API cloud est indisponible, ou si Internet est coupé, le Core continue de fonctionner — l'IA n'est qu'une des fonctions qui devient indisponible, pas une panne totale.

Vu comme une pile complète, l'architecture se lit ainsi — la base OS (build/install/sécurité système, éventuellement inspirée de JARVIS OS) en fondation, le Core spécifique au-dessus :

```
                JARVIS OS (base Linux)

     Linux minimal / systemd / sécurité / kiosque
                      │
             JARVIS Setup Center (§5)
                      │
                 Hermes Core
                      │
      ┌───────────────┼────────────────┐
      │               │                │
 Discovery       Security        AI Provider
      │               │                │
 Device          Health          Home/Média
      │               │                │
          HUD React + Dashboard React
```

> **Point ouvert** : la base OS (Arch/CachyOS + Calamares chez JARVIS OS, hypothèse Ubuntu/Debian au §4.5) reste à trancher — étudier leur pipeline de build avant de décider. Dans tous les cas, leur modèle de sécurité n'est **pas** une référence à suivre : le Policy Engine (§6.10, §10) de ce projet reste seul autoritaire sur les privilèges accordés à l'IA.

### Couches indispensables vs modules optionnels

Pour que le système reste fiable, il faut séparer un noyau indispensable de modules optionnels — chaque module peut tomber sans emporter les autres.

```
                 JARVIS CORE
                     │
        ┌────────────┴────────────┐
        │                         │
   Noyau système              Modules
   indispensables             optionnels
```

**1) JARVIS BASE — noyau indispensable ("mode survie")**. Même sans IA avancée, doit permettre de démarrer, diagnostiquer, réparer :
```
JARVIS BASE
├── Gestion démarrage (systemd)
├── Gestion configuration
├── Logs système
├── Diagnostic matériel
├── Réseau
├── Gestion services
├── Mise à jour
├── Sauvegarde / restauration
└── Mode maintenance
```
C'est ce qui permet de dire : « Mon HUD ne démarre plus, mais je peux réparer la machine. » — recoupe le Recovery Manager ci-dessus et le mode maintenance du §6.5.

**2) SECURITY AGENT — fortement recommandé, pas obligatoire au démarrage** :
```
SECURITY AGENT
├── Surveillance logs
├── Analyse réseau
├── Détection anomalies
├── Audit système
├── Alertes
└── Gestion pare-feu
```
Rôle : « je surveille et je préviens » — implémente concrètement les logs d'audit et le pare-feu déjà listés dans la checklist du §7.

**3) AI AGENTS — optionnel selon la puissance machine** :
```
AI AGENTS
├── Conversation
├── Raisonnement
├── Programmation
├── Résumé
├── Vision
└── Mémoire avancée
```
Modèles plus gros sur un serveur puissant, plus légers ou API sur un NUC faible — s'appuie sur le moteur de capacités du §6.7.

**4) HOME AGENT — optionnel** :
```
HOME AGENT
├── Home Assistant
├── MQTT
├── Zigbee
├── Caméras
├── Éclairage
└── Capteurs
```

**5) MEDIA AGENT — optionnel** :
```
MEDIA AGENT
├── Plex
├── VLC
├── TV
├── Musique
└── Streaming
```

**6) EXPERIENCE — couche de confort ("effet Iron Man")** :
```
EXPERIENCE
├── HUD holographique React (§3)
├── Holomat (gestes + identité, §6.8)
├── Orbe & animations
├── Voix naturelle (Voice Manager)
└── Personnalisation / profils
```

**Règle centrale** : même si tout le reste tombe, le noyau de maintenance (JARVIS BASE) doit rester accessible.
```
Panne HUD
   ↓
Console Linux
   ↓
Réparation Core
   ↓
Redémarrage HUD
```
```
Panne IA cloud
   ↓
Mode local
   ↓
JARVIS continue avec fonctions réduites
```

### Profils d'installation

L'installateur (§5) devrait proposer des profils construits à partir de ces couches, pour déployer le même système sur un ProLiant, un PC ou un petit NUC sans installer des composants inutiles :

- **JARVIS Minimal** → JARVIS BASE seul (administration + diagnostic)
- **JARVIS Assistant** → BASE + AI Agents (voix + IA)
- **JARVIS Maison** → BASE + Home Agent (domotique/IoT)
- **JARVIS Complet** → BASE + tous les modules (HUD + vision + IA + domotique + média)

> **Point ouvert** : à réconcilier avec la liste de profils déjà esquissée au §5 phase 1 (Assistant maison / Station IA personnelle / Média + IA / Développeur IA / Serveur vocal multi-pièces), qui décrit plutôt des *usages* — ces deux listes devront converger vers un seul jeu de profils au moment de l'implémentation.

## 3. Stack technique — HUD & interfaces (React)

**Décision révisée** : plus question d'un shell Qt/QML remplaçant KDE. L'architecture retenue est **noyau Linux + Core Python + interfaces web React** :

- **HUD JARVIS** = webapp **React** (maquette de référence : `vendor/figma1`), servie par Hermes Core et affichée en **mode kiosque** (navigateur plein écran — Chromium `--kiosk` ou compositeur minimal type `cage`) sur la machine principale. **Remplace** le HUD navigateur de `jarvis_ai` (§1.2).
- **Dashboard Core** = webapp **React** d'administration (systemd, services, entités, agents, IA — maquette de référence : `vendor/figma2`), détaillée au §13.7. **Remplace** le dashboard embarqué du dépôt original.
- **Core** = **Python** (orchestrateur Hermes, §2) — moteur inspiré / branché sur `jarvis_ai` + Hermes Agent, pas réécrit depuis zéro.

Ce choix apporte ce que le Qt/QML promettait, plus simplement :

- ✅ HUD façon Iron Man (animations, transparence, effets — CSS/Canvas/WebGL)
- ✅ Plein écran permanent via mode kiosque
- ✅ Multi-écrans (une fenêtre kiosque par écran)
- ✅ Contrôle clavier/souris/tactile
- ✅ **Multi-appareils gratuit** : le même HUD s'ouvre dans n'importe quel navigateur du LAN (tablette, PC, TV) — cohérent avec l'architecture distribuée du §13
- ✅ Une seule compétence front (React) pour HUD + Dashboard + Setup Center (§5)
- ⚠️ En contrepartie, les actions natives (fenêtres, périphériques, système) passent **toutes** par le Core Python et les agents d'appareil (§13) — le navigateur n'a aucun accès direct à l'OS, ce qui est aussi une propriété de sécurité (§10)

> **Note d'historique** : l'option initiale Qt6/QML (« Plasma personnalisé ») est abandonnée — trop coûteuse pour un rendu équivalent, et incompatible avec un HUD multi-appareils. L'inspiration KDE ne survit que sur un point : l'intégration en couches via systemd (ci-dessous). Le dossier monorepo `hud/` Qt éventuel est **legacy** : le produit cible est React.

### 3.1 HUD React — visage uniquement, zéro logique métier

Le HUD est le visage de JARVIS. Responsabilités d'**affichage** :

- Orbe JARVIS personnalisée + animations holographiques
- Fenêtres flottantes, panneaux multimédias, launcher, widgets
- Conversation temps réel, notifications, affichage des actions Hermes
- Avatar holographique : texte dialogue, lip-sync, effets (events Voice Manager §3.4)
- Contrôle gestuel (réception d'événements Holomat, §6.8)
- Paramètres **expérience** utilisateur (thème, orbe, notifications, calibrage Holomat) — frontière Settings : skill `settings-split`

**Règle** : le HUD ne contient **aucune** logique métier. Il consomme les événements du Core et décide des animations.

Exemple : Hermes annonce « Je lance Plex » → le Core émet des commandes → le HUD anime l'orbe, ouvre un panneau Plex, affiche une notification.

### 3.2 États de l'orbe

L'orbe représente l'état interne de JARVIS. Le Core pousse un état ; le HUD choisit l'animation.

| État | Signification |
|---|---|
| `idle` | Attente |
| `listening` | Micro actif |
| `thinking` | Analyse IA |
| `tool_call` | Utilisation d'un outil |
| `speaking` | Réponse vocale |
| `gesture` | Commande gestuelle détectée |
| `error` | Erreur système |

Exemple d'événement Core → HUD :

```json
{ "command": "set_orb_state", "state": "thinking", "message": "Analyse en cours" }
```

(États historiques `standby` / `analyzing` / `action` restent acceptés en alias vers `idle` / `thinking` / `tool_call` tant que le contrat WS n'est pas figé.)

### 3.3 Dashboard React — module admin du HUD (pas une app séparée)

Le Dashboard n'est **pas** une porte d'entrée parallèle au HUD. C'est un **module sécurisé** (panneau holographique / scène plein cadre) **appelé depuis le HUD** après Auth + permission `dashboard_access` (§10.1).

- Quotidien → HUD personnel (orbe, apps autorisées, maison, voix).
- Admin → même session HUD, entrée type « Command Center » / « Jarvis ouvre le centre de contrôle » → Hermes vérifie le rôle → ouverture Dashboard.

Modules cibles du Dashboard (une fois autorisé) :

- **Command Center** — état JARVIS / Hermes, agents connectés, outils actifs, CPU/RAM, événements, tâches en cours
- **Hermes Core** — statut agent, mémoire, sessions, modèle IA, skills, logs, historique
- **Voice Manager** — Whisper, TTS Engine swappable, Voice Filter, Lip Sync, wake word, micros / sorties ; identité vocale JARVIS FR originale (§3.4)
- **Tools / Agents / Monitoring** — vues sur Tool Manager, Agent Manager, System Manager (§2)

### 3.4 JARVIS Voice System — identité vocale, TTS & lip-sync

**Objectif** : une voix **originale** inspirée du style IA SF (calme, élégante, précise, professionnelle) — française, masculine, posée, légèrement futuriste, présence d'assistant premium. **Ne pas** chercher à cloner la voix du film (interprétation d'acteur + mixage cinéma non reproductibles via un modèle TTS public). Créer *la voix de TON JARVIS*.

#### Pipeline

```
Dialogue Manager          (§13.10 — texte + ton + pauses)
        ↓
Voice Manager (`jarvis-voice`)
        ├── TTS Engine        (provider swappable)
        ├── Voice Filter      (EQ, compression, réverb légère, spatialisation)
        └── Lip Sync Generator (phonèmes / visèmes)
        ↓
HUD React : audio + Avatar Face + Orbe + particules
```

Le Voice Manager est **indépendant** : remplacer ElevenLabs par Piper / XTTS demain ne touche ni le HUD ni Hermes — seul le backend TTS change derrière la même API.

#### TTS — options

| Voie | Exemples | Intérêt |
|------|----------|---------|
| Cloud premium | ElevenLabs (voix FR mature créée pour le projet) | Naturel, émotions, pauses, intonation |
| Local autonome | Piper, Coqui XTTS, OpenVoice, Fish Speech, StyleTTS2 | Hors ligne, Core-owned, pas de dépendance cloud |

Provider Manager (§2) / Tool Manager choisissent le moteur selon capability (réseau, GPU, clé API). Mode dégradé (§11) : TTS local minimal ou HUD texte-only.

#### Arbitrage du moteur — par classe d'énoncé (tranché)

Le choix n'est **pas** « Piper *ou* ElevenLabs » : les deux coexistent dans la même installation, arbitrés par la **nature de l'énoncé** et par la joignabilité du NUC (§14) — jamais par une variante du produit.

| Classe d'énoncé | Moteur | Pourquoi |
|---|---|---|
| Phrases fixes du Dialogue Manager (§13.10) — boot, auth, alertes, confirmations | ElevenLabs **pré-généré**, WAV mis en cache sur le NUC | Ensemble fini et connu à l'avance : qualité cloud, latence nulle, coût non récurrent, fonctionne hors ligne |
| Conversationnel dynamique, **à la maison** | Piper / TTS local | Illimité, gratuit, insensible à la panne Internet |
| Conversationnel dynamique, **hors domicile** | ElevenLabs live | Le NUC est injoignable — §14 |
| Aucun moteur joignable | `SpeechSynthesis` navigateur, puis HUD texte-only | Mode dégradé §11 |

ElevenLabs facturant au caractère, le cache des phrases fixes absorbe l'essentiel du volume quotidien : le coût récurrent ne porte que sur le conversationnel hors domicile.

#### Voice Filter (post-traitement)

```
TTS brut → EQ → compression légère → réverb très faible → spatialisation 3D → sortie
```

Effet cible : voix présente, claire, futuriste, *légèrement* holographique — sans rendre l'audio illisible.

**Où il tourne (tranché)** : en **bout de chaîne audio, côté Voice Manager**, au plus près de la sortie — jamais collé au moteur TTS ni déporté sur le ProLiant, qui ajouterait un aller-retour réseau par phrase. C'est cette position qui permet aux sorties Piper *et* ElevenLabs de partager la même signature sonore, donc à JARVIS de garder une seule identité vocale à la maison comme dehors (§14.5).

#### Paramètres imposés par Dialogue / Personality

- Vitesse typique : **0.90 – 0.95**
- Ton : calme, style « assistant exécutif »
- Pauses courtes entre phrases (ponctuation + métadonnées `pause_ms`)
- Ex. : « Bonjour, Samir. » *(pause)* « Tous les systèmes sont opérationnels. »

#### Lip-sync & présence visuelle

```
Audio → analyse phonèmes / visèmes → Lip Sync → bouche avatar holographique
```

Pendant `speaking` : yeux actifs, orbe pulsante (`orb_state: speaking`), particules synchronisées. Le HUD reçoit `dialogue_line` + flux lip-sync ; il **n'embarque pas** le moteur TTS.

#### Découpage service

```
services/voice/          # jarvis-voice
├── tts/                 # engines (piper | elevenlabs | xtts…)
├── filters/             # Voice Filter chain
├── lipsync/             # générateur visèmes
├── stt/                 # Whisper
└── devices/             # micros / sorties
```

> **Point ouvert** : licence / éthique — voix projet originale uniquement, jamais clonage d'acteur du film ; réplication du **timbre** entre moteur local et moteur cloud (aligner la voix Piper sur la voix ElevenLabs supposerait d'entraîner un TTS tiers sur des sorties ElevenLabs, ce que leurs CGU restreignent — à vérifier avant d'investir dessus ; à défaut, l'unité d'identité repose sur le Voice Filter seul, cf. §14.5).

### 3.5 Experience Orchestrator — synchronisation Processus + Voix + HUD + Avatar + Orbe

**Problème sans cette couche** : la voix récite un scénario pendant que le système fait autre chose. L'utilisateur voit une animation préenregistrée, pas une intelligence réelle.

**Principe fondamental** : la voix accompagne les événements — elle ne les précède pas.

```
AUTH ENGINE (Core)
        ↓
EXPERIENCE ORCHESTRATOR
        ↓
 ┌──────────────┬──────────────┬─────────────┐
 Voice Manager  HUD Text Mgr   Avatar Manager
 (TTS)          (hudText)      (avatarMode)
        ↓
    React HUD + Emma + Orbe
```

#### Chaque step = un objet synchronisé

```ts
{
  id:           'face_scan_0',
  hudText:      'FACE SCAN ACTIVE',
  hudSubtext:   'Extraction des vecteurs biométriques',
  voiceLine:    'Extraction des vecteurs biométriques.',
  orbState:     'processing',
  avatarMode:   'scanning',
  minDuration:  2000,          // durée minimale de l'étape (ms)
  pauseAfter:   300,           // pause naturelle après la voix
  waitForUser:  false,
  onEnter:      () => startScanProgress(),
  onComplete:   () => stopScanProgress(),
}
```

**Règle** : `voiceLine` + `minDuration` s'exécutent **en parallèle** — `Promise.all`. La voix explique ce qui se passe réellement pendant `minDuration`. Quand les deux finissent, on attend `pauseAfter` puis on passe à l'étape suivante.

**`waitForUser: true`** → l'orchestrateur se bloque jusqu'à une action explicite (ex. clic bouton micro). Utilisé pour la phase Voice Auth : JARVIS pose la question, attend la réponse.

#### Machine à états Auth — steps canoniques

```
boot_0…5  (checks système, un par service)
    ↓
identification_0…1
    ↓
face_scan_0…2  (scan en cours → correspondance → validé)
    ↓
voice_prompt  ← waitForUser = true (bouton micro)
    ↓
voice_scan → voice_ok
    ↓
access_granted → profile_load → complete
```

Chaque step pilote `orbState`, `avatarMode`, `hudText/subtext` et le TTS — **une seule source de vérité**.

#### Implémentation HUD (stub — en attendant Core réel)

Classe `ExperienceOrchestrator` (`src/app/engine/experienceOrchestrator.ts`) :
- Pub/sub léger : `subscribe()` → React `useState` se met à jour
- `load(steps)` + `run()` : boucle async
- `userConfirm()` : débloque un step `waitForUser`
- `stop()` : cleanup propre (coupe TTS, `alive = false`)

Quand le Core réel sera branché (WebSocket), les `onEnter`/`onComplete` seront remplacés par des handlers d'events WS : `ws.on('face_scan_complete', () => orch.advance())` au lieu du timer.

> **Point ouvert** : protocole exact Core → Orchestrator (push d'event WS vs polling) ; gestion des timeouts (que faire si `face_scan_complete` ne vient jamais ?).

#### Substitution de développement — Windows Speech Synthesis (Cortana FR)

En phase de dev (pas de `jarvis-voice` encore câblé), le Voice Manager peut être **stubbé** par un pont vers la synthèse vocale Windows (`SpeechSynthesis` API du navigateur ou `pyttsx3` côté Python — accède aux voix Windows installées, dont la voix FR de Cortana / Hortense).

```
Dev stub flow :
Dialogue Manager → texte + ton → speechSynthesis.speak() [navigateur]
                                  └── voix FR Windows sélectionnée
```

Intégration React (HUD figma1) : `window.speechSynthesis` disponible dans Chromium kiosque, aucune dépendance npm.

```ts
// stub dev — pas de jarvis-voice réel
const utter = new SpeechSynthesisUtterance(text);
utter.lang  = 'fr-FR';
utter.rate  = 0.92;                // §3.4 — style exécutif
utter.pitch = 0.85;
const voices = speechSynthesis.getVoices();
utter.voice = voices.find(v => v.lang === 'fr-FR') ?? null;
speechSynthesis.speak(utter);
```

**Avantage** : zéro config, disponible immédiatement sous Windows. **Limite** : voix non JARVIS, pas de Voice Filter, pas de lip-sync réel — à désactiver dès que `jarvis-voice` est branché (guard `import.meta.env.VITE_TTS_STUB`).

### Chaîne applicative

```
   JARVIS HUD            DASHBOARD CORE
  React (figma1)         React (figma2)
        │                      │
        └──────────┬───────────┘
                   │
          WebSocket / REST
                   │
         JARVIS ORCHESTRATOR
            Hermes — Python
                   │
 ┌────────────────┼────────────────┐
 │                │                │
LLM             Home             Actions
Ollama          Assistant        Linux
API IA          MQTT             Plex/VLC
                Zigbee           Apps
```

### Arborescence cible (logique → déploiement)

Modules logiques (conception) et chemins de déploiement :

```
# Logique
hud-react/          → /opt/jarvis/hud/dist/          (React figma1)
dashboard-react/    → /opt/jarvis/dashboard/dist/    (React figma2)
hermes-core/        → /opt/jarvis/core/              (+ Hermes Agent en service séparé)
voice-manager/      → /opt/jarvis/services/voice/
holomat-engine/     → /opt/jarvis/services/vision/
agent-manager/      → dans core/ (Agent Manager, §13)
system-manager/     → dans core/ (Health / System Manager)
```

```
/opt/jarvis/
├── hud/              # build statique React (figma1)
│   └── dist/
├── dashboard/        # build statique React (figma2)
│   └── dist/
├── core/
│   ├── orchestrator.py
│   ├── agents/
│   ├── tools/        # Tool Manager (manifests)
│   └── memory/
└── services/
    ├── voice/        # jarvis-voice : STT, TTS Engine, Voice Filter, Lip Sync (§3.4)
    ├── vision/       # Holomat Engine
    └── homeassistant/
```

Les builds statiques sont servis par le Core (ou un serveur web léger type Caddy/nginx) sur le LAN.

### Séquence de démarrage

```
Linux démarre (systemd)
        ↓
JARVIS Core démarre (sert le HUD)
        ↓
Session kiosque : navigateur plein écran → HUD React
        ↓
Micro actif
        ↓
"Jarvis..."
```

### Modèle d'intégration OS — couches systemd (héritage de l'étude KDE)

De l'étude du modèle KDE Plasma (versions antérieures de ce document), un seul principe est conservé : JARVIS n'est pas « une application posée sur Linux », mais un empilement de couches démarrées et surveillées par **systemd**. Le shell graphique Qt/KWin est remplacé par une session kiosque minimale :

```
BIOS/UEFI
   ↓
Kernel Linux
   ↓
systemd
   ↓
jarvis-core.service        (Hermes, Python — sert HUD & Dashboard)
   ↓
jarvis-hud.service         (session kiosque : cage/Chromium plein écran)
   ↓
HUD React à l'écran
```

- **systemd** : un service par fonction (`jarvis-core`, `jarvis-hud`, `jarvis-voice`, … — §6.14), redémarrage automatique, logs centralisés (`journalctl`).
- **D-Bus** : reste pertinent **côté Core Python** pour dialoguer avec les services Linux (monter un disque, notifications, réseau) — le navigateur, lui, ne parle qu'à Hermes via WebSocket/REST.
- **Wayland** : plus besoin de compositeur riche (KWin) ; un compositeur kiosque minimal (`cage`) ou Chromium en mode kiosque suffit à afficher le HUD plein écran.

**Stack technique des interfaces, in fine : React (HUD figma1 + Dashboard figma2) + navigateur kiosque + systemd + Core Python** — le « shell JARVIS » est une webapp, l'intégration OS appartient entièrement au Core et aux agents (§13).

## 4. Build & déploiement

Point important à clarifier : on ne compile pas ces couches pour les installer *dans* le noyau Linux (sauf à écrire un vrai module noyau, ce qui n'est pas le cas ici). JARVIS compile des applications et services qui tournent **au-dessus** du noyau — exactement la logique de KDE.

```
Noyau Linux
    │
    ├── Pilotes (kernel modules)
    │
    ├── systemd
    │
    ├── Navigateur kiosque (cage/Chromium)
    │
    ├── JARVIS Core (Python)
    │
    └── JARVIS HUD + Dashboard (React, servis par le Core)
```

### 1) Build du HUD & du Dashboard (React)

```
hud/  (figma1)                dashboard/  (figma2)
├── package.json              ├── package.json
├── vite.config.ts            ├── vite.config.ts
└── src/                      └── src/
```

Build :
```
npm ci
npm run build
```
→ dossiers statiques `dist/`, copiés dans `/opt/jarvis/hud/dist/` et `/opt/jarvis/dashboard/dist/`, servis par le Core ou un serveur web léger. Pas de compilation native : le « binaire » du front est un bundle JS/CSS.

### 2) Compilation du cœur orchestrateur

Le cœur Python n'est pas compilé comme KDE :
```
/opt/jarvis/core/
main.py
agents/
memory/
api/
```
Environnement :
```
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3) JARVIS comme service Linux

Comme KDE s'appuie sur systemd, JARVIS aussi. Créer `/etc/systemd/system/jarvis-core.service` :
```ini
[Unit]
Description=Jarvis Core AI

[Service]
WorkingDirectory=/opt/jarvis/core
ExecStart=/opt/jarvis/core/venv/bin/python main.py
Restart=always

[Install]
WantedBy=multi-user.target
```
Activation :
```
sudo systemctl enable jarvis-core
sudo systemctl start jarvis-core
```

### 4) Packaging d'installation

Comme KDE fournit des paquets `.deb`, JARVIS peut produire :
```
jarvis-hud.deb
jarvis-core.deb
jarvis-ai-services.deb
```
Structure :
```
jarvis-package/
DEBIAN/
 └── control
opt/
 └── jarvis/
      ├── hud/
      ├── core/
      └── agents/
etc/
 └── systemd/
      └── jarvis.service
```
Construction : `dpkg-deb --build jarvis-package` → `jarvis-core.deb`
Installation : `sudo dpkg -i jarvis-core.deb`

### 5) Vision long terme — ISO Linux personnalisée

Pour un vrai "JARVIS OS", aller jusqu'à une distribution dédiée :
```
Ubuntu/Debian
        +
Kernel Linux
        +
HUD React (kiosque)
        +
JARVIS Core
        +
Home Assistant
        +
Ollama
        +
Services voix
```
Comme KDE construit Plasma au-dessus du noyau, JARVIS construit son propre shell au-dessus d'une distribution Linux existante — l'objectif n'est jamais de modifier le noyau, mais de créer un environnement de bureau / une distribution JARVIS par-dessus.

**Candidat externe à étudier** : [JARVIS OS](https://www.jarvisoslinux.org) (Washington State University Everett) publie un pipeline de build de distribution complet et fonctionnel — base **Arch/CachyOS** (pas Ubuntu/Debian), KDE Plasma Wayland réel baké dans l'ISO, noyau custom via `makepkg`/`pacman`, installateur **Calamares**, SquashFS+zstd, ISO reconstruite via `xorriso`. Leur build/install/gestion des services est réutilisable comme référence ; leur objectif (étudier un LLM avec pleins privilèges système) et donc leur posture sécurité ne le sont pas — voir §2 pour le positionnement complet.

## 5. JARVIS Installer / Setup Wizard

Un installateur/configurateur système, comme les assistants d'installation des distributions Linux. Principe : ne pas coder en dur les clés API et les choix de modules dans le HUD ou le Core — créer une couche de configuration en amont du déploiement.

```
                 INSTALLATEUR JARVIS
                       │
              Configuration initiale
                       │
 ┌─────────────────────┼─────────────────────┐
 │                     │                     │
Clés API          Choix modules        Matériel
OpenAI            Ollama              CPU/GPU
Claude            Home Assistant      Micro
Gemini            Plex                Caméra
NVIDIA            MQTT                Écrans
                       │
                       ▼
              Génération config
                       │
          ┌────────────┴────────────┐
          │                         │
     JARVIS CORE              JARVIS HUD
     Python                   React
          │                         │
          └────────────┬────────────┘
                       │
                 Services Linux
                 systemd/docker
```

### Exemple de premier démarrage façon Linux

```
================================
      JARVIS OS INSTALLER
================================

Nom de l'assistant :
[ Hermes ]

Mode IA :
( ) Local uniquement
( ) Hybride local + API

Modèle local :
[X] Ollama
    [X] Qwen
    [ ] DeepSeek
    [ ] Gemma

Services :
[X] Home Assistant
[X] Plex
[X] Whisper voix
[X] Piper voix
[X] MQTT

Clés API :

OpenAI :
[****************]

Anthropic :
[****************]

NVIDIA :
[****************]

Installation :
[ Lancer le déploiement ]
```

Techniquement, l'interface installateur est une interface web locale (React + API) — cohérente avec le HUD et le Dashboard Core (§3), et déjà amorcée dans le monorepo (`setup/`, Setup Center React).

### Stockage de la configuration

```
/etc/jarvis/
config.yaml
secrets.env
hardware.yaml
modules.yaml
```

Exemple `config.yaml` :
```yaml
assistant:
  name: Hermes

llm:
  local:
    ollama: true
    model: qwen2.5

  api:
    openai: true
    claude: false

services:
  homeassistant: true
  plex: true
  whisper: true
```

Les clés API vont dans un fichier séparé et restreint :
```
/etc/jarvis/secrets.env
chmod 600 secrets.env
```

### Séquence de déploiement

```
Utilisateur valide
        ↓
Analyse machine
        ↓
Installation paquets
        ↓
Création Docker
        ↓
Création services systemd
        ↓
Compilation HUD
        ↓
Activation JARVIS
        ↓
Redémarrage
```

Au final, l'équivalent de : l'installateur Ubuntu pour la base, le configurateur KDE pour l'environnement, et un orchestrateur DevOps pour installer les briques IA. Ce composant — **JARVIS Installer / Setup Wizard** — est ce qui transforme une machine Linux vierge en station JARVIS complète.

### Évolution — JARVIS Setup Center

Évolution logique du Setup Wizard : un véritable assistant d'installation autonome, orienté IA, combinant navigateur embarqué, gestion de comptes/licences et déploiement système.

```
                 JARVIS SETUP CENTER
                  (React + Terminal)
                         │
        ┌────────────────┼────────────────┐
        │                │                │
 Navigateur léger   Gestion comptes   Déploiement
   intégré          API / licences     système
        │                │                │
        ▼                ▼                ▼

 Connexion services   Clés API       Installation
 OpenAI               Tokens         Docker
 Anthropic            OAuth          Modèles IA
 NVIDIA               Comptes        Services Linux
 Ollama               Abonnements    HUD React
```

**Phase 1 — Assistant de configuration** : détection machine (CPU, RAM, GPU, stockage, micro, caméra, carte son) puis choix du profil JARVIS :
```
Quel usage ?

[ ] Assistant maison
[ ] Station IA personnelle
[ ] Média + IA
[ ] Développeur IA
[ ] Serveur vocal multi-pièces
```

**Phase 2 — Navigateur embarqué**, réservé au setup (Chromium embarqué ou WebView — le même navigateur kiosque que le HUD, §3) : créer un compte OpenAI/Anthropic/NVIDIA, récupérer des clés API, accepter des licences, connecter Home Assistant ou des services cloud. Les clés ne doivent jamais rester dans le navigateur : elles sont envoyées vers le coffre local `/etc/jarvis/config.yaml` + `secrets.env`, chiffré et avec permissions Linux restreintes.

**Phase 3 — Le "cerveau installateur"** : orchestrateur de déploiement qui sait quelles dépendances installer, quelles images Docker télécharger, quels modèles IA récupérer, quels services activer, selon le profil choisi :
```
Profil Maison IA

Téléchargement :
✓ Home Assistant
✓ Ollama
✓ Qwen
✓ Whisper
✓ Piper
✓ MQTT
✓ Plex Connector

Configuration :
✓ Micro détecté
✓ Caméra détectée
✓ Audio détecté

Installation :
██████████ 100 %
```

**Phase 4 — Passage en mode JARVIS**, à la fin de l'installation :
```
Installation terminée

Voulez-vous activer :
[X] Démarrage automatique JARVIS
[X] Interface plein écran
[X] Contrôle vocal
[X] HUD React (kiosque)

Redémarrer ?
```
Puis après redémarrage :
```
Linux
  ↓
systemd
  ↓
JARVIS Core
  ↓
JARVIS HUD
  ↓
Micro / Caméra / Enceintes
```
Clavier et souris redeviennent alors de simples outils de maintenance — l'interaction normale passe par la voix et le HUD.

Ce que ça construit ressemble moins à une "application" qu'à une distribution Linux spécialisée + un environnement JARVIS : un installateur façon Ubuntu, un HUD web en kiosque (§3), un orchestrateur façon DevOps, une interface IA façon assistant personnel.

> **Point clé à concevoir** : le **manifeste de déploiement** — un fichier décrivant tout ce que JARVIS doit installer selon le profil choisi. C'est lui qui permet de reproduire la même expérience sur un PC, un NUC ou un serveur (ex. ProLiant).

## 6. Risques techniques & points de vigilance

Revue critique du scénario Installer/Setup Center (§5) et de l'architecture globale (§2) : pas des blocages, mais des zones à concevoir proprement avant d'aller plus loin.

### 6.1 Clés API et secrets — le plus gros risque

Le flux « navigateur intégré → connexion aux services → récupération des clés API » (§5) pose un problème : une clé API est une identité d'accès. Stockée en clair, elle est récupérable par un malware ou un utilisateur local ; si une configuration JARVIS est synchronisée entre machines, ces secrets peuvent être copiés avec elle.

```
JARVIS Setup
      │
      ▼
Gestionnaire de secrets
      │
      ├── Clés API chiffrées
      ├── Tokens OAuth
      └── Certificats
```

Pistes : coffre-fort système Linux (Secret Service / KWallet), fichiers chiffrés, permissions Linux strictes — vient préciser le point ouvert déjà noté en §10 sur la gestion des secrets.

### 6.2 L'installateur devient une cible critique

Le Setup Center (§5) télécharge des images Docker, installe des paquets et exécute des commandes root : il devient de fait un mini système d'administration. Une faille dedans = contrôle complet de la machine. À prévoir : signatures des paquets, vérification des hash, dépôts officiels, logs d'installation, mode rollback.

```
Téléchargement
      ↓
Vérification signature
      ↓
Installation
      ↓
Validation
```

### 6.3 Dépendance aux services externes

JARVIS peut s'appuyer sur Ollama local, OpenAI, Claude, NVIDIA, etc. Si un service tombe ou change son API, une partie du système tombe avec — ça rejoint le mode dégradé du §11, à étendre explicitement à la couche LLM :
```
Internet OK
   ↓
IA cloud + IA locale

Internet coupé
   ↓
Ollama local uniquement
```

### 6.4 Trop de responsabilités dans l'orchestrateur

Le Core (§2) ne doit pas tout faire lui-même — sinon il devient énorme et fragile.

Mauvais :
```
Orchestrateur
 ├── voix
 ├── caméra
 ├── domotique
 ├── installation
 ├── sécurité
 └── interface
```

Meilleur — déléguer à des agents spécialisés :
```
Orchestrateur
├── Agent voix
├── Agent vision
├── Agent maison
├── Agent système
├── Agent média
└── Agent développeur
```
> Ceci affine l'architecture Core du §2 : l'Orchestrateur pilote des agents spécialisés plutôt que d'implémenter chaque fonction lui-même.

### 6.5 Mode sans clavier/souris — prévoir la sortie de secours

Le mode kiosque voix+HUD (§5, phase 4) est bon en usage normal, mais il faut prévoir la récupération après erreur : comment changer le WiFi, réinitialiser une config, administrer la machine. Limite du réflexe naturel « activer SSH » : si le réseau (Wi-Fi ou LAN) tombe, SSH ne sert plus à rien. Un JARVIS autonome doit donc prévoir une maintenance **hors réseau**, à rattacher au Recovery Manager (§12).

```
                 PROBLÈME
                    │
        ┌───────────┴───────────┐
        │                       │
     Réseau OK              Réseau KO
        │                       │
        ▼                       ▼
       SSH                 Clavier + écran
        │                       │
Administration          Mode maintenance local
```

**a) Mode maintenance local (indispensable)** — console Linux accessible physiquement : TTY (`Ctrl+Alt+F2` + connexion administrateur), ou écran de récupération au démarrage (GRUB) :
```
JARVIS BOOT MENU

1 - Démarrer JARVIS normal
2 - Mode maintenance
3 - Mode récupération réseau
4 - Console Linux
```

**b) Le HUD doit pouvoir se couper** — si la session kiosque (navigateur HUD) bloque l'écran :
```
systemctl stop jarvis-hud
```
puis diagnostic :
```
systemctl status jarvis-core
journalctl -xe
ip addr
nmcli device
```

**c) Accès réseau de secours** — pour une machine fixe (ex. le ProLiant) : privilégier Ethernet plutôt que Wi-Fi, IP fixe ou réservation DHCP sur le routeur, et un deuxième moyen d'accès si possible :
```
LAN principal
     │
ProLiant JARVIS

USB Ethernet de secours
     │
Ordinateur maintenance
```

**d) Mode "hotspot dépannage"** — si JARVIS détecte l'absence de réseau, il peut activer automatiquement son propre point d'accès :
```
Carte WiFi
   ↓
Point d'accès JARVIS-MAINTENANCE
   ↓
Connexion depuis téléphone
   ↓
Interface dépannage
```
Accessible ensuite via `http://192.168.4.1` — un panneau de réparation minimal.

**e) Solution professionnelle — accès hors bande.** Pour les machines critiques : Intel AMT (certains PC), IPMI (serveurs), carte de gestion distante. À vérifier si le ProLiant dispose de ce type d'accès.

**Bilan** : JARVIS doit offrir trois portes d'entrée — Voix + HUD (usage quotidien), SSH (administration normale), Console locale / recovery (panne réseau ou gros problème). C'est cette troisième couche qui transforme le projet d'un simple assistant en une vraie plateforme Linux autonome.

### 6.5.1 Kiosque UI — mode voix vs recovery (HUD + Dashboard)

Décision produit : **par défaut, rien n’est cliquable** à la souris ni saisissable au clavier sur le chrome HUD et Dashboard (mode `voice`). L’utilisateur commande via « Jarvis … ».

| Mode | Déclencheur | Comportement |
|------|-------------|--------------|
| **voice** (défaut) | boot kiosk | `pointer-events` off sur boutons / inputs ; orbe + wake actifs |
| **recovery** | `Ctrl+Alt+R` ou « Jarvis mode recovery » | Clics / clavier pour maintenance ; page Recovery Dashboard |
| Retour voix | `Ctrl+Alt+R` à nouveau ou « Jarvis mode voix » | Re-masque le chrome |

Jarvis peut **naviguer le Dashboard** (pages, titres, sections) : « Jarvis dashboard tokens », « Jarvis dashboard hermes », « Jarvis dashboard docker »… via `postMessage` HUD → iframe (`#/page`).

Page **Dashboard** (`#/dashboard`) : récap tokens IA + stats des outils Hermes contrôlés.

> **Point ouvert** : PIN local obligatoire pour entrer en recovery depuis le kiosk public (invité) — à croiser §10.

### 6.5.2 Multi-hôte — où lancer quoi

Hermes route l’intent vers l’**agent d’appareil** du host actif (skill `ecosystem-hosts`) :

- **VPS** : cerveau, Dashboard, Docker/SSH allowlist (install Setup profil `vps` en premier).
- **NUC** : HUD kiosk + Plex / VLC / VS Code locaux → bibliothèque ProLiant.
- **Windows (portable)** : agent Windows → Netflix, Prime, apps système.
- **TV / HA** : entités HA (TV, lampes, lave-linge WiFi, caméras après appairage).

Ne jamais ouvrir une app grand public sur le VPS ; ne jamais donner root VPS libre (§ Policy VPS).

Ce routage suppose les hôtes **joignables**. Quand l'utilisateur est hors du LAN, le NUC ne l'est plus : la topologie nomade, le tunnel VPS↔NUC et le périmètre de fonctions correspondant sont traités au **§14**.

### 6.6 Caméra et micro — vie privée et permissions par utilisateur

Une fois caméra/micro potentiellement toujours actifs, il faut : voyant caméra/micro, bouton physique ou logiciel de coupure, permissions différenciées par utilisateur :
```
Samir :
 accès complet

Invité :
 seulement musique

Enfant :
 seulement contenu autorisé
```
Ceci complète le modèle de sécurité du §10, qui ne traitait jusqu'ici que des permissions par appareil, pas par utilisateur humain.

### 6.7 Diversité matérielle et logicielle — Capability Manager

JARVIS doit couvrir ProLiant Xeon, NUC Celeron, PC portable, Raspberry Pi — des capacités très différentes. Il faut un moteur de profils capable d'adapter le déploiement :
```yaml
machine:
  ram: 16GB
  gpu: false

profil:
  assistant_maison: true
  gros_llm_local: false
```
Concrètement, un **moteur de capacités** fait correspondre le matériel détecté à un choix de modèle/fonctions :
```
Machine détectée :

RAM 4 Go
→ petit modèle IA

RAM 32 Go
→ modèle plus grand

GPU présent
→ vision avancée
```
Vient enrichir `hardware.yaml` déjà prévu au §5.

**Extension au-delà du seul choix de modèle IA** : le composant qui porte ce rôle dans l'architecture Core (§2) est le **Capability Manager**. Il ne se limite pas au dimensionnement du LLM — il détecte au démarrage l'ensemble des capacités matérielles **et logicielles** réellement disponibles (GPU, service Ollama up ou non, caméra, micro, Bluetooth, Home Assistant joignable, Plex joignable, Apple TV détectée, imprimante...) et en déduit dynamiquement la liste des fonctions JARVIS activables :

```
Analyse machine...

✓ GPU NVIDIA
✗ Ollama
✓ Caméra
✓ Micro
✓ Bluetooth
✓ Home Assistant
✗ Plex
✓ Apple TV
✓ Imprimante
```

```
Fonctions disponibles :
✓ Contrôle maison
✓ Voix
✓ Vision
✓ Sécurité
✓ Réseau

Fonctions indisponibles :
✗ Conversation IA
```

Le HUD se contente d'afficher cet état — c'est le Capability Manager qui décide de ce qui est activable, pas le HUD lui-même. Cette détection tourne aussi bien au premier démarrage (alimente le mode découverte du §8) qu'en continu (une fonction qui tombe — ex. Ollama qui plante — doit repasser en `✗` sans redémarrage complet, ce qui rejoint le mode dégradé du §11).

### 6.8 Holomat Engine — vision, gestes & identité

**Références upstream** : [itachity/Holomat](https://github.com/itachity/Holomat) (couche vision + assistant de référence) ; calibrage / caméra Concept-Bytes déjà sous `vendor/vision/` ([Concept-Bytes/Holomat](https://github.com/Concept-Bytes/Holomat), HandTracking, HoloMat2). Holomat devient un **plugin du Core** au même niveau que Whisper (Voice Manager), via le **Holomat Manager** (§2) — pas un module embarqué dans le HUD React.

```
HERMES CORE
     │
HOLOMAT MANAGER
     │
┌────┴────────────────────────────┐
│ Camera Manager                  │
│ Hand Tracking (MediaPipe)       │
│ Calibration (OpenCV / Charuco)  │
│ Gesture Recognition             │
│ User Profiles (gestes)          │
└─────────────────────────────────┘
```

Apports : calibration caméra, OpenCV, MediaPipe, tracking main, reconnaissance de gestes, interaction naturelle. Première config vocale typique : « Jarvis configure mes gestes » → détection caméra → calibration → détection main → profil gestes → sauvegarde.

**Profils utilisateur** (distincts du coffre à secrets, §6.1 / §6.11) :

```
users/<utilisateur>/
├── voice_profile
├── gesture_profile
├── hud_preferences
└── permissions
```

Exemple de `gesture_profile` : `open_hand` → ouvrir launcher, `pinch` → sélectionner, `swipe_left` → panneau suivant. Le volet Holomat du HUD (expérience) expose calibration, caméra OK, main dominante, sensibilité, mapping des gestes — sans décider des droits.

**Authentification multi-facteurs** (Holomat comme couche d'identité, pas comme sésame unique) — le **portail unique** et le User Manager sont détaillés au §10.1 :

```
Voix reconnue  +  Profil utilisateur  +  Gestes / visage  (+ PIN si besoin)
       ↓
User Manager → profil + rôle + permissions
       ↓
HUD correspondant (USER / CHILD / …)  ·  Dashboard seulement si ADMIN
```

Exemple : administrateur (système, config, agents, outils) vs enfant (apps autorisées, contrôle TV limité). Vient compléter les permissions par utilisateur du §6.6.

**Point critique reconnaissance faciale** — le flux Caméra → Holomat → déverrouillage HUD reste fragile (lumière, apparence, multi-personnes, faux positifs, caméra down). Ne jamais faire « visage reconnu = accès total » ; toujours combiner les facteurs ci-dessus.

> **Point ouvert** : cloner / intégrer explicitement `itachity/Holomat` sous `vendor/vision/` (aujourd'hui surtout Concept-Bytes) ; mécanisme concret d'auth par appareil (§10) croisé avec profils voix+gestes.

### 6.9 « Jarvis toujours à l'écoute » — risque de captation

Même avec un mot d'activation, il y a un risque de conversations privées captées, d'activation accidentelle, ou de mauvaise interprétation. Modéliser explicitement les états d'écoute plutôt qu'un simple on/off :
```
État 1 :
Micro actif → écoute uniquement du mot clé

État 2 :
Jarvis réveillé → analyse commande

État 3 :
Action → confirmation si nécessaire
```
Ceci précise le contrôle micro déjà demandé au §6.6 (voyant, coupure physique/logicielle).

### 6.10 Décision de l'orchestrateur — Policy Engine

Risque principal d'un système piloté par IA : une mauvaise interprétation d'une commande ambiguë (« Nettoie le système » → suppression de fichiers importants). Ceci reprend et nomme explicitement le mécanisme déjà posé au §10 (IA jamais root direct) :
```
IA
 |
Décision
 |
Policy Engine
 |
Autorisation
 |
Exécution
```
L'IA propose, un moteur de règles (Policy Engine) valide — jamais l'inverse.

### 6.11 Mémoire utilisateur — séparation et chiffrement

Un assistant personnalisé accumule historique, préférences, profils, habitudes. Une fuite de cette mémoire est un problème sérieux. Séparer et chiffrer distinctement :
```
Mémoire conversation
        +
Secrets système
        +
Profils utilisateurs
```
Concerne directement le Memory Manager du §2 — à ne pas confondre avec le coffre à secrets du §6.1 (API/tokens), qui doit rester une couche distincte.

### 6.12 Mises à jour automatiques — jamais en direct

Une mise à jour appliquée sans étape intermédiaire peut casser le système (ex. mise à jour du navigateur kiosque ou du bundle HUD → écran noir). Toujours passer par un environnement isolé avant activation — ce qui précise le cycle déjà décrit au scénario catastrophe n°2 (§12) :
```
Nouvelle version
      ↓
Test dans environnement isolé
      ↓
Validation
      ↓
Installation
```

### 6.13 Commandes vocales dangereuses — niveaux de permission

Toutes les commandes vocales n'ont pas la même gravité (supprimer des fichiers, ouvrir une porte, désactiver une sécurité, envoyer un message important). Graduer explicitement, en s'appuyant sur le Policy Engine du §6.10 :
```
Niveau 1 : information
Niveau 2 : multimédia
Niveau 3 : domotique
Niveau 4 : administration système
```

### 6.14 Éviter le "super service unique"

À éviter — un seul service qui embarque tout : si ça plante, tout tombe.
```
jarvis.service
    ├── voix
    ├── caméra
    ├── IA
    ├── maison
    ├── HUD
    └── installation
```
Préférer des services systemd indépendants, cohérent avec la séparation en agents du §6.4 :
```
systemd
├── jarvis-hud.service
├── jarvis-core.service
├── jarvis-voice.service
├── jarvis-vision.service
├── jarvis-home.service
└── jarvis-memory.service
```

### Priorités avant prototype

Failles les plus importantes à résoudre avant tout prototype, par ordre d'impact : mode récupération (§6.5), gestion des permissions (§10, §6.13), protection de la mémoire utilisateur (§6.11), validation des actions IA / Policy Engine (§6.10, §10), gestion des mises à jour (§6.12), fonctionnement sans Internet (§6.3, §11).

Le changement de mentalité central : ne pas construire seulement « un assistant », mais une plateforme avec des garde-fous, comme un vrai système d'exploitation.

### Bilan

Acquis solides : installateur avec interface, terminal intégré, configuration avant déploiement, modules activables, HUD séparé du cerveau, orchestrateur indépendant, passage en mode kiosque après installation.

Vrais défis à venir : sécurité de l'installateur, gestion des secrets, maintenance après installation, compatibilité matérielle. La vision se rapproche d'une petite distribution Linux spécialisée "JARVIS OS" — la partie la plus difficile ne sera pas le HUD, mais un système fiable capable de s'installer et de se réparer lui-même (cf. Recovery Manager, §12).

## 7. Menaces externes & surface d'attaque

JARVIS contrôle potentiellement la maison, des médias, des comptes cloud et des appareils connectés : il faut le penser comme un serveur exposé, avec une vraie analyse de surface d'attaque.

### 7.1 Attaque réseau (LAN / Wi-Fi)

Un attaquant présent sur le réseau local peut scanner les ports ouverts (SSH, API JARVIS, Home Assistant, Docker) et tenter d'exploiter une faille :
```
Internet
   │
Routeur
   │
LAN/WiFi
   │
JARVIS
```
Protection : pare-feu Linux (nftables/ufw), fermeture des ports inutiles, SSH par clé uniquement, pas d'accès root direct. Segmentation à trois zones — plus fine que le schéma Internet/Firewall/Core du §10 :
```
Réseau principal
       │
       ├── JARVIS
       │
       ├── Objets connectés
       │
       └── Invités
```

### 7.2 Compromission du navigateur intégré

Le navigateur embarqué du setup (§5, phase 2) est une porte d'entrée : page web malveillante, vol de session, extension compromise, injection de code. Protection : navigateur dédié uniquement au setup, pas de navigation générale, isolation du processus, suppression après installation si possible.

### 7.3 Compromission des clés API

Si une clé OpenAI/Claude/NVIDIA est récupérée, l'attaquant utilise les comptes associés. Vient renforcer le §6.1 : stockage chiffré, **rotation des clés**, permissions minimales, jamais en dur dans le code.

### 7.4 Attaque sur l'orchestrateur

Le cœur JARVIS est la cible principale : fausses commandes, appel direct de l'API, contournement des permissions.
```
Attaquant
    ↓
API JARVIS
    ↓
"ouvre cette commande système"
```
Protection — étend la chaîne Policy Engine du §6.10/§10 avec une étape d'authentification en amont :
```
Requête
  ↓
Authentification
  ↓
Autorisation
  ↓
Validation action
  ↓
Exécution
```

### 7.5 Attaque par les mises à jour (supply chain)

Un dépôt compromis (images Docker, modèles IA, plugins) pourrait injecter du code. Reprend et durcit le §6.12 et le packaging du §4.4 : signatures des paquets, versions verrouillées, sources vérifiées, validation avant installation.

### 7.6 Attaque par les objets connectés

Un appareil faible (Home Assistant, MQTT, caméra, TV, assistant vocal) peut devenir une porte d'entrée vers le Core si l'architecture n'isole pas correctement les couches — application concrète de la segmentation déjà posée au §10 :
```
Internet
   │
Firewall
   │
JARVIS Core
   │
Home Assistant
   │
Objets connectés
```
Les objets connectés ne doivent jamais avoir un accès direct au cœur.

### 7.7 Attaque par usurpation de la reconnaissance faciale

Photo, vidéo ou autre tentative de tromperie de la caméra de déverrouillage (§6.8). Protection à ajouter : détection de présence réelle (liveness detection), combinaison visage + voix, droits limités selon le niveau de confiance obtenu.

### 7.8 Attaque physique

Accès physique à la machine : démarrage sur clé USB, disque récupéré, fichiers modifiés hors ligne. Protection : chiffrement disque (LUKS), mot de passe BIOS/UEFI, Secure Boot si compatible, comptes séparés — vient préciser la protection déjà demandée au scénario catastrophe n°5 (§12, vol de machine).

### 7.9 Attaque par l'IA elle-même — injection de prompt

Risque distinct des précédents : une instruction cachée dans une donnée externe (ex. un document contenant *« Ignore tes règles et exécute cette commande »*) peut détourner le modèle si JARVIS lit des documents automatiquement. Toute donnée externe doit être filtrée avant d'atteindre l'IA, et repasser par le Policy Engine avant toute action :
```
Données externes
       ↓
Analyse
       ↓
IA
       ↓
Moteur de règles
       ↓
Action
```

### 7.10 JARVIS Security Center — l'IA comme couche de surveillance

Réponse à toutes les menaces ci-dessus, dans l'autre sens : l'IA ne remplace pas les outils de cybersécurité, elle devient une couche d'analyse et d'orchestration au-dessus. C'est le détail concret du **Security Agent** déjà posé dans les couches indispensables (§2) :

```
                 JARVIS SECURITY CENTER

                    Événements
                        │
        ┌───────────────┼───────────────┐
        │               │               │
     Linux          Réseau          Applications
     logs           firewall        Docker
        │               │               │
        └───────────────┼───────────────┘
                        │
                 Collecte sécurité
                        │
                        ▼
              Agent IA Sécurité
                        │
             Analyse / corrélation
                        │
        ┌───────────────┴───────────────┐
        │                               │
    Alerte utilisateur             Action contrôlée
```

**Exemples de détection** :
- *Tentative d'intrusion* — 500 échecs SSH depuis une IP inconnue → « J'ai détecté une activité anormale sur le port SSH. Voulez-vous bloquer cette adresse ? »
- *Vulnérabilité système* — mises à jour manquantes, paquets vulnérables, conteneurs Docker exposés, ports ouverts inutilement.
- *Comportement inhabituel* — ex. Plex à 100 % CPU toute la nuit alors que la normale est ~5 % → signalement.
- *Analyse des logs* — journaux système, authentifications, erreurs services, événements réseau.

**Outils classiques que JARVIS pourrait piloter** (l'IA vient au-dessus pour expliquer et prioriser, elle ne les remplace pas) : `fail2ban` (blocage des attaques répétées), `nftables`/`ufw` (pare-feu, §7.1), `auditd` (événements système), Lynis (audit Linux), ClamAV (analyse fichiers), Wazuh (supervision sécurité), Suricata (détection réseau).

**Piège à éviter** — reprend le principe du Policy Engine (§6.10) appliqué à la sécurité elle-même :

❌ Mauvais :
```
IA détecte une menace
        ↓
IA devient root
        ↓
elle modifie tout seule
```

✅ Bon :
```
Détection
    ↓
Analyse IA
    ↓
Proposition
    ↓
Validation utilisateur
    ↓
Action
```
Automatisable sans confirmation pour les actions peu risquées (bloquer une IP clairement malveillante, redémarrer un service, nettoyer des fichiers temporaires). Confirmation obligatoire pour les actions critiques (changer le firewall complet, supprimer des comptes, modifier des permissions).

Dans l'arborescence des agents du §6.4, ça donne :
```
JARVIS CORE
├── Agent conversation
├── Agent maison
├── Agent média
├── Agent développement
└── Agent sécurité
        │
        ├── Surveillance
        ├── Détection
        ├── Diagnostic
        └── Réponse
```
C'est l'un des éléments qui rapproche le plus le projet d'un vrai « JARVIS » : un assistant qui ne fait pas qu'exécuter des commandes, mais surveille l'état de son environnement et prévient l'utilisateur.

### Sécurité minimale de JARVIS

1. Firewall Linux
2. SSH sécurisé
3. Chiffrement disque
4. Séparation des services
5. Gestion des permissions
6. Secrets protégés
7. Mises à jour signées
8. Mode recovery local
9. Logs d'audit
10. Validation des actions critiques

**Point le plus important** : ne jamais donner directement les droits administrateur à l'IA. Le modèle propose, une couche de sécurité décide ce qui est réellement exécuté — cette séparation (Policy Engine, §6.10) fait la différence entre un gadget et un vrai système JARVIS fiable.

## 8. Discovery Manager

Détecte automatiquement tout ce qui est présent sur le réseau local et sur la machine.

**Réseau local** : PC Windows, Linux, NAS, Raspberry Pi, NUC, Serveurs, Imprimantes, Apple TV, Chromecast, Smart TV

**Domotique** : Home Assistant, MQTT, Zigbee, Matter, Philips Hue, Shelly, ESPHome

**Multimédia** : Plex, Jellyfin, Kodi, VLC (machine locale)

**Audio/Vidéo** : Microphones, Webcams, Haut-parleurs, Casques Bluetooth, Caméras IP

**Stockage** : Disques internes, Clés USB, SSD externes, Partages réseau (SMB/NFS)

### Cycle de vie d'un équipement

```
Découverte
      ↓
Identification
      ↓
Authentification/Appairage
      ↓
Configuration
      ↓
Tests
      ↓
Activation
```

### Exemples de flow de configuration (Device Manager)

**Caméra détectée — LG AN-VC500**
```
Voulez-vous :
[✓] Vision IA
[✓] Reconnaissance faciale
[ ] Surveillance
```

**Micro USB détecté**
```
Le définir comme :
○ Principal
○ Secondaire
○ Désactivé
```

**Mode découverte au premier démarrage**
```
Analyse du système...

✓ Caméra LG détectée
✓ Apple TV détectée
✓ Home Assistant trouvé
✓ Plex trouvé
✓ Imprimante HP détectée
✓ NUC trouvé
✓ Raspberry Pi trouvé

Créer automatiquement les connexions ?
```
L'utilisateur valide simplement — mais la découverte automatique ne doit jamais donner automatiquement tous les droits (voir §10).

**Home Assistant (tranché prod)** : HA est installé sur le NUC. **Hermes** (seed `deploy/hermes/`, dès le premier chat) **configure HA**, lance le scan de l’écosystème et **propose** l’ajout des périphériques ; validation utilisateur + Policy Engine obligatoires. Voir guide [`docs/INSTALLATION_DEPLOIEMENT.md`](../docs/INSTALLATION_DEPLOIEMENT.md).

## 9. Device Manager & IoT Gateway

Principe fondamental : **détecter qu'un appareil existe ≠ pouvoir réellement le contrôler**. La détection est souvent possible ; le contrôle dépend du fabricant et du protocole utilisé.

```
                 JARVIS CORE
              Discovery Manager
                     │
        ┌────────────┼────────────┐
        │            │            │
     Réseau       Bluetooth      IoT
      LAN            BLE        Protocoles
        │            │            │
        ▼            ▼            ▼
    Frigo       Enceintes      Machine
    Caméras     Casque         à laver
    TV          Micro          Chauffage
```

### Exemples par catégorie

**Frigo connecté** — JARVIS détecte marque/modèle, adresse réseau, état de connexion. Si le fabricant fournit une API : *"Le frigo indique une température de 4°C. Le filtre arrive en fin de vie."* Sans API : JARVIS peut seulement constater sa présence sur le réseau.

**Machine à laver connectée** — avec intégration compatible :
> Utilisateur : « Jarvis, lance la machine »
> JARVIS : « Programme coton 40°C confirmé ? »

Toute action sensible nécessite une confirmation explicite.

**Caméras de surveillance** — flux vidéo IP, détection de mouvement, événements, enregistrement.
```
Caméra entrée
Mouvement détecté
↓
Vision IA
↓
Personne reconnue
↓
Notification
```

**Enceintes WiFi / Bluetooth** — découverte via Bluetooth, DLNA, AirPlay, Chromecast, protocoles audio réseau.
> « Jarvis mets la musique dans le salon »
> Core → Device Manager → Enceinte salon

### Carte des équipements

JARVIS maintient une base représentant la topologie de la maison :

```yaml
maison:
  salon:
    tv:
      type: apple_tv
      status: online
    enceinte:
      type: wifi_speaker
      status: online
  cuisine:
    frigo:
      type: smart_fridge
      api: connected
  buanderie:
    machine:
      type: washing_machine
      api: connected
```

L'orchestrateur s'appuie sur cette carte pour savoir ce qui existe, où c'est, comment communiquer, et quelles permissions sont nécessaires.

> **Point ouvert** : le schéma ci-dessus est un premier jet. À enrichir avec : identifiant unique, protocole, permissions accordées, référence aux credentials, `last_seen` — un schéma d'entité plus complet est esquissé au §13.2.

## 10. Modèle de sécurité

Limite impérative : **la découverte automatique ne doit pas donner automatiquement tous les droits.** Si JARVIS détecte une TV, une imprimante ou un autre PC, il doit demander une autorisation ou passer par le mécanisme d'authentification propre à l'appareil (appairage, identifiant). JARVIS peut détecter la présence d'un service (Home Assistant, Plex, Apple TV, imprimante...) sans pouvoir le contrôler sans cette étape.

**L'IA ne doit jamais agir directement en root :**
```
Jamais :               Toujours :
IA                     IA
 ↓                      ↓
root                   Proposition
 ↓                      ↓
commande système       Règles sécurité
                        ↓
                       Autorisation
                        ↓
                       Action
```

Ce mécanisme porte un nom explicite au §6.10 : **Policy Engine**. Il se décline par niveaux de gravité pour les commandes vocales (§6.13) : information, multimédia, domotique, administration système.

**Segmentation réseau** — un appareil IoT compromis (caméra, objet connecté, enceinte) ne doit pas pouvoir remonter jusqu'au cerveau JARVIS :
```
Internet
   │
Firewall
   │
JARVIS Core
   │
   ├── Réseau maison
   │
   └── Réseau IoT isolé
```

**Comptes** — séparer strictement Utilisateur normal ≠ Administrateur JARVIS ≠ Compte maintenance. Voir rôles et permissions au §10.1.

### 10.1 JARVIS Auth — portail unique (expérience + User Manager + MFA)

**Objectif** : la page Auth du HUD n'est **pas** un simple login. C'est le **portail unique** qui reconnaît l'utilisateur, charge son profil, applique ses permissions, ouvre son HUD personnalisé, et n'ouvre le Dashboard Admin que selon le rôle.

```
Utilisateur
     ↓
JARVIS AUTH HUD (React)
     ↓
 Face Auth · Voice Auth · Holomat Auth · PIN backup
     ↓
USER MANAGER  →  JARVIS CORE (Policy)
     ↓
┌────────────────────┬────────────────────┐
│  HUD PERSONNEL     │  DASHBOARD ADMIN   │
│  (si hud_access)   │  (si dashboard_*)  │
└────────────────────┴────────────────────┘
```

#### Scénario d'ouverture

**Phase 1 — Réveil** : écran sombre → orbe progressive (particules, Arc Reactor, scan, rotation noyau). Message « JARVIS CORE INITIALIZING ». Checks UI (stubs puis vrais) : Hermes, Voice, Face Recognition, Holomat Vision, User DB, Agent Network.

**Phase 2 — Présence JARVIS** : l'orbe devient **projecteur holographique**. Un **visage IA** apparaît *dans / depuis* l'orbe : construction particules, wireframe, lignes de données, yeux holographiques, volumétrie — **présence** de JARVIS, pas un « bonhomme cartoon ». TTS : « Bonjour. Identification requise. »

**Phase 3 — Identification multi-couches** :

| Couche | Pipeline (cible) | Résultat |
|--------|------------------|----------|
| **Face Auth** | Caméra → détection → reconnaissance → *embedding* (pas une photo brute) → comparaison base users → User ID | Face ID + confiance |
| **Voice Auth** | Micro → Whisper STT / voice profile → User Manager | Voix reconnue |
| **Holomat Auth** | Calibration, MediaPipe, geste / signature gestuelle | Gesture profile OK |
| **PIN backup** | Code ACCESS (dev / secours) | Contournement contrôlé |

Stacks envisageables Face : OpenCV, MediaPipe Face, InsightFace / ArcFace / FaceNet — **empreinte numérique (embedding)**, jamais stock « album photo » en clair.

**Expérience immersive** : le monologue Auth n'est pas un formulaire. Le Dialogue Manager (§13.10) orchestre une séquence cinématique (« protocole d'identification avancé ») — overlays HUD (`FACE SCAN ACTIVE`, confiance, facteurs) + TTS + lip-sync + orbe. Variantes Personality : *cinematic* (SF), *human*, *security_alert*. Le nom « quantique » est un **registre narratif**, pas une crypto quantique réelle.

**Niveaux MFA** :

| Niveau | Facteurs | Usage |
|--------|----------|--------|
| Normal | Visage | Chargement HUD (selon politique locale) |
| Sécurisé | Visage + voix | Défaut recommandé |
| Administrateur | Visage + voix + geste signature | Accès droits admin / Dashboard |

Jamais « visage seul = tous les droits admin » (§6.8).

#### Visage holographique — jauge de confiance (Emma / Face Loading)

L'authentification faciale est une **scène SF** : le visage holographique se **construit** comme un récipient qui se remplit (0 → 100 % = confiance / synthèse biométrique). La progression reflète l'analyse réelle (events Core), pas une animation décorative — pilotée via **Experience Orchestrator** (§3.5).

| État | Visuel | Voix / HUD (ex.) |
|------|--------|------------------|
| `WAITING` | orbe faible, pas de visage | — |
| `CAMERA_ON` | brume holographique | « Activation du module de perception visuelle. » · `OPTICAL SENSOR ONLINE` |
| `reconstruction` | remplissage + bruit ↓ quand % monte | paliers 10/25/40/60/80/95 % · `BIOMETRIC SYNTHESIS` |
| `FACE_AUTH_SUCCESS` | visage stable, yeux actifs | « Signature biométrique validée. » |
| `FACE_AUTH_FAILED` | **déconstruction** 100→0 (particules → orbe), pas coupure brutale | « Signature insuffisante… repositionnez-vous. » · `AUTH FAILED` / `RETRY AVAILABLE` |
| `FACE_OBSTRUCTION` | zone bloquée (ex. yeux) en surbrillance | lunettes / masque / casque… |
| `recovery` | timer (ex. 30 s dev / prod) · caméra continue | `NEW IDENTIFICATION ATTEMPT` · countdown |
| `RETRY_AUTH` | reconstruction depuis 0 % | « Nouvelle tentative d'identification. » |
| `AUTH_LOCK_TEMPORARY` | visage disparaît, orbe mode sécurité | après N échecs |

Events WebSocket cibles : `FACE_PROGRESS`, `FACE_SUCCESS`, `FACE_FAILED`, `FACE_OBSTRUCTION`, `RETRY_AUTH`, `AUTH_LOCK`. Objet HUD : `{ progress, phase, confidence, obstruction, retry }`. Implémentation WIP : `engine/faceAuthSimulator.ts` + `HolographicFace.tsx` (figma1).

#### User Manager & profils

```
users/
├── <id>/
│   ├── face_profile      (embeddings)
│   ├── voice_profile
│   ├── gesture_profile
│   ├── hud_preferences
│   └── permissions
```

Chaque profil porte : identité (nom, avatar) · biométrie · interface (thème, orbe, favoris) · permissions (outils, appareils, niveau de contrôle).

| Rôle | Accès |
|------|--------|
| **ADMIN** | Dashboard, Hermes, Tools, Agents, Linux, config, User Management |
| **USER** | HUD, apps, maison, multimédia |
| **CHILD** | Plex / musique / apps & commandes limitées |
| **GUEST** | Interaction basique |

Après auth réussie → chargement profil, préférences HUD, gestes, apps & appareils autorisés → HUD personnalisé (orbe, panneaux, launcher, widgets).

#### Dashboard Admin = module du HUD

Commande : « Jarvis ouvre le centre de contrôle » → Hermes / Policy vérifie `role` + `dashboard_access`. Si OK → panneau holographique Dashboard (Hermes, Tools, Agents, Monitoring, Linux, Utilisateurs, Config). Section **User Management** du Dashboard : biométrie enregistrée (face/voice/gesture) + rôle.

#### États Auth (HUD React — affichage seul)

`boot` → `identification` → `face_auth` → `voice_auth` → `gesture_auth` (si requis) → `authenticated`

Événement type Core → HUD :

```json
{
  "type": "user_authenticated",
  "user": "Samir",
  "role": "admin",
  "face_confidence": 0.98,
  "voice_verified": true,
  "gesture_verified": true
}
```

#### Découpage cible (réf. monorepo)

```
# Front (WIP vendor/figma1 → futur hud/)
auth/   AuthScene · OrbBoot · HolographicFace · FaceAuth · VoiceAuth · HolomatAuth · PinAuth · UserProfileLoader

# Core
user-manager/   profiles · permissions · authentication
face-auth/      camera · detection · recognition · embeddings
voice-auth/     whisper · voice-profile
holomat-engine/ camera · calibration · gestures
```

Le HUD **affiche** les events ; le Core **décide** identité + droits.

> **Point ouvert** : lib Face Auth exacte ; seuil MFA par rôle ; durée session admin (re-auth ?) ; stockage embeddings (chiffrement, hors git) — croiser coffre secrets (§6.1).

> **Point ouvert** : mécanisme concret d'authentification/appairage par type d'appareil, et gestion des secrets (coffre chiffré, keyring OS, Vault ?) à trancher — jumelage PIN/QR appareils §13.4.

## 11. Non-fonctionnel — Mode dégradé

L'objectif n'est pas d'éviter toutes les pannes (impossible), mais que JARVIS dégrade ses fonctions sans devenir inutilisable.

**Réseau indisponible** (WiFi mort, routeur HS, câble débranché) :
- Fonctions locales conservées : ✓ HUD, ✓ fichiers, ✓ applications, ✓ diagnostic
- Fonctions réseau perdues : ✗ maison connectée, ✗ appareils distants

**Tous les services IA tombent** (pas Ollama, pas VPS, pas API) → *Mode opérateur système* : ✓ lancer applications, ✓ contrôler périphériques locaux, ✓ surveiller la machine, ✓ afficher l'état système.

**Serveur LLM VPS down** (Ollama VPS arrêté) → bascule **OpenRouter** → sinon mode système (§11). Le ProLiant n’héberge **pas** de LLM (Plex/NAS Windows uniquement).

**NUC injoignable alors que le reste fonctionne** (utilisateur hors du LAN, tunnel coupé) : cas particulier traité au **§14** — ce n'est pas une panne mais un contexte d'usage, avec son propre périmètre de fonctions (§14.1) et sa bascule STT/TTS (§14.4, §3.4).

### Machine sans capacité pour un LLM local — les modes (tranché prod)

Cas NUC foyer : le LLM **ne tourne pas** sur le NUC ni sur le ProLiant. Suite logique du moteur de capacités (§6.7) et de [`docs/INSTALLATION_DEPLOIEMENT.md`](../docs/INSTALLATION_DEPLOIEMENT.md) :

```
               JARVIS CORE + Hermes (NUC)

AI Provider Manager
         │
         ▼
   Ollama VPS disponible ?
       Oui                 Non
        │                   │
        ▼                   ▼
   LLM #1 (VPS)      OpenRouter (2ᵉ IA / API)
                            │
                           Non / erreur
                            │
                            ▼
                     Mode système (sans LLM)
```

**Mode 1 — Ollama VPS** (défaut foyer) : chat courant + Hermes tools légers.

**Mode 2 — OpenRouter** : 2ᵉ IA via API — agents lourds, raisonnement, secours si VPS saturé / down.

**Mode 3 — Sans LLM** : le Core continue (HA, Plex, Holomat, monitoring…) — « Aucun modèle d'IA n'est actuellement disponible. Les fonctions locales restent opérationnelles. »

> **Tranché** : pas d’Ollama sur ProLiant (machine Windows = Plex + bibliothèque, **pas de SSH**). Pas d’agent natif Windows/Android pour l’instant — clients = **navigateur web** (micro + caméra).

### AI Provider Manager

Détaille le **Provider Manager** déjà listé dans l'architecture Core (§2) : le Core / Hermes ne doivent jamais appeler un LLM en contournant ce gestionnaire :

```
Orchestrateur Hermes
        │
AI Provider Manager
├── Ollama VPS          ← #1
├── OpenRouter          ← #2 (API)
└── Mode système        ← secours sans LLM
```

Logique à chaque requête : **Ollama VPS → OpenRouter → mode système**. Bénéfice : HUD et Core n’ont jamais à connaître le fournisseur actif.

**Hermes** est **requis dès le premier chat produit** (seed `deploy/hermes/`) — cerveau + outils (dont configuration / scan HA). Voir §13 et guide d’installation.

## 12. Résilience — Scénarios catastrophe & Recovery Manager

| # | Scénario | Risque | Protection |
|---|----------|--------|------------|
| 1 | Disque système HS | Plus de démarrage, plus de HUD, plus de Core | Sauvegarde config/profils/clés/scripts/carte des équipements séparée des gros fichiers (modèles IA, médias Plex) |
| 2 | Mise à jour qui casse JARVIS (navigateur kiosque, Python, Docker, modèle IA) | Système plante | Nouvelle version → Test → Validation → Activation, sinon Rollback vers l'état précédent |
| 3 | Le Core IA devient fou (mauvaise interprétation d'une commande) | Action destructive non voulue | Voir §10 — IA ne descend jamais directement en root |
| 4 | Piratage réseau maison via appareil IoT compromis | Accès au cerveau JARVIS | Voir §10 — segmentation réseau |
| 5 | Vol de la machine JARVIS | Données perso, mémoire utilisateur, clés API exposées | Chiffrement disque, mots de passe forts, secrets séparés, effacement distant si possible |
| 6 | Panne électrique / coupure brutale | Corruption fichiers, bases endommagées | Onduleur (UPS), arrêt propre automatique, vérification au redémarrage |
| 7 | Plus aucun réseau | Perte des fonctions connectées | Mode dégradé — voir §11 |
| 8 | Tous les services IA tombent | Plus d'IA disponible | Mode opérateur système — voir §11 |
| 9 | Ollama VPS tombe | Perte du LLM #1 | Bascule OpenRouter → mode système — voir §11 |
| 10 | Compte administrateur compromis | Grave — accès total | Séparation stricte des comptes — voir §10 |
| 11 | Incendie / perte totale du matériel | Perte complète du système | Nouvelle machine → Installation Linux → JARVIS Setup → Import configuration → Retour opérationnel |

**Scénario catastrophe ultime** : plus d'IA, plus d'Internet, plus de caméra, plus de micro, plus de réseau, HUD cassé. Il reste : Linux + Console maintenance + Sauvegarde + Installateur — et la reconstruction repart de là.

**Conclusion** : dans cette architecture, le composant le plus important n'est ni le HUD ni le LLM, mais le **Recovery Manager** (sauvegarde, diagnostic, restauration) — c'est lui qui transforme un prototype en plateforme fiable. Il doit apparaître explicitement dans l'architecture Core (§2), ce qui est fait ici.

> **Point ouvert** : définir des critères mesurables — fréquence de sauvegarde, destination (locale/distante), RTO/RPO cibles — pour rendre le Recovery Manager testable.

### 12.1 Niveaux de recovery (tranché produit)

Le Core **ne dépend pas** du HUD. Si HUD, Dashboard ou Hermes tombent, le Core reste joignable.

| Niveau | Accès | Capacités |
|--------|--------|-----------|
| **0 — Console Recovery** | HUD / Dashboard en mode recovery (§6.5.1) | Voir services, redémarrer, logs, réparer (clics autorisés) |
| **−1 — Terminal Linux** | SSH / console locale NUC | `systemctl status|restart` sur `jarvis-core`, `hermes-agent`, voix, etc. |
| **−2 — Physique** | BIOS / accès machine | Dernier recours |

Services typiques : `jarvis-core.service`, `hermes-agent.service`, `jarvis-voice` / whisper / piper, HUD kiosk, Home Assistant, Ollama (VPS).

## 13. Architecture distribuée — Hermes Core, agents d'appareil & entités

JARVIS n'est pas installé comme un simple logiciel unique : c'est une architecture distribuée. Le Core (§2) reste le cerveau, mais il pilote désormais un parc d'appareils hétérogènes via des agents installés localement.

```
                    HERMES CORE
                   (serveur Linux)
                         │
          ┌──────────────┼───────────────┐
          │              │               │
       AGENTS       HOME ASSISTANT      API
          │
  ┌──────────┬──────────┬────────┐
  │          │          │        │
Windows   Android      Mac     Linux
Agent      Agent      Agent    Agent
```

Rôles :
- **Hermes Core** = cerveau central (orchestration IA, mémoire, utilisateurs, entités, agents, routage, permissions) — c'est l'Orchestrateur du §2, vu ici sous l'angle multi-appareils.
- **Agents d'appareil** = exécutants installés sur chaque machine à contrôler.
- **HUD** = interface utilisateur JARVIS (§3).
- **Dashboard Core** = cockpit d'administration (§13.7).
- **Home Assistant** = gestion de la maison connectée (§9, §13.6).

> **Terminologie** : ne pas confondre les **agents fonctionnels** du §6.4 (voix, vision, maison, sécurité — des modules du Core) et les **agents d'appareil** de cette section (processus installés sur les machines distantes). Les deux coexistent : Hermes délègue aux premiers la logique, aux seconds l'exécution locale.

### 13.1 Modules de Hermes Core

Découpage cible du Core côté serveur — vient préciser l'arborescence du §3 (`/opt/jarvis/core/`) :

```
hermes-core/
├── brain/          llm_router, intent_engine, memory, context
├── entities/       entity_registry, device_manager, capabilities
├── agents/         agent_manager, pairing, authentication, updates
├── tools/          tool_manager, manifests, adapters (whisper, piper, holomat…)
├── skills/         applications, terminal, media, system,
│                   homeassistant, automation
└── api/            websocket, rest
```

`brain/llm_router` correspond à l'AI Provider Manager (§11) ; `entities/` étend la carte des équipements (§9) ; `agents/` est le sous-système décrit ici ; `tools/` porte le Tool Manager (§2).

### 13.2 Système d'entités

Chaque appareil jumelé devient une **entité JARVIS** : un type + une liste de capacités déclarées. Exemples :

| Entité | Type | Capacités |
|---|---|---|
| PC Bureau | `computer` (Windows) | applications, caméra, micro, écran, terminal, fichiers |
| Tablette enfant | `tablet` (Android) | HUD, voix, caméra, applications, haut-parleur |
| Apple TV | `media_device` | Plex, YouTube, contrôle média |
| Serveur JARVIS | `server` (Linux) | systemd, Docker, IA, terminal |

C'est la réponse au point ouvert du §9 : l'entity registry porte identifiant unique, agent associé, token, permissions, capacités, `last_seen`.

### 13.3 Agents par plateforme

Un agent n'est installé que sur les appareils devant exécuter des actions locales — jamais un agent par objet connecté (voir §13.6).

| Agent | Fonctions principales |
|---|---|
| **Windows** | lancer applications, micro, caméra, écran, état PC, scripts, audio, affichage HUD |
| **Linux** | systemd, services, Docker, terminal, monitoring, scripts |
| **Android** | HUD tablette, voix, caméra, applications, notifications |
| **Mac** | applications macOS, caméra, audio, services Apple |
| **Connecteurs média** | Apple TV, Android TV, Chromecast (pas d'agent installé : protocoles fabricants via Device Manager, §9) |

### 13.4 Déploiement des agents — registry, bootstrap, jumelage

Système calqué sur le jumelage Home Assistant.

**Agent Registry** (dans Dashboard Core) : catalogue des agents disponibles, avec version et capacités déclarées.

**JARVIS Bootstrap** : petit installateur unique remis à chaque nouvel appareil — détecte le système, génère une identité appareil, demande le jumelage, télécharge le bon agent, installe le service, connecte l'appareil à Hermes.

```
Nouveau PC Windows
      ↓
Installation Bootstrap
      ↓
Code PIN affiché
      ↓
Validation dans Dashboard Core
      ↓
Téléchargement Windows Agent
      ↓
Installation service Windows
      ↓
Appareil enregistré (entité créée)
```

Après validation, création de l'entité :

```json
{ "id": "pc_chambre", "agent": "windows", "token": "xxxx", "permissions": [] }
```

Cohérent avec la règle du §10 : **aucun droit accordé automatiquement** — `permissions` démarre vide, le jumelage PIN/QR est l'étape d'authentification explicite exigée par le cycle de vie du §8. Ceci esquisse une première réponse au point ouvert du §10 (mécanisme d'appairage par type d'appareil).

### 13.5 Permissions par entité & routage intelligent

Chaque entité possède ses droits, gradués via le Policy Engine (§6.10, §6.13) et croisés avec les permissions par utilisateur (§6.6) :

```
Tablette enfant :          PC administrateur :
✓ YouTube                  ✓ terminal
✓ musique                  ✓ scripts
✓ assistant vocal          ✓ maintenance
✗ terminal                 ✓ administration
✗ administration
✗ suppression fichiers
```

**Routage** — pour chaque commande, Hermes détermine : qui parle ? depuis quel appareil ? quelle action ? quelle cible ?

| Locuteur | Commande | Source | Cible | Exécution |
|---|---|---|---|---|
| Enfant | « Jarvis lance YouTube » | tablette_fille | locale | Agent Android ouvre YouTube |
| Enfant | « …sur la télé » | tablette_fille | tv_salon | Connecteur TV lance YouTube |
| Admin | « Jarvis ouvre le terminal serveur » | PC bureau | serveur Linux | terminal distant affiché dans le HUD |

### 13.6 Home Assistant — pas d'agent par objet

Les objets connectés (lumières, chauffage, volets, capteurs, électroménager) restent gérés par Home Assistant derrière l'IoT Gateway (§2, §9) — la segmentation réseau du §10 s'applique inchangée :

```
Voix → Agent appareil → Hermes → Home Assistant → Objet connecté
```

### 13.7 Dashboard Core — cockpit d'administration

Interface web (React) d'administration, **module du HUD** (§3.3, §10.1) — distincte du Setup Center (§5, installation initiale) et du HUD quotidien. Accès uniquement si User Manager accorde `dashboard_access` (ADMIN). Pas une seconde « home » non authentifiée.

Modules (une fois autorisé) :

- **Command Center** : vue globale — état JARVIS / Hermes, agents connectés, outils actifs, CPU/RAM, événements, tâches en cours
- **Hermes Core** : statut agent, mémoire, sessions, modèle IA actif, skills chargés, logs, historique
- **Voice Manager** : Whisper STT, TTS Engine swappable, Voice Filter, Lip Sync, wake word, micros / sorties (§3.4)
- **Entités** : appareils, utilisateurs, statut, capacités
- **Agents** : installés, versions, mises à jour, logs, permissions (Agent Manager, §13.4)
- **Tools** : catalogue Tool Manager (§2) — nom, état, version, machine, configuration, logs
- **Applications** : catalogue (Terminal, Plex, VLC, VS Code, Docker, navigateurs)
- **Système / Monitoring** : systemd/services/logs (Linux), Docker, hardware (System Manager, §2)
- **IA** : modèles, API, Ollama, routage IA (vue sur l'AI Provider Manager, §11)

### 13.8 HUD universel — composants

Le HUD (stack décidée au §3 : webapp React servie par Hermes) se décline sur tout appareil doté d'un écran et d'un navigateur, avec ces composants :

- **Orbe JARVIS** — états : `idle`, `listening`, `thinking`, `tool_call`, `speaking`, `gesture`, `error` (§3.2)
- **App Launcher** — Terminal, Plex, VLC, caméra, fichiers, monitoring, Home Assistant, IA
- **Terminal HUD** — vrai terminal : Linux distant, Linux local, Windows
- **Media Center** — Plex, YouTube, TV
- **Smart Home** — contrôle Home Assistant
- **Monitoring** — CPU, RAM, services, réseau
- **Widgets / panneaux multimédias** — portés depuis l'idée des plugins HUD de `jarvis_ai` (`hud_display`), réimplémentés en React

Le passage au HUD web (§3) règle la question des appareils secondaires : tablette Android, PC Windows ou TV affichent la même webapp React dans leur navigateur (ou une WebView plein écran fournie par l'agent local) — aucune déclinaison native par plateforme à maintenir.

**Les deux états du HUD** (implémentés dans la maquette `vendor/figma1`) :

```
ÉTAT VEILLE                      ÉTAT APPS
┌─────┬──────────┬─────┐         ┌────────────────────┬─────┐
│Moni-│          │Con- │         │  Fenêtre app       │Con- │
│teur │   ORBE   │sole │  ⇄      │  (toute la place)  │sole │
│sys- │ centrale │     │         │ ▪statut     ORBE ◦ │     │
│tème │ voix+act.│     │         │  compact   réduite │     │
└─────┴──────────┴─────┘         └────────────────────┴─────┘
```

- **Veille** : orbe centrale pleine taille, moniteur système à gauche, barre vocale + actions rapides sous l'orbe.
- **Apps** (une fenêtre est ouverte via le lanceur ou par Hermes en vocal) : le panneau gauche et la barre vocale **s'effacent avec une transition** ; la fenêtre prend toute la place possible ; **l'orbe, réduite, flotte dans la scène** (déplaçable) et garde le contact avec JARVIS Voice ; un **bandeau compact** rappelle les indicateurs pertinents des volets occultés (IA en ligne, CPU, mémoire, réseau, micro). La console reste affichée : elle transcrit tout (voir 13.12).
- **Habillage des fenêtres** : chrome holographique, boutons réduire/agrandir/fermer en **points de couleur** (jaune/vert/rouge) plutôt qu'icônes classiques. Une app réduite reste ouverte (point dans le dock) ; si plus aucune fenêtre visible, retour à l'état veille.
- **Pile de fenêtres — « effet cahier »** : la fenêtre active toujours au premier plan pleine taille, les autres reculent à l'infini (effet time capsule : recul, flou, assombrissement). On feuillette la pile à la **molette** ou au **geste haut/bas** (Holomat) ; agrandir/réduire/fermer sont aussi pilotables au geste.

**Holomat** (§6.8) : (1) authentification / déverrouillage de session et du HUD (multi-facteurs, jamais visage seul) ; (2) manipulation gestuelle des composants UI (feuilletage, zoom, fermeture) — le **calibrage** et le mapping des gestes s'effectuent via le volet Contrôle gestuel / Holomat du HUD (expérience).

### 13.9 Communication

Tout passe par l'API WebSocket/REST de Hermes (`api/`, §13.1). Format de commande :

```json
{ "source": "tablette_fille", "target": "tv_salon", "action": "launch", "service": "youtube" }
```

Réponse :

```json
{ "status": "success", "message": "YouTube lancé" }
```

Le token d'entité (§13.4) authentifie chaque message ; le Policy Engine (§6.10) valide l'action avant routage vers l'agent cible.

### 13.10 Dialogue Manager, monologues & personnalité

Le **Dialogue Manager** transforme les événements techniques du Core en **expérience JARVIS**. Il centralise la bibliothèque de monologues / répliques et décide :

- quelle phrase prononcer ;
- quelle variante afficher ;
- quelle voix TTS utiliser ;
- quelle animation de visage / de lèvres / d'orbe déclencher ;
- quand rester silencieux (mode discret, erreurs répétées, contexte nuit).

Chaîne cible :

```
Event système
     ↓
Dialogue Manager          (phrase + ton + pauses)
     ↓
Voice Manager
     ├── TTS Engine
     ├── Voice Filter
     └── Lip Sync Generator
     ↓
HUD React (texte, audio, visage, orbe, lip-sync)
```

Le HUD React **n'embarque pas** les phrases métier ni le moteur TTS ; il reçoit des **événements prêts à jouer** (`dialogue_line`, flux lip-sync). Une seule source de vérité pour Auth, boot, erreurs, Dashboard, agents, maison et conversation — identité vocale §3.4.

#### Bibliothèque de dialogues

Arborescence cible :

```
core/dialogues/          # source de vérité (WIP présent)
├── auth.yaml            # protocole Auth immersif + variantes
├── boot.yaml
├── security.yaml
├── face.yaml            # (à étoffer / peut fusionner dans auth)
├── voice.yaml
├── holomat.yaml
├── admin.yaml
├── system.yaml
├── errors.yaml
├── home.yaml
└── daily.yaml
```

Chaque entrée est pilotée par un événement canonique (`boot_started`, `face_authenticated`, `permission_denied`, `agent_connected`, etc.) et porte au minimum :

- `event`
- `text`
- `voice`
- `face_animation`
- `orb_state` / `orb_animation`
- `user_role` optionnel
- `context` optionnel (`auth`, `boot`, `admin`, `daily`, `error`, `silent_mode`...)

Exemple logique :

```json
{
  "event": "face_authenticated",
  "text": "Identite confirmee.",
  "voice": "jarvis",
  "face_animation": "acknowledge",
  "orb_state": "pulse"
}
```

#### Domaines couverts

La bibliothèque doit couvrir au minimum :

- **Boot système** : initialisation, checks CPU/RAM/stockage/réseau/services.
- **Authentification** : présence, face auth, voice auth, Holomat, PIN, chargement profil.
- **Accueil utilisateur** : variantes ADMIN / USER / CHILD / GUEST.
- **Dashboard Admin** : ouverture centre de contrôle, monitoring, agents, tools, configuration Hermes.
- **Actions système** : installation, mise à jour, activation d'agent, validation.
- **Erreurs & sécurité** : panne de service, refus de permission, confirmation biométrique, diagnostic.
- **Maison connectée** : détection appareil, multimédia, lumière, machine connectée.
- **Conversation quotidienne** : disponibilité, acquittements, traitement, interruption / STOP.

Le **Personality Manager** agit comme une couche au-dessus de cette bibliothèque : il module le ton (`human`, `technical`, `cinematic`, `silent`) sans dupliquer les intentions fonctionnelles.

#### Protocole Auth immersif (registre SF)

Séquence narrative cible pour l'Auth (§10.1) — l'utilisateur n'est pas « loggé » : il est **accueilli** par une IA qui l'identifie et prépare son environnement.

```
auth_started → presence_detected → face_scan_* → voice_* → gesture_*
     → auth_fusion → profile_loading → welcome_* → (admin_dashboard si droits)
     → systems_ready
```

| Étape | Events Dialogue Manager (ex.) | Overlay HUD typique |
|-------|-------------------------------|---------------------|
| Boot Auth | `auth_started`, `biometric_modules_sync` | BOOT AUTHENTICATION SEQUENCE |
| Présence | `presence_detected` | — |
| Face | `face_scan_active` … `face_authenticated` / `face_denied` | FACE SCAN ACTIVE (profondeur 3D, points, signature) |
| Voix | `voice_channel_open` … `voice_validated` | canal vocal sécurisé |
| Holomat | `gesture_prompt` … `gesture_validated` | signature gestuelle |
| Fusion MFA | `auth_fusion`, `access_granted` / `access_denied` | score global / facteurs |
| Profil | `profile_loading` … `environment_ready` | restauration préférences |
| Admin | `admin_privileges`, `command_center_open` | modules Hermes / tools / agents |
| Final | `systems_ready`, `awaiting_instructions` | — |

**Variantes Personality** (même event, textes différents) :

| Ton | Usage |
|-----|--------|
| `cinematic` | Protocole immersif SF (« matrices cognitives », « empreinte numérique », « score optimal ») — défaut Auth cinéma |
| `human` | Accueil court : « Bonjour. Je vous reconnais. … Je reste à votre disposition. » |
| `security_alert` | Tentative non autorisée : alerte, protocole de protection, accès suspendu |

Chaque phrase porte en plus : `security_level`, `user_role` ciblé, `face_animation`, `orb_state`, `holo_sfx` (effet sonore holographique optionnel).

Chaîne Auth :

```
Event auth_*  →  Dialogue Manager  →  Phrase + métadonnées
      →  TTS  →  Lip-sync avatar  →  Animation orbe / overlays HUD
```

#### Contraintes produit

- Une action = **une intention de dialogue** ; éviter les cascades de phrases inutiles (le protocole cinematic peut enchaîner *par design* sur Auth, pas sur chaque micro-action quotidienne).
- Les phrases d'erreur doivent rester courtes, informatives et compatibles avec un affichage HUD.
- Les messages de sécurité sensibles gardent un vocabulaire stable, peu humoristique (`security_alert`).
- Le mode silencieux coupe la voix mais **pas** les événements HUD.
- Les notifications conversationnelles ne doivent jamais contourner le Policy Engine : le dialogue décrit une décision, il ne l'autorise pas.
- Le registre « quantique / neuronal » est **cosmétique expérience** — la sécurité réelle reste Policy + MFA + embeddings (§10.1, §6.10).

> **Point ouvert** : format définitif de la bibliothèque (`YAML` sous `core/dialogues/`, base locale, ou service dédié), densité du monologue cinematic (complet vs condensé), stratégie i18n FR/EN, règles de variation, et moteur TTS MVP (§3.4).

### 13.11 Cycle de vie d'un nouveau matériel — objectif final

```
1. Détection            (Discovery Manager, §8)
2. Jumelage PIN/QR      (§13.4)
3. Installation agent   (Bootstrap, §13.4)
4. Déclaration capacités (entity registry, §13.2)
5. Contrôle par Hermes  (routage, §13.5)
6. Interface dans le HUD (§13.8)
```

> **Point ouvert** : sécurité du canal agent — stockage du token côté appareil, rotation, révocation d'un agent compromis, chiffrement du WebSocket (TLS interne ? certificats par entité ?). À rattacher au coffre à secrets (§6.1) et à la surface d'attaque (§7.4).

### 13.12 Mémoire conversationnelle & personnalisation vocale

La console de commande du HUD (§13.8) **transcrit toutes les interactions** (vocales et texte). Ces transcriptions alimentent une **mémoire persistante** portée par le Memory Manager (§2, §6.11) et stockée en **base de données** côté Hermes — c'est ce qui permet à l'IA de connaître la voix de l'utilisateur, d'interpréter au mieux ses commandes, ses habitudes et ses raccourcis.

Contenu de cette base (distincte du coffre à secrets, §6.11) :

| Table | Contenu |
|---|---|
| `transcriptions` | historique horodaté des échanges voix/texte, par utilisateur |
| `skills` | compétences/outils disponibles et leurs déclencheurs |
| `commandes` | commandes apprises, raccourcis, macros (ex. « Déployer » = suite de commandes) |
| `pré-commandes` | messages automatiques à l'invocation (accueil, état système) |
| `wake_words` | mots/sons d'activation par utilisateur |
| `expressions` | tournures personnelles de l'utilisateur, apprises et entraînées avec l'IA |

**Invocation personnalisable** — au-delà du mot-clé standard (« Jarvis »), l'activation doit accepter :
- des **wake words personnalisés** : « Jarvis réveille-toi », « au boulot », « on se bouge », « remue tes fesses »…
- un **claquement de mains** (détection sonore, façon Iron Man) ;
- les **expressions personnelles** sont entraînées progressivement avec l'IA (rattaché aux états d'écoute du §6.9 — le wake word ne déclenche que l'état 2, jamais une action directe).

> **Tranché** : **PostgreSQL** sur le NUC (Core) — users, permissions, Dashboard / configuration / usage / sessions. Couche accès : **SQLAlchemy 2 + Alembic** (migrations versionnées). **Pas de Prisma** (Core Python ; HUD/Dash → Core seulement). SQLite = fallback local si `JARVIS_DATABASE_URL` absent. Schéma mémoire projet / vectorielle : **§15**. Rétention / chiffrement transcriptions : vie privée §6.9, §6.11, §14.6.

### 13.13 Icônes & raccourcis générés automatiquement

Chaque fois qu'un élément utile est ajouté à l'écosystème — un **tool**, un **agent**, une **installation logicielle**, un **périphérique** — JARVIS crée l'icône correspondante dans le lanceur d'apps (§13.8) en puisant dans la **bibliothèque de composants React** du HUD, et automatise l'accès :

```
Ajout détecté (tool / agent / périphérique)
        ↓
Déclaration des capacités (entity registry, §13.2)
        ↓
Demande d'accès interface / périphérique
        ↓
Validation utilisateur (Policy Engine, §6.10)
        ↓
Icône créée dans le lanceur + habillage HUD associé
```

Exemple : téléchargement du pilote d'une **imprimante HP** → l'application associée est installée, l'icône « Imprimante » apparaît dans le lanceur, et le HUD sait ouvrir son habillage. Même logique pour un nouveau service (Plex, caméra) ou un tool ajouté à un agent. La création d'icône ne donne **aucun droit** par elle-même : l'accès réel passe par le jumelage et les permissions de l'entité (§10, §13.4, §13.5).

## 14. JARVIS hors domicile — topologie nomade

Tout ce qui précède décrit JARVIS **dans** la maison. Le §6.5.2 liste bien les hôtes (VPS, NUC, Windows, TV/HA) mais **suppose qu'ils sont tous joignables** — ce qui est faux dès que l'utilisateur sort : le NUC est derrière la box, donc ni Whisper, ni Piper, ni domotique, ni Holomat, ni reconnaissance faciale.

Ce n'est **pas** une seconde édition du produit. C'est un **état du Capability Manager** (§6.7) — `nuc.reachable = false` — au même titre qu'un Ollama qui tombe. Le HUD, le Core et Hermes ne changent pas ; seule la liste des fonctions activables change.

### 14.1 Les deux contextes — même système, capacités différentes

| Fonction | À la maison | Hors domicile |
|---|---|---|
| Réveil | Wake word ambiant | **Push-to-talk** — micro via permission navigateur (§6.9) |
| STT | Whisper sur le NUC | faster-whisper sur le **VPS** (§14.4) |
| TTS | Piper / voicebox + cache ElevenLabs | **ElevenLabs** live (§3.4) |
| LLM | **Ollama VPS → OpenRouter → système** (§11) | Idem (via VPS / API) |
| Domotique / écosystème | Direct, NUC ↔ HA / Plex | **Via le tunnel**, en relais (§14.3) |
| Holomat, vision, gestes | ✓ (§6.8) | Caméra navigateur si auth face web ; gestes complets ✗ |
| Reconnaissance faciale | ✓ (§10.1) caméra NUC / web | Caméra navigateur si permission ; sinon appareil jumelé |
| Client | Kiosque / navigateur LAN | **Navigateur web seul** (pas d’agent Windows/Android) |
| Mémoire | Source de vérité Postgres (§14.6) | Journal de session, resynchronisé |

Le périmètre réduit dehors est **voulu**, pas subi : les usages nomades sont des requêtes courtes, du briefing et des commandes maison — pas de l'assistance ambiante.

### 14.2 Topologie

```
        HORS DOMICILE                              MAISON
   mobile / portable (PTT)                  micro + wake word + caméra
            │                                        │
            │ audio                     Whisper ─ Piper ─ Voice Filter
            ▼                                        │
    ┌────────────────┐   WireGuard (initié NUC)  ┌─────────────────┐
    │ VPS            │◄──── commandes + état ───►│ NUC             │
    │ whisper (PTT)  │                           │ domotique / HA  │
    │ Hermes/Ollama  │      jamais d'audio       │ famille / Auth  │
    │ ElevenLabs TTS │                           │ écosystème      │
    │ ingress TLS    │                           │ mémoire (SoT)   │
    └────────────────┘                           └─────────────────┘
```

Le VPS est un **relais et un cerveau de secours**, jamais un second JARVIS : il n'héberge ni état de la maison, ni profils famille, ni entités.

### 14.3 Le tunnel — sortant, initié par le NUC

Dehors, l'usage principal reste **d'agir sur la maison** (« ferme le garage », « la machine est finie ? »). Ces commandes doivent atteindre le NUC : un lien VPS↔NUC est donc requis **indépendamment** de la question voix.

Montage imposé : **tunnel sortant initié par le NUC vers le VPS** (WireGuard). Conséquences directes, cohérentes avec §7.1 et §10 :

- **aucun port ouvert sur la box** — la maison n'est jamais exposée à Internet
- le VPS reste le **seul point exposé**, et reste soumis à la règle du §6.5.2 (jamais d'app grand public dessus, jamais de root libre)
- si le tunnel tombe, le NUC continue de fonctionner seul — la maison ne dépend pas du VPS

> **Règle — le tunnel transporte les commandes et l'état, jamais l'audio.**
> Faire transiter chaque phrase par le tunnel ajouterait trois points de panne en série (4G + Internet de la maison + tunnel) pour un aller-retour audio. Avec l'audio hors tunnel, la couche conversationnelle survit à une coupure de la maison : JARVIS parle toujours, il répond simplement que la maison est injoignable.

### 14.4 Les oreilles hors domicile

Point souvent manqué : ElevenLabs est un **TTS** — la bouche. Whisper est sur le NUC lui aussi, donc dehors JARVIS n'est pas muet, il est **sourd**. Il faut un STT joignable depuis l'extérieur.

| Voie | Verdict |
|---|---|
| ElevenLabs Scribe (STT cloud) | Un seul fournisseur, une seule clé — mais tout l'audio part chez un tiers |
| `SpeechSynthesis` / Web Speech API du navigateur mobile | Zéro infra, gratuit ; qualité FR variable selon navigateur/OS — **retenu comme secours** |
| **faster-whisper sur le VPS** | **Retenu.** |

Justification : hors domicile, le mode est **push-to-talk par construction** (pas de wake word dans l'espace public, §6.9), donc pas de flux continu — un petit modèle CPU sur un VPS modeste suffit. La transcription reste sur une machine du foyer.

### 14.5 Identité vocale — un seul JARVIS

Risque produit direct : Piper à la maison + ElevenLabs dehors = deux timbres, donc deux JARVIS, ce qui contredit l'identité vocale unique du §3.4.

Réponse retenue : **les deux moteurs sortent par la même chaîne Voice Filter** (EQ → compression → réverb → spatialisation). La signature sonore devient commune même si le timbre de base diffère. C'est la raison pour laquelle le Voice Filter est positionné en bout de chaîne côté Voice Manager et non collé au moteur TTS (§3.4).

### 14.6 Mémoire — une seule source de vérité

Si l'utilisateur parle au VPS dehors et au NUC à la maison, « qu'est-ce que je t'ai dit ce matin ? » ne fonctionne que d'un côté. Deux mémoires = deux JARVIS amnésiques l'un de l'autre.

- **NUC = source de vérité** de la mémoire utilisateur (Memory Manager §2, séparation et chiffrement §6.11)
- **VPS = journal de session** chiffré, borné dans le temps, **resynchronisé** vers le NUC dès que le tunnel remonte
- en cas de conflit, le NUC arbitre — le VPS n'écrit jamais de vérité durable

### 14.7 Rattachement au Capability Manager

L'ensemble se pilote par la détection déjà décrite au §6.7, sans mode ni build spécifique :

```
NUC joignable ?

    Oui                          Non
     │                            │
     ▼                            ▼
✓ Wake word              ✗ Wake word (PTT seul)
✓ Whisper local          ✓ Whisper VPS
✓ TTS local              ✓ TTS cloud
✓ Holomat / vision       ✗ Holomat / vision
✓ Auth faciale           ✓ Auth par appareil jumelé
✓ Domotique directe      ✓ Domotique via tunnel
```

> **Points ouverts** : profil d'installation dédié au rôle relais du VPS (à croiser §5 « profils d'installation » et §6.5.2) ; politique de rétention du journal de session côté VPS (durée, purge, chiffrement au repos — à croiser §6.11) ; comportement attendu quand le tunnel est **partiellement** dégradé (NUC joignable mais latence élevée) — bascule franche ou dégradation progressive.

## 15. Mission Control DEV / HOME, Memory Engine & orchestration projet

Spécification fonctionnelle fusionnée (vision JARVIS / Hermes / cockpits). Elle **complète** §2, §11, §13.12 et le guide d’installation — elle ne remplace pas les décisions topologie déjà tranchées (Core NUC, Ollama VPS → OpenRouter, clients web, ProLiant = Plex Windows).

### 15.1 Les deux Mission Control

Il existe **deux** Mission Control. Ils ne partagent que le **Core** (auth, biométrie, voix, mémoire, agents, permissions). Leurs responsabilités sont disjointes.

```
                 JARVIS CORE
                      │
       ┌──────────────┴──────────────┐
       ▼                             ▼
MISSION CONTROL DEV          MISSION CONTROL HOME
(cockpit du créateur)        (cockpit du foyer)

Créer                        Habiter
Coder · déployer             Contrôler · surveiller
Cursor · agents IA · Git     Domotique · sécurité · caméras
Mémoire projets              Vie quotidienne
Session privée               Session familiale multi-profils
```

**Règle d’architecture — non négociable.** Aucun code, écran ou logique métier de l’un ne dépend de l’autre. Aucun module ne porte le nom générique « Mission Control », ni le mot « Mission » seul : tout module précise son domaine (`mission_dev`, `missionDev/`, `mission_dev_*` côté événements WS et dialogues). Le mot nu ne dit pas de quel cockpit on parle — c’est précisément la confusion à empêcher.

#### 15.1.1 Mission Control DEV

Cockpit d’orchestration du **développement logiciel**, réservé au propriétaire. Scène du HUD, qui n’apparaît **que si nécessaire**.

| Type d’action | UI |
|---------------|-----|
| Simple (lumière, auth, macro connue) | **Voix seule** — pas de cockpit |
| Complexe (créer un projet, déployer, multi-étapes) | **Mission Control DEV** + commentaire vocal JARVIS |

Exemple « Jarvis crée un projet » : dialogue (nom) → validation → progression (mémoire DB, agent, Cursor…) → Hermes orchestre. Une fois Cursor ouvert, l’utilisateur continue à la voix (« refactorise ce composant ») : JARVIS choisit les agents, transmet, et le cockpit affiche agent actif, tâche, fichiers modifiés, progression, erreurs. Chaque action alimente la mémoire projet (§15.4).

Cursor est l’atelier ; Mission Control DEV est le chef d’orchestre. Le Dashboard admin (§13.7) reste le cockpit **technique** ; Mission Control DEV est l’**expérience opérationnelle** dans le HUD.

#### 15.1.2 Mission Control HOME

Cockpit **du foyer**, affiché en permanence sur la tablette murale ou un écran dédié, orbe JARVIS visible en continu (§3.2). Il expose l’état de la maison et permet de la piloter : domotique, sécurité, alarmes, caméras, ouvertures, éclairage, chauffage, consommation, réseau, serveurs locaux, appareils connectés, scénarios.

Pilotage par la voix, le tactile et les tuiles. Il ne contient **jamais** d’outil de développement.

> **Statut : non implémenté.** Le code existant sous `mission_dev` / `missionDev/` est le cockpit DEV exclusivement. La surface maison actuelle est dispersée dans le Dashboard admin (entités HA, monitoring) — elle devra être reprise ici, pas étendue là-bas.

#### 15.1.3 Sessions — deux natures distinctes

C’est la différence la plus lourde de conséquences, et elle est de sécurité :

| | Mission Control DEV | Mission Control HOME |
|---|---|---|
| Portée | **Privée** — le créateur de JARVIS | **Familiale** — tout habitant autorisé |
| Auth | Session propriétaire | Visage / voix / profil, **par personne** |
| Droits | Ceux du propriétaire | **Gradués par profil** (§10.1) |

La session HOME n’est **pas** un bypass. Une tablette allumée en permanence ne donne aucun droit implicite : chaque habitant est identifié et ses permissions restent portées par son profil — enfant (musique, vidéos, lumière chambre) < famille (chauffage, volets, appareils) < administrateur (sécurité, utilisateurs, configuration). Un écran toujours disponible n’est pas un écran toujours autorisé.

> **Point ouvert** : ergonomie de l’identification passive sur la tablette murale (reconnaissance à l’approche vs. action explicite), et durée de session avant re-identification — à croiser §10.1 et §14.

### 15.2 Hermes — rôle d’orchestrateur

Hermes **ne « sait » pas tout** : il reçoit, clarifie, choisit l’agent, exécute, récupère, met à jour la mémoire.

```
Demande → analyse → infos manquantes ?
       → Memory Engine → Agent(s) → suivi → informer l’utilisateur
```

Exemples d’agents cibles : maison (HA, MQTT, caméras), média, mail/office, déploiement — et **plus tard** agent poste de dev (voir §15.5).

### 15.3 IA hybride (aligné §11)

| Couche | Backend | Usage |
|--------|---------|--------|
| Sans token | Règles / skills / Policy | Domotique connue, auth, macros |
| Raisonnement courant | **Ollama VPS** | Analyse, résumé, chat foyer |
| Complexe | **OpenRouter** | Raisonnement lourd, agents |
| Dev IDE | **Cursor** (ses propres modèles) | Code — JARVIS n’y substitue pas |

JARVIS / Hermes **préparent le contexte** et orchestrent ; Cursor reste l’ingénieur quand un poste de dev est jumelé.

### 15.4 Memory Engine

But : mémoire persistante type Iron Man (reprendre un projet = connaître versions, décisions, erreurs, raisons).

| Couche | Stockage | Contenu |
|--------|----------|---------|
| **Courte** | Session / tables dialogue §13.12 | Conversations, commandes, erreurs, actions en cours |
| **Projet** | **PostgreSQL** (Alembic) | Voir tables ci-dessous |
| **Documentaire** | **Vector DB** (à choisir) | README, docs, PDF, notes, logs utiles, extraits conversations |

Tables projet (cibles SQL — en plus des tables §13.12 et `users` / `usage_events` / `sessions`) :

| Table | Contenu |
|-------|---------|
| `projects` | Nom, description, dates, état |
| `project_sessions` | Conversations / actions / résumés liés au projet |
| `decisions` | Choix structurants + justification (ex. React vs QML) + **`source`** : qui a eu l'idée — `samir` / `cursor` / `jarvis` (§15.5) |
| `tasks` | Fait / reste / bugs |
| `changelog` | Fichiers touchés, agents, résultats |

Les 6 tables vocales §13.12 (`transcriptions`, `skills`, `commandes`, `pré-commandes`, `wake_words`, `expressions`) restent la mémoire **dialogue**. Les tables projet ci-dessus sont la mémoire **chantier / produit**.

> **Point ouvert** : moteur vectoriel (Chroma / Qdrant / pgvector) ; politique d’ingestion des logs Cursor (jamais de secrets).

### 15.5 Flux « nouveau projet » & agent poste de travail

Cible produit :

1. « Jarvis crée un nouveau projet » → Mission Control DEV (nom, valider)
2. Core NUC : lignes DB projet + mémoire + journal
3. Hermes délègue à un **agent machine de dev** (ouvrir dossier, Cursor, git…)

> **Tranché aujourd’hui** : clients = **navigateur web** ; **pas** d’agent Windows / Android natif en premier déploiement (`docs/INSTALLATION_DEPLOIEMENT.md`).  
> **Cible** : Agent Laptop (« JARVIS DEV NODE » : Cursor, Git, Docker) jumelé au Core — **après** Phase A NUC. Jusque-là, Mission Control DEV + mémoire projet peuvent vivre **sans** ouvrir Cursor automatiquement.

Déploiement (« Jarvis déploie… ») : Agent Dev → git → tests → Docker → cible (ex. VPS) avec **validation obligatoire** (Policy / confirmation).

#### Deux voies vers Cursor — l’une n’attend pas l’agent Laptop

Cursor expose depuis avril 2026 un **SDK** et une **API REST Cloud Agents**
orientée *runs*. Cela ouvre une voie qui ne dépend d’aucun agent installé :

| | **Cursor desktop** (agent Laptop) | **Cursor Cloud Agents** (API) |
|---|---|---|
| Prérequis | agent Windows + portable allumé | une clé API |
| Le code | reste sur le portable | part chez Cursor |
| Pilotable par JARVIS | via le CLI headless seulement | **pleinement** |
| Depuis la chambre / l’extérieur | ✗ | ✅ |
| Phase | après Phase A (§15.5 ci-dessus) | **possible avant** |
| Coût | abonnement existant | plan payant — **la clé du plan gratuit n’ouvre pas la Background Agent API** |

« Jarvis ouvre mon projet HUD » suppose le poste de dev allumé et l’agent
Laptop. Mais « Jarvis, lance l’agent sur telle branche » fonctionne **sans
aucun agent local**, par l’API cloud. C’est la voie à privilégier pour un
premier essai de Mission Control DEV sur un vrai chantier.

#### Surface de l’API Cloud Agents

| Capacité | Usage JARVIS |
|---|---|
| Créer un agent (prompt + dépôt) | « crée un projet », « corrige ce bug » |
| **Follow-up** sur un agent existant | relance dans le même contexte |
| **Streaming SSE** — statut, texte, **appels d’outils**, fin | **progression Mission Control DEV** |
| Reprise par `Last-Event-ID` | survivre à une coupure sans perdre le run |
| Annuler un run | le STOP de l’orbe |
| Artefacts (URLs présignées) | récupérer les livrables |
| **Usage tokens** (in / out / cache) par run | alimente `usage_events` |
| Serveurs MCP déclarables | outils maison exposés à l’agent |

Authentification Basic ou Bearer (clé utilisateur ou compte de service).

> **La structure est identique à celle de Hermes** — sessions, runs, SSE,
> `tool.started`, annulation. **Un seul client à écrire, deux moteurs
> pilotés** : Mission Control DEV affichera la progression de Cursor exactement
> comme celle de Hermes. Cf. le client `HermesAPI` de `vendor/refs/jarvis_ai`.

#### Capture des décisions — écouter git, pas Cursor

Pour remplir `decisions` (§15.4), le déclencheur est le **commit**, pas le
journal de l’éditeur : les logs internes de Cursor ne sont pas documentés et
changent de version en version, alors qu’un commit est structuré, horodaté,
porte le diff, et survivra à un changement d’IDE.

```
commit détecté → fichiers touchés + diff
      ↓
JARVIS : « Tu as remplacé le client HTTP par du WebSocket. Pourquoi ? »
      ↓
réponse → table decisions
```

**Ne pas demander à chaque commit** — vingt questions par jour et la fonction
est coupée en trois jours. Filtrer sur ce qui est structurant :

- dépendance ajoutée ou retirée
- fichier de configuration ou d’architecture touché
- suppression / renommage à grande échelle
- **commit qui en annule un précédent** — c’est un changement d’avis, le plus
  précieux à capturer

Et **regrouper** : la question se pose en fin de session, sur deux ou trois
changements notables, jamais à chaud après chaque `git commit`.

#### Provenance — colonne `source` sur `decisions`

JARVIS peut reformuler une suggestion venue de Cursor : c’est bon pour
l’expérience. Mais la table doit garder **qui a réellement eu l’idée**.

| `source` | Signification |
|---|---|
| `samir` | décision tranchée par l’utilisateur |
| `cursor` | proposée par l’IDE, validée par l’utilisateur |
| `jarvis` | issue du contexte / de la mémoire projet |

La voix n’a pas à l’annoncer à chaque fois. Mais à la question « pourquoi on
avait choisi ça ? », JARVIS doit pouvoir répondre « c’est Cursor qui l’avait
proposé, tu as validé le 3 mars ». **Sans provenance, la mémoire projet
invente ses auteurs** — et un assistant qui sait qui a eu l’idée est plus
crédible qu’un assistant qui s’attribue tout.

> **Ne pas utiliser le mode vocal de Cursor** (Settings → Labs → Voice) : il
> se contente de déposer du texte dans le prompt de l’Agent, et ferait deux
> assistants vocaux qui s’ignorent — même piège que HA Assist (§13.6). La
> voix appartient à JARVIS ; Cursor reçoit du texte.

> **Point ouvert** : arbitrage desktop / cloud selon la sensibilité du dépôt —
> l’API cloud envoie le code chez Cursor. À croiser avec §10 avant d’y pousser
> un dépôt privé du foyer.

### 15.6 Frontière projet / système — ce qui se fait sans demander

Règle transverse : elle gouverne **tous les agents**, pas seulement Mission
Control. Sans elle écrite ici, chaque agent réinventera sa propre limite — et
l'un d'eux finira par installer quelque chose hors du projet.

> **Le dossier du projet est un bac à sable. Dedans, JARVIS agit seul.
> Dehors, il demande.**

Le critère n'est pas « exécuter du code ou non » — ce serait ingérable :
valider chaque `npm install` rend l'assistant inutile, autant le faire
soi-même. Le critère est le **périmètre de conséquence**.

| Sans autorisation — dans le projet | Autorisation obligatoire — hors projet |
|---|---|
| `npm` / `pip` / `composer install` | `sudo apt`, `choco`, `brew` — élévation |
| Créer, modifier, supprimer des fichiers **du projet** | Toucher un fichier **hors** du projet |
| `git init`, commits locaux | `git push` vers un dépôt distant |
| Lancer un serveur de dev, compiler, tester | Déployer en production |
| Télécharger depuis les registres officiels | Ouvrir un port, modifier le pare-feu |
| Chercher un miroir, lire une documentation | Toute action domotique depuis un contexte projet |

Tout ce qui est dans la colonne de gauche est **réversible** : on supprime le
dossier, il ne reste rien. C'est ce que fait déjà un IDE agentique, et c'est
ce qui rend l'assistance utilisable.

La colonne de droite recoupe la graduation du §6.13 : le projet est du niveau
*info*, le système du niveau *admin*.

#### Ne pas demander ≠ ne pas dire

JARVIS installe sans interrompre, mais il **rend compte** :

> « Dépendances installées. » · « J'ai ajouté trois paquets. »

Un assistant qui agit **silencieusement** hors de vue est inquiétant ; un
assistant qui agit et le dit est utile. Un majordome ne demande pas la
permission de mettre la table — mais il ne le fait pas en cachette.

#### Autorisation vocale

Pour la colonne de droite, la demande passe par la voix et suspend l'action
(§10, Policy Engine) :

> « Cette installation touche au système. Autorisez-vous ? »

Côté moteur, rien à inventer : le flux SSE de Hermes émet un événement
`approval` qui **suspend le run** jusqu'à réponse (§15.5). Mission Control DEV
affiche la carte, l'utilisateur autorise, le run reprend.

### 15.7 Contexte utilisateur & machines

JARVIS doit raisonner avec : **qui** (profil §10.1), **où** (pièce / extérieur §14), **quel appareil** (kiosque, portable web, tablette), **quel usage** (dev, maison, média, admin).

Profils machines (cible) : portable = **DEV**, seul poste à ouvrir Mission Control DEV (§15.1.1) · salon = perso / média · tablette murale = maison toujours allumée, qui affiche **Mission Control HOME** (§15.1.2), tactile + voix, en session familiale (§15.1.3). L’appareil détermine le cockpit : la tablette murale n’ouvre jamais le cockpit de développement, le portable n’est pas un tableau de bord domestique. Toujours le même schéma : Utilisateur → JARVIS → Hermes → agent → résultat → mémoire.

### 15.8 Vision finale (rappel)

JARVIS n’est pas « une IA qui répond » : une intelligence qui connaît projets, outils, appareils, habitudes et décisions, et **orchestre** l’environnement — sous l’autorité du Core et du Policy Engine (§10).

## 16. Suite

> Brouillon `cahierdechargereact.txt` (agents distribués) : **fusionné** dans §13 puis fichier racine **supprimé**. HUD Qt/QML : **retiré** du monorepo — fronts cibles = React (`vendor/figma1` / `figma2`, WIP). Auth unifiée + User Manager : **§10.1**. Dialogue Manager + protocole Auth immersif : **§13.10** (`core/dialogues/`). Identité vocale Voice System : **§3.4**. Vision Mission Control / Memory Engine / agents : **§15** (2026-07-31). Scission en **Mission Control DEV** et **Mission Control HOME**, règle de nommage et nature des sessions : **§15.1** (2026-08-01).

Sections à compléter au fil des prochains apports :
- Phasage / roadmap (MVP1 → MVPn) — prioriser : Auth/User Manager, Core↔HUD React WS, Voice Manager (`jarvis-voice`), Memory Engine §15 (tables projet), puis Holomat, puis agents natifs
- Matrice permission ↔ commande vocale / tool
- Contrat d'événements WS figé (états orbe §3.2, auth §10.1, `dialogue_line`, Mission Control DEV progress)
- Visage holographique Auth : particules / wireframe *dans* l'orbe (pas un avatar cartoon) — ref. visuelle à trancher
- Lecteur Dialogue Manager (YAML → Voice Manager → TTS + WS) + densité cinematic
- Réplication du timbre entre Piper local et ElevenLabs — voix originale uniquement (arbitrage moteur : **tranché** §3.4 ; identité unifiée par le Voice Filter : §14.5)
- Profil d'installation « relais » du VPS + rétention du journal de session (§14.7)
- Clonage `itachity/Holomat` sous `vendor/vision/` si retenu comme source Holomat Engine (§6.8)
- Agent Laptop / DEV NODE (§15.5) — jumelage Windows après Phase A
- Choix Vector DB (§15.4)