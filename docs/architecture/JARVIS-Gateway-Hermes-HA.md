# JARVIS — Couche gateway, Hermes skills, HA central (NUC)

> **Statut :** spec de migration **proposée** (2026-08-16).  
> **Objectif :** remplacer l’empilement confus Core ↔ Hermes ↔ chemins domotique parallèles par une architecture lisible et opérationnelle.  
> **Code :** le répertoire `core/` **reste** — il devient la **couche JARVIS** (gateway produit). Pas de suppression du dossier, **élagage** du rôle.  
> **Voisins :** [`JARVIS-Satellites.md`](JARVIS-Satellites.md), [`JARVIS-Agentic-UI.md`](JARVIS-Agentic-UI.md), [`../COMPOSANTS.md`](../COMPOSANTS.md), [`../INSTALLATION_DEPLOIEMENT.md`](../INSTALLATION_DEPLOIEMENT.md), [`../DECISIONS.md`](../DECISIONS.md).

---

## 1. Problème actuel

| Symptôme | Cause |
|----------|--------|
| Netflix / Apple TV ne répondent pas comme attendu | Chemins parallèles : `media.streaming` (Freebox ADB), `home.control` (HA), Hermes toolset HA — **pas le même appareil** |
| « L’architecture est bonne mais rien ne marche » | Schéma correct, **câblage produit incomplet** + matériel HA non appairé |
| Double cerveau LLM | Core (Provider Manager) + Hermes (runs / skills) |
| Skills Hermes vs Capabilities Core | Deux registres, doc skills parfois obsolète (`hud-apps` cite encore un Core monolithique) |
| HA sur Pi vs cible NUC | Doc prod = HA NUC ; runtime historique = HA Pi `:8123` |

**But de cette spec :** un seul bus domotique (**Home Assistant sur NUC**), une seule gateway produit (**couche JARVIS** dans `core/`), un seul cerveau agent (**Hermes + skills**), des satellites **exécuteurs** (Pi, Windows).

---

## 2. Architecture cible

```
┌─────────────────────────────────────────────────────────────────┐
│  HUD / Dashboard (React) — présentation, jamais LLM direct      │
└───────────────────────────────┬─────────────────────────────────┘
                                │ WebSocket :8765 (contrat existant)
┌───────────────────────────────▼─────────────────────────────────┐
│  COUCHE JARVIS  (`core/` — gateway élaguée)                     │
│  · Auth (voix, sessions, rôles) — DECISIONS figées              │
│  · Policy Engine (IA propose → autorisation → exécution)        │
│  · Voix (STT/TTS, voicebox, cache)                              │
│  · Surfaces / approval Agentic UI                               │
│  · Memory API (PostgreSQL)                                      │
│  · Device registry + router (Pi, Windows, HUD satellite)        │
│  · Adaptateur HA mince (HTTP API — inventaire + services)       │
│  · Pont Hermes (HTTP :8642 — runs + SSE, pas de second agent)  │
└───────┬─────────────────────────────┬───────────────────────────┘
        │                             │
        │ http://127.0.0.1:8123       │ http://127.0.0.1:8642
        ▼                             ▼
┌───────────────────┐         ┌───────────────────┐
│ Home Assistant    │         │ Hermes              │
│ (NUC — cerveau    │         │ skills + toolsets   │
│  domotique UNIQUE)│         │ web, skills, vision │
│ Chambre + Salon   │         │ (PAS domotique prod)│
└─────────┬─────────┘         └───────────────────┘
          │ LAN
    ┌─────┴─────┬──────────────┐
    ▼           ▼              ▼
 Apple TV    Bravia       Freebox Player
 Lave-linge  Samsung      Zigbee (via Pi)
```

### Satellites (pas de cerveau)

| Satellite | Connexion | Rôle |
|-----------|-----------|------|
| **Pi salon** | WS / HTTP → couche JARVIS | Zigbee radio (`ser2net` / Z2M → HA NUC), cam, ear, **relai** ADB/CEC si HA seul ne suffit pas |
| **Agent Windows** | WS → couche JARVIS | `app.launch`, `dev.agent.run` — **ne transporte pas** les skills Hermes |
| **VPS** | Tunnel sortant | TLS, WSS relais, Ollama (LLM #1 si activé), voicebox relais |

---

## 3. Rôles — une phrase par brique

| Brique | Rôle |
|--------|------|
| **HUD / Dashboard** | UI, micro, caméra, orbe — **aucune** décision sécurité |
| **Couche JARVIS** (`core/`) | Seul interlocuteur des fronts ; Policy ; auth ; voix ; surfaces ; appels HA et Hermes |
| **Home Assistant (NUC)** | Inventaire et action **physique** maison (chambre + salon + électro) |
| **Hermes** | Raisonnement, skills, recherche web, tâches multi-étapes, vision agentique |
| **Skills Hermes** | Mode d’emploi LLM — **pas** des exécuteurs |
| **Pi** | I/O local salon + radio Zigbee — **pas** second HA |
| **Agent Windows** | Mains sur le PC portable |

### Invariant sécurité (non négociable)

```
IA / skill / Hermes → Proposition
        → Policy (couche JARVIS)
        → Autorisation (carte HUD si requis)
        → Exécution (HA API · device.execute · Hermes run)
```

Jamais Hermes → root. Jamais HUD → Hermes direct. Jamais LLM → allumer une lampe sans Policy.

---

## 4. Règle Policy vs automatisations HA

### Deux décideurs, un monde physique — comment éviter la confusion

| Origine | Qui décide | Où vit la règle | Exemples |
|---------|------------|-----------------|----------|
| **Commande vocale / chat / tuile HUD** | **Couche JARVIS (Policy)** puis HA | Policy + intent `home.control` | « Jarvis, allume le salon », « Netflix Apple TV », « éteins la Bravia » |
| **Scénario maison autonome** | **Home Assistant** | Automatisations / scripts HA | Mouvement → lumière ; minuit → veille ; absence → alarme |
| **Appairage / discovery** | HA découvre ; **JARVIS accorde** | Pairing produit + rôles | Nouvelle entité HA ≠ droit vocal automatique |

### Règles figées

1. **Commandes vocales JARVIS = Policy** — toute phrase utilisateur passe par auth + Policy avant `POST /api/services/...`.
2. **Scénarios = automatisations HA** — JARVIS ne les remplace pas ; HA reste autonome si JARVIS est down.
3. **Pas de double commande silencieuse** — si une automation HA et une commande JARVIS ciblent la même entité, documenter la priorité (voir §4.4).
4. **Toolset HA Hermes** — **désactivé ou lecture seule en prod** ; la domotique vocale ne passe **pas** par le LLM.
5. **HA ne parle jamais** — pas de TTS depuis HA vers l’utilisateur ; restitution = couche JARVIS uniquement.

### 4.1 Flux commande vocale (canonique)

```
Utilisateur (voix / HUD)
  → Couche JARVIS : auth, match intent, Policy
  → [carte confirmation si HOME/MEDIA/admin]
  → Adaptateur HA : resolve entité + service
  → HA NUC :8123
  → Appareil LAN
  → Couche JARVIS : surface + TTS
```

### 4.2 Flux scénario HA (hors JARVIS)

```
Trigger HA (capteur, horaire, état)
  → Automation HA
  → Action locale
  (aucun passage Policy JARVIS — normal)
```

### 4.3 Quand Hermes intervient (pas la domotique directe)

```
« Explique pourquoi la lumière s'est allumée »
  → Hermes (skill jarvis-os + éventuellement lecture états HA en read-only)
  → Synthèse → JARVIS → HUD

« Cherche des infos sur X »
  → Hermes (deep-research + agent-reach)
  → JARVIS filtre untrusted → HUD
```

### 4.4 Conflits Policy vs automation

| Situation | Comportement attendu |
|-----------|---------------------|
| User « éteins la lumière » pendant qu’une automation vient de l’allumer | Dernière commande **autorisée** gagne ; JARVIS exécute ; log intent |
| Automation nocturne + commande vocale concurrente | Policy tranche ; pas d’annulation silencieuse côté HUD |
| Debug « pourquoi c’est allumé » | Hermes **lit** historique HA / logbook — **n’écrit** pas sans Policy |

---

## 5. Transformation du `core/` (couche JARVIS)

### 5.1 Ce qui reste (intouchable)

| Module | Raison |
|--------|--------|
| `policy.py` | Gate sécurité |
| `ws/` (auth, voice, surface, chat gateway) | Contrat HUD/Dashboard |
| Auth / enroll / voix (`voice/`, handlers auth) | DECISIONS figées |
| `surfaces/`, Agentic admission | UX supervision |
| `memory/` + PostgreSQL | Mémoire foyer M4 |
| `devices/` registry + router | Pi, Windows, HUD |
| `hermes/bridge.py` (mince) | Pont runs Hermes |

### 5.2 Ce qui est simplifié / déprécié

| Avant | Après |
|-------|--------|
| `homeassistant.py` résolution maison complexe + Hermes HA | Proxy HA unique ; inventaire = entités HA NUC |
| `salon_player.py` / ADB parallèle pour Netflix | `media_player.*` HA (Freebox `androidtv_remote`) ; ADB Pi = **repli** documenté seulement |
| `media.streaming` → Freebox forcée | Intent maison/média → entité HA (Apple TV chambre, Freebox salon) |
| Double LLM chat (Provider + Hermes) | Chat / recherche → **Hermes + skills** par défaut |
| Capabilities `Owner.HERMES` pour domotique | Domotique = `Owner.CORE` + HA uniquement |
| Toolset HA Hermes actif | Off ou read-only prod |

### 5.3 Registre unique côté produit

| Type | Emplacement | Rôle |
|------|-------------|------|
| **Capability** | `core/jarvis_core/capabilities.py` | Contrat exécutable + Policy + triggers voix |
| **Skill Hermes** | `deploy/hermes/skills/` | Consigne raisonnement LLM |
| **Entité actionnable** | Home Assistant | État réel du monde physique |

**Règle :** une commande physique = **une entité HA** ; une commande cognitive = **skill Hermes** via pont JARVIS.

---

## 6. Inventaire skills Hermes (catalogue produit)

| Skill | Rôle | Exécution réelle | Couche JARVIS requise |
|-------|------|------------------|------------------------|
| `jarvis-os` | Loi produit, Policy, voix, rôles | Consignes LLM | Policy appliquée **avant** tout acte |
| `jarvis-memory` | Mémoire foyer | `jarvis_memory_*` → Memory API | `memory/service.py` |
| `family-enroll` | Enrollment foyer | WS auth / enroll | Auth handlers |
| `user-locale` | Langue, profil TTS | `hud_preferences` | Preferences |
| `hud-apps` | Catalogue apps / intents | Intents → JARVIS | Capabilities (à aligner doc) |
| `ecosystem-hosts` | Quelle machine | Routage host | Device router |
| `agent-reach` | Fetch Internet | CLI agent-reach | Filtre untrusted |
| `deep-research` | Méthodo multi-angles | agent-reach + synthèse | — |

**Progressive load :** triggers dans le frontmatter YAML (`TRIGGER —`). Détail : `deploy/hermes/skills/README.md`.

**Action doc :** mettre à jour `hud-apps` et `ecosystem-hosts` pour refléter « domotique = HA NUC via JARVIS », plus « Core monolithique ».

---

## 7. Home Assistant — spécification NUC

### 7.1 Placement

| Élément | Machine | Port |
|---------|---------|------|
| **Home Assistant (cerveau)** | NUC | `8123` |
| Zigbee coordinator | Pi salon (dongle) | exposé à HA NUC via `ser2net` ou Zigbee2MQTT |
| Token long-lived | `/etc/jarvis/core.env` | `JARVIS_HASS_URL=http://127.0.0.1:8123` |

### 7.2 Pièces et entités cibles

| Zone | Appareils | Intégration HA typique | Notes |
|------|-----------|------------------------|-------|
| **Chambre** | Apple TV 4K | `apple_tv` | Appairage 2 PIN (AirPlay + Companion) |
| **Chambre** | Bravia | `braviatv` | Démarrage à distance activé |
| **Chambre** | Caméra LG | Flux MJPEG / intégration cam | Vision JARVIS séparée du pilotage TV |
| **Chambre** | NUC HDMI | CEC / `media_player` | Entrée HDMI Bravia pour HUD |
| **Salon** | Freebox Player | `androidtv_remote` | Exclure doublon `freebox_player_pop` |
| **Salon** | Samsung TV | CEC / Anynet+ | Micro Pi futur |
| **Maison** | Lave-linge Samsung | SmartThings | Cloud Samsung requis |
| **Futur** | Lampes Zigbee | ZHA / Z2M via Pi | Dongle sur Pi, HA sur NUC |

### 7.3 Intent JARVIS → service HA (mapping cible)

| Intent JARVIS | Domaine HA | Services |
|---------------|------------|----------|
| `home.control` | `light`, `switch`, `cover`, `climate`, `scene` | `turn_on`, `turn_off`, `open_cover`, … |
| `media.pause` | `media_player` | `media_pause`, `volume_mute` |
| Média / Netflix / app | `media_player` | `turn_on`, `select_source`, scripts HA si besoin |

**Plus de chemin parallèle** `media.streaming` → ADB sauf **repli** explicitement documenté et désactivé par défaut.

---

## 8. Satellites

### 8.1 Pi salon

| Capacité annoncée au registry JARVIS | Rôle |
|--------------------------------------|------|
| `camera.capture` | Flux salon |
| `audio.play` / ear | TTS salon |
| `player.relay` (optionnel) | Repli ADB si HA insuffisant |
| `zigbee.radio` | Présence dongle — HA consomme via IP |

**Retirer** de l’annonce Pi : `home_assistant.gateway` (HA = NUC).

### 8.2 Agent Windows

| Capacité | Rôle |
|----------|------|
| `app.launch` | Netflix/Prime/Edge local PC |
| `dev.agent.run` | Cursor/Claude CLI |

Connexion : **WS couche JARVIS** (`JARVIS_WS_URL`). Skills Hermes restent sur NUC.

---

## 9. Checklist intégrations

### Phase 0 — Prérequis NUC

- [ ] PostgreSQL actif (users, memory, dashboard)
- [ ] Couche JARVIS (`jarvis-core`) active `:8765`
- [ ] Hermes actif `:8642` (skills seedés)
- [ ] HUD/Dashboard servis (nginx / kiosk)
- [ ] LLM : VPS Ollama **ou** OpenRouter — pas de gros LLM local NUC si politique « NUC sans LLM »

### Phase 1 — Home Assistant sur NUC

- [ ] HA installé (conteneur ou supervised) sur NUC
- [ ] UI HA accessible `http://127.0.0.1:8123`
- [ ] Long-lived token créé
- [ ] `JARVIS_HASS_URL` + `JARVIS_HASS_TOKEN` dans `/etc/jarvis/core.env`
- [ ] Smoke : `GET /api/` + inventaire entités depuis couche JARVIS

### Phase 2 — Chambre

- [ ] Intégration Apple TV — appairage complet (2 PIN)
- [ ] Entité `media_player` Apple TV visible dans HA
- [ ] Intégration Bravia — power on/off + source HDMI
- [ ] Script ou service « Netflix » sur Apple TV testé **depuis HA UI**
- [ ] Entrée HDMI NUC sur Bravia identifiée et nommée dans HA

### Phase 3 — Salon

- [ ] Freebox Player via `androidtv_remote` (IP `192.168.1.49`)
- [ ] Doublon `media_player.freebox_player_pop` exclu ou désactivé
- [ ] Samsung Anynet+ / CEC activé
- [ ] Pi : ear + cam health OK
- [ ] Dongle Zigbee + `ser2net` / Z2M → HA NUC (si lampes)

### Phase 4 — Électroménager / cloud

- [ ] SmartThings + lave-linge Samsung
- [ ] Entité état (cycle, fin) en lecture pour HUD

### Phase 5 — Couche JARVIS

- [ ] Adaptateur HA pointe NUC local
- [ ] `home.control` testé avec carte Policy HOME
- [ ] Chemins `salon_player` / `media.streaming` ADB : **désactivés** ou repli flag
- [ ] Toolset HA Hermes : off prod
- [ ] Chat / recherche : Hermes + skills (`deep-research`, `agent-reach`)

### Phase 6 — Skills & doc

- [ ] `hud-apps` SKILL.md aligné gateway
- [ ] `ecosystem-hosts` : NUC=HA+HUD, Pi=salon I/O, Windows=agent
- [ ] Dedupe skills NUC (seed vs local)
- [ ] `architecture/build.py --check` vert (triggers HUD ↔ capabilities)

### Phase 7 — Tests utilisateur réels (GO Samir)

- [ ] « Allume l’Apple TV » (Policy + HA)
- [ ] « Netflix sur Apple TV chambre »
- [ ] « Allume le salon » (lumières Zigbee quand prêtes)
- [ ] « Ouvre Cursor » via agent Windows
- [ ] Coupure JARVIS → automation HA locale fonctionne encore

---

## 10. Critères de « terminé » (preuves)

| Changement | Preuve minimale |
|------------|-----------------|
| HA NUC | Token + inventaire > N entités depuis smoke ou curl |
| Intent maison | `_smoke_*` home + test vocal réel annoté |
| Policy HOME | Log + carte HUD capturée ou smoke approval |
| Pas de double chemin Netflix | `media.streaming` ADB off ; entité HA commandée |
| Hermes skills | Dedupe 0 collision ; run web.search OK |
| Pi satellite | announce sans `home_assistant.gateway` ; heartbeat OK |
| Doc | ce fichier + index `ARCHITECTURE.md` |

Rapport agent ≠ preuve (cf. [`JARVIS-VISION-ORCHESTRATION.md`](JARVIS-VISION-ORCHESTRATION.md)).

---

## 11. Plan de migration (ordre)

```
1. HA NUC install + token
2. Re-appairer intégrations (Apple TV, Bravia, Freebox, SmartThings)
3. Basculer JARVIS_HASS_URL → 127.0.0.1:8123
4. Désactiver chemins parallèles (salon_player prod, HA Hermes toolset)
5. Mettre à jour Pi announce + Zigbee remote
6. Aligner skills + capabilities
7. Tests réels pièce par pièce
8. Décommission HA Pi (optionnel — garder read-only le temps de la bascule)
```

---

## 12. Hors scope (cette spec)

- Refonte complète HUD Agentic UI / Layout Engine
- Multi-Hermes / task bus fichiers
- Ollama sur NUC
- Commit / sync NUC automatique
- Nouvelles décisions auth (voir DECISIONS — voix = auth ; Holomat gestes)

---

## 13. Arbitrage à valider (Samir)

| Sujet | Option A | Option B |
|-------|----------|----------|
| Repli Netflix si HA échoue | URL HUD (`ResultPanel`) | Pi ADB script |
| Chat libre | 100 % Hermes | Hermes + fallback Provider |
| Confirmation HOME admin chambre | Toujours carte | Auto-confirm admin NUC local |
| HA Pi legacy | Arrêt après bascule | Standby read-only 30 j |

---

## 14. Résumé une page

**JARVIS = couche gateway (`core/`) + HA (NUC) + Hermes (skills).**

- **Voix utilisateur** → Policy JARVIS → HA.  
- **Scénarios maison** → automations HA.  
- **Réflexion / web / dev** → Hermes skills, via pont JARVIS.  
- **Pi** = salon I/O + Zigbee, pas second HA.  
- **Windows** = mains PC, pas skills.  

Objectif : **finir la guerre Core/Hermes/chemins parallèles** en donnant à chaque brique **un rôle unique**.

---

## 15. Annexe — Toutes les capabilities / intents (sort migration)

> Registre source : `core/jarvis_core/capabilities.py` + miroir HUD `hud/src/app/apps/catalog.ts`.  
> **Le registre ne disparaît pas** — c’est le contrat voix + tuiles + Policy. Seul l’**exécuteur** derrière change pour maison/média TV.

### Légende

| Symbole | Signification |
|---------|---------------|
| **JARVIS** | Couche JARVIS (`core/`) — executor Python ou WS |
| **HA** | Home Assistant NUC (`JARVIS_HASS_URL`) |
| **Hermes** | Pont `HermesBridge` + skills (`Owner.HERMES`) |
| **Device** | Agent Windows / Pi / satellite HUD |
| **Fusion** | Intent + triggers conservés ; backend unifié |
| **Off** | Executor déprécié (trigger peut rester temporairement) |

### 15.1 HUD & produit — **restent (JARVIS)**

| Intent | app_id | Owner actuel | Verdict migration |
|--------|--------|--------------|-------------------|
| `core.preferences` | settings | CORE | **JARVIS** |
| `core.neural_map` | jarvis | CORE | **JARVIS** (Graph3D) |
| `core.dashboard` | hub | CORE | **JARVIS** |
| `core.monitor` | monitor | CORE | **JARVIS** |
| `core.holomat` | vision | CORE | **JARVIS** |
| `core.security` | security | CORE | **JARVIS** |
| `core.providers` | cerveau | CORE | **JARVIS** (sonde LLM) |
| `core.usage` | tokens | CORE | **JARVIS** |
| `core.missions` | objectifs | CORE | **JARVIS** |
| `hud.lock` | hud-lock | CORE | **JARVIS** |
| `hud.idle` | hud-idle | CORE | **JARVIS** |
| `hud.close_space` | hud-close | CORE | **JARVIS** |
| `hud.close_app` | hud-close | CORE | **JARVIS** |
| `hud.toggle_space` | hud-toggle | CORE | **JARVIS** |
| `hud.mute` | hud-mute | CORE | **JARVIS** |
| `hud.unmute` | hud-mute | CORE | **JARVIS** |
| `hud.camera_on` | hud-camera-on | CORE | **JARVIS** |
| `hud.camera_off` | hud-camera-off | CORE | **JARVIS** |
| `hud.enroll` | hud-enroll | CORE | **JARVIS** (+ skill `family-enroll`) |

### 15.2 Dev & Mission — **restent (JARVIS + Hermes + Device)**

| Intent | app_id | Owner actuel | Verdict migration |
|--------|--------|--------------|-------------------|
| `core.mission_dev` | mission-control-dev | CORE | **JARVIS** (+ skills Hermes projet) |
| `dev.board.create` | mission-control-dev | CORE | **JARVIS** |
| `dev.board.assign` | mission-control-dev | CORE | **JARVIS** → **Device** (Cursor/Claude) |
| `dev.board.start_run` | mission-control-dev | CORE | **JARVIS** → **Device** |
| `core.cursor` | cursor | DEVICE | **Device** (agent Windows) |
| `vps.code` | code | CORE | **JARVIS** (VPS allowlist) ou **Device** selon host |

### 15.3 Mémoire & architecture — **restent (JARVIS)**

| Intent | app_id | Owner actuel | Verdict migration |
|--------|--------|--------------|-------------------|
| `memory.search` | memory-search | CORE | **JARVIS** Memory API |
| `memory.recall` | memory-recall | CORE | **JARVIS** |
| `memory.store_note` | memory-store-note | CORE | **JARVIS** (+ skill `jarvis-memory`) |
| `architecture.explain` | architecture-explain | CORE | **JARVIS** (snapshot — pas Hermes) |
| `system.capabilities` | capabilities | CORE | **JARVIS** |
| `system.introspect` | introspect | CORE | **JARVIS** |

### 15.4 Vision & caméras — **restent**

| Intent | app_id | Owner actuel | Verdict migration |
|--------|--------|--------------|-------------------|
| `vision.analyze` | vision-analyze | CORE | **JARVIS** capture → **Hermes** vision → JARVIS TTS |
| `vision.scene` | vision-scene | CORE | **JARVIS** (SceneStore) |
| `home.camera_list` | camera_list | CORE | **JARVIS** |
| `home.camera_view` | camera_view | CORE | **JARVIS** → flux Pi cam |
| `home.camera_snapshot` | camera_snapshot | CORE | **JARVIS** → Pi |

### 15.5 Maison & média — **intents gardés, backend → HA**

| Intent | app_id | Owner actuel | Avant | Après migration |
|--------|--------|--------------|-------|-----------------|
| `home.control` | home | CORE | JARVIS → HA Pi | **JARVIS → HA NUC** |
| `media.pause` | music | CORE | JARVIS → HA | **JARVIS → HA NUC** |
| `media.streaming` | video | CORE | JARVIS → Freebox ADB | **Fusion → HA** (`media_player`) ; executor ADB **Off** prod |
| `media.video` | video | CORE | JARVIS → Plex | **JARVIS → Plex** (inchangé — hors HA) |

### 15.6 Déjà Hermes — **restent (chemin simplifié)**

| Intent | app_id | Owner | toolset | Verdict |
|--------|--------|-------|---------|---------|
| `web.search` | reach | HERMES | web | **Hermes** (+ `deep-research`, `agent-reach`) |
| `web.browse` | browser | HERMES | browser | **Hermes** (si toolset actif) |
| `files.browse` | files | HERMES | file | **Hermes** |
| `system.shell` | terminal | HERMES | terminal | **Hermes** + Policy |
| `data.analyze` | analyze | HERMES | code_execution | **Hermes** |
| `agent.skills` | skills | HERMES | skills | **Hermes** |
| `agent.tools` | outils | HERMES | skills | **Hermes** (admin) |
| `agent.cron` | crons | HERMES | cronjob | **Hermes** |
| `vps.docker` | docker | HERMES | terminal | **Hermes** |
| `vps.storage` | storage | HERMES | terminal | **Hermes** |

### 15.7 Devices & réseau — **restent (JARVIS + satellites)**

| Intent | app_id | Owner actuel | Verdict migration |
|--------|--------|--------------|-------------------|
| `devices.list` | connexions | CORE | **JARVIS** registry |
| `devices.software` | software | CORE | **JARVIS** (+ Windows agent) |
| `devices.metrics` | pc-health | CORE | **JARVIS** |
| `devices.topology` | reseau | CORE | **JARVIS** |
| `device.app_launch` | device-launch | DEVICE | **Device** |
| `system.network` | network | CORE | **JARVIS** |
| `vps.terminal` | vps-terminal | CORE | **JARVIS** (Dashboard allowlist) |
| `pi.terminal` | pi-terminal | CORE | **JARVIS** (allowlist Pi) |

### 15.8 Dégage / fusionne (exécution seulement)

| Élément | Sort |
|---------|------|
| Executor `salon_player.py` / ADB Netflix par défaut | **Off** prod → HA `media_player` |
| Toolset **HA Hermes** (commandes domotique) | **Off** prod (read-only debug max) |
| Chat libre Provider Manager ∥ Hermes | **Fusion** → Hermes + skills par défaut |
| `media.streaming` → Freebox forcée | **Fusion** → backend HA, triggers conservés |
| Logique Core dupliquant Hermes | **Nettoyage** — pont unique |

**Aucune tuile HUD `live` produit ne disparaît** sans décision explicite (passage en `soon`).

### 15.9 Flux registre après migration

```
Phrase / tuile HUD
      │
      ▼
capabilities.py  (triggers + risk + permission + owner — INCHANGÉ)
      │
      ├── Owner.CORE    → executor JARVIS (dont adaptateur HA)
      ├── Owner.HERMES  → pont HermesBridge + skills
      └── Owner.DEVICE  → router → Windows / Pi / HUD satellite
```

Sync HUD : `python architecture/build.py --check` (triggers `catalog.ts` ↔ `capabilities.py`).

### 15.10 Comptage

| Catégorie | Intents ≈ | Migration |
|-----------|-----------|-----------|
| JARVIS pur (HUD, auth, memory, archi, board…) | 35 | Inchangés |
| Hermes (`Owner.HERMES`) | 10 | Chemin simplifié |
| Device | 2 | Inchangés |
| Maison / média TV | 4 | Backend **HA NUC** |
| Vision hybride | 5 | Inchangés |

---

## 16. Implémentation code (2026-08-16)

### Phase 1 — domotique / streaming

| Livré repo | Fichiers |
|------------|----------|
| HA default NUC `:8123` | `homeassistant.py` |
| Streaming via HA `play_media` | `homeassistant.py`, `executors/media.py` |
| ADB Pi repli OFF (`JARVIS_SALON_PLAYER_FALLBACK=0`) | `media.py`, `.env.example` |
| Toolset HA Hermes retiré prod | `capabilities.py`, `config.snippet.yaml`, `_apply_hermes_toolsets_nuc.sh` |
| Pi sans `home_assistant.gateway` | `jarvis_device_announce.py` |
| Skills alignés | `hud-apps`, `ecosystem-hosts` |
| Smoke | `_smoke_ha_streaming.py`, `_smoke_capabilities.py` |

### Phase 2 — gateway chat / config centrale

| Livré repo | Fichiers |
|------------|----------|
| Module `gateway.py` (chat, HA URL, flags) | `jarvis_core/gateway.py` |
| Chat libre défaut **Hermes** | `gateway.py`, `ws/handlers/chat.py` |
| Foyer → `agent.skills` · admin → `agent.tools` | `gateway.hermes_chat_capability()` |
| Ordre pipeline : triggers → recherche → sémantique → Hermes → LLM repli | `chat.py` |
| Smoke | `_smoke_gateway.py`, `_smoke_p1.py` |

### Phase 3 — nettoyage legacy (2026-08-16)

| Supprimé | Remplacement |
|----------|--------------|
| `salon_player.py` + chemin ADB Netflix | HA `media_player.play_media` uniquement |
| `JARVIS_SALON_PLAYER_FALLBACK` / `JARVIS_STREAMING_VIA_HA` | plus de flags — HA toujours |
| `detect_home_assistant` sur Pi | HA cerveau = NUC seulement |
| Doublons `.env.example` (HA Pi, Hermes) | bloc unique Gateway |

| Conservé | Rôle |
|----------|------|
| `salon_camera.py` | flux MJPEG → Freebox via Pi (satellite I/O) |
| `freebox.player` cap Pi | discovery ADB local (ear) — pas streaming prod |

### Phase 4 — frontière Core ↔ Hermes (pas doublon)

| Fait | Détail |
|------|--------|
| `gateway.py` — `CORE_ONLY_INTENTS`, `BANNED_HERMES_TOOLSETS`, `assert_prod_hermes_boundary()` | Garde-fou prod |
| Smoke dédié | `_smoke_core_hermes_boundary.py` |
| `_smoke_hermes_slim` | plus de test toolset `homeassistant` |
| Commentaire capabilities | toolset HA Hermes exclu de la doc prod |

**Volontairement conservé (pas doublon)** :

| Module | Pourquoi |
|--------|----------|
| `hermes/bridge.py` + `delegate.py` | Pont mince — seule entrée Hermes |
| `capabilities.py` Owner.HERMES | Registre produit → délégation, pas réimplémentation |
| `providers.py` + repli chat LLM | Hermes down ou `JARVIS_CHAT_PROVIDER=llm` |
| `composer.py` | Surfaces Agentic (Planner) — pas chat agent |
| `memory/*` Core + toolset Hermes `memory` | M4 : Hermes lit/écrit via HTTP Core |
| `agent_reach_status.py` | Sonde health — exécution = skill Hermes |
| Windows agent | Inchangé — satellite `app.launch` / `dev.agent.run` |

**Reste avant NUC :** installer HA sur NUC, token, appairer Apple TV/Bravia/Freebox, sync + restart :

```env
JARVIS_HASS_URL=http://127.0.0.1:8123
JARVIS_HASS_TOKEN=<token>
JARVIS_CHAT_PROVIDER=hermes
```
