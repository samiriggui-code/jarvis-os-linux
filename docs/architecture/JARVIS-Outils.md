# JARVIS — inventaire des outils et couverture du volet Applications

> Mesuré le **2026-08-05**. À relire avant usage — c'est un constat, pas un contrat.
>
> Sources : `hud/src/app/apps/catalog.ts` · `core/jarvis_core/__init__.py` (table `ROUTES`) ·
> `/opt/jarvis/hermes-agent/tools/` sur le NUC, commit `f5be923` du 2026-08-04.

Ce document répond à une question simple restée sans réponse : **quand on ouvre une
tuile du volet Applications, qui l'exécute, et avec quoi ?**

---

## 1. Trois inventaires, pas un

| Inventaire | Où il vit | Ce qu'il contient | Nombre |
|---|---|---|---|
| **A — Outils JARVIS** | `core/jarvis_core/` | Ce que le Core sait faire lui-même | 16 routes WS |
| **B — Outils Hermes** | `hermes-agent/tools/` (NUC) | Ce que l'agent sait appeler | 79 outils |
| **C — Volet Applications** | `hud/src/app/apps/catalog.ts` | Les **intentions** offertes à l'utilisateur | 30 tuiles |

**C n'est ni A ni B.** Une tuile est une porte d'entrée vers un besoin ; ce qui
l'exécute derrière (Core, Hermes, agent d'appareil) est un détail d'implémentation que
l'utilisateur ne doit jamais voir. Le champ `status` (`live` / `hermes` / `soon`) est
une information de **santé et de routage**, pas une catégorie produit.

---

## 2. Inventaire A — outils JARVIS (Core)

Table `ROUTES` de `core/jarvis_core/__init__.py`. Ajouter un type = une ligne.

| Route | Handler | Ce qu'elle sert |
|---|---|---|
| `ping` | `handle_ping` | Vivacité |
| `auth` | `handle_auth` | Login, enroll, elevate, revoke, recovery — foyer et rôles |
| `holomat` | `handle_holomat` | Caméra, calibration, état vision |
| `gesture` | `handle_gesture` | Signaux MediaPipe bruts, fire-and-forget à 30 fps |
| `peripheral` | `handle_peripheral` | Déclaration caméra / micro (embryon de Device Manager) |
| `preferences` | `handle_preferences` | Préférences HUD, profils de gestes, locale |
| `memory` | `handle_memory` | Mémoire Core |
| `voice` | `handle_voice` | STT, TTS, profils vocaux, transcription |
| `agent_reach` | `handle_agent_reach` | État de la couche Internet |
| `supervisor` | `handle_supervisor` | Santé des services |
| `usage` | `handle_usage` | Quotas et consommation IA |
| `boot` | `handle_boot` | Fin de cinématique HUD — le Core peut parler |
| `surface` | `handle_surface` | Admission d'un document de surface agentique |
| `user_event` | `handle_chat` | Conversation |
| `stop_run` | `handle_stop_run` | Interruption |
| `mission_dev` | `handle_mission_dev` | Mission Control DEV |

Plus trois registres internes :

| Registre | État |
|---|---|
| `PolicyEngine` | **actif** — 4 sites d'appel (`chat`, intent, ligne 2072, `recovery.py`) |
| `BindingResolver` | **3 liaisons** — `system.*` (métriques), `system.uptime_s`, `system.host` |
| `IntentExecutor` | **VIDE** — aucun exécutant enregistré. Toute action est refusée bruyamment |

> `IntentExecutor` vide est la fente d'exécution du Core. C'est là que doit se brancher
> tout ce qui agit sur le monde — y compris la domotique.

---

## 3. Inventaire B — outils Hermes

> **Correction du 2026-08-05.** Le premier relevé comptait 79 outils lus dans
> `tools/*.py`. C'est le nombre de fonctions *définies*, pas la surface *exposée*.
> `GET /v1/toolsets` donne la vraie granularité : **28 toolsets, dont 14 activés**.
> Deux conséquences : un toolset `spotify` existe bel et bien (7 outils, désactivé) —
> « Musique : aucun outil » était faux ; et c'est le **toolset**, jamais l'outil, que
> le Core autorise, parce que nommer des outils un par un dérive à chaque mise à jour
> d'Hermes.

### 3.1 Toolsets, état réel sur le NUC

| Toolset | Activé | Configuré | Outils |
|---|---|---|---|
| `web` | ✅ | ✅ | web_search · web_extract |
| `browser` | ✅ | ✅ | 13 (browser_* + web_search) |
| `terminal` | ✅ | ✅ | terminal · process |
| `file` | ✅ | ✅ | read_file · write_file · patch · search_files |
| `code_execution` | ✅ | ✅ | execute_code |
| `skills` | ✅ | ✅ | skills_list · skill_view · skill_manage |
| `memory` · `todo` · `session_search` · `cronjob` · `delegation` | ✅ | ✅ | 1 chacun |
| `image_gen` · `bfl` | ✅ | ✅ | génération d'images / vidéos |
| `vision` | ✅ | ❌ | vision_analyze — identifiants manquants |
| **`homeassistant`** | ❌ | ❌ | **ha_list_entities · ha_get_state · ha_list_services · ha_call_service** |
| `spotify` | ❌ | ✅ | 7 — playback, devices, library, playlists, queue, albums |
| `a2a` | ❌ | ✅ | a2a_call · a2a_discover · a2a_orchestrate · a2a_list · a2a_history |
| `computer_use` · `x_search` · `tts` · `stt` · `clarify` · `video` · `video_gen` | ❌ | ✅ | — |
| `discord` · `discord_admin` · `yuanbao` | ❌ | ✅ | à laisser éteints |
| `context_engine` | ❌ | ✅ | 0 outil résolu |

`homeassistant` est **le seul toolset ni activé ni configuré** : `configured=false`
traduit exactement l'absence de `HASS_TOKEN`, et `enabled=false` qu'on ne l'a jamais
allumé. Les deux se règlent au même endroit.

### 3.2 Les outils par famille

| Famille | Nb | Outils | Verdict JARVIS |
|---|---|---|---|
| **Domotique** | 4 | `ha_list_entities` · `ha_get_state` · `ha_list_services` · `ha_call_service` | ✅ à activer |
| **Internet** | 3 | `web_search` · `web_extract` · `x_search` | ✅ recouvre partiellement Agent-Reach |
| **Navigateur** | 12 | `browser_navigate/snapshot/click/type/press/scroll/back/vision/console/get_images/dialog/cdp` | ✅ hosts sans API |
| **Système** | 5 | `terminal` · `execute_code` · `process` · `read_terminal` · `close_terminal` | ⚠️ **sous Policy d'abord** |
| **Fichiers** | 4 | `read_file` · `write_file` · `patch` · `search_files` | ⚠️ idem |
| **Mémoire / organisation** | 7 | `memory` · `todo` · `cronjob` · `session_search` · `project_create/list/switch` | ✅ (3ᵉ magasin de mémoire) |
| **Kanban** | 12 | `kanban_list/show/create/complete/block/unblock/link/comment/heartbeat/attach/attach_url/attachments` | 🎯 Mission Control existe déjà ici |
| **Agents / skills** | 5 | `delegate_task` · `clarify` · `skills_list` · `skill_view` · `skill_manage` | 🎯 Evolution Lab en germe |
| **Voix / perception** | 3 | `text_to_speech` · `vision_analyze` · `video_analyze` | ⚠️ `text_to_speech` doublonne la voix Core |
| **Génération média** | 10 | `image_generate` · `video_generate` · `bfl_flux3_*` (6) · `xai_video_edit/extend` | ❌ clés payantes, aucun usage |
| **Interface Hermes** | 2 | `focus_pane` · `open_preview` | ❌ vise le GUI desktop d'Hermes |
| **Messagerie** | 12 | `send_message` · `react_to_message` · `feishu_*` (5) · `yb_*` (5) | ❌ 10/12 à désactiver |

**≈ 30 utiles · 20 à désactiver · 9 à encadrer.**

---

## 4. Inventaire C — le volet Applications, par catégorie

Légende : ✅ couvert par un outil réel · ⚠️ partiel ou détourné · ❌ aucun outil ·
🔵 relève du Core, pas d'Hermes

### 4.1 Système — 7 tuiles

| Tuile | `hermesTool` déclaré | Outil réel | Verdict |
|---|---|---|---|
| **Paramètres** | — | 🔵 Core `preferences` | ✅ live |
| **Noyau** (NeuralMap) | `neural_map` | aucun | 🔵 live local — le `hermesTool` est superflu |
| **Dashboard** | `dashboard_open` | aucun | 🔵 live, `requestDashboard` côté HUD |
| **Moniteur** | — | 🔵 Core `supervisor` + bindings `system.*` | ✅ live |
| **Holomat** | — | 🔵 Core `holomat`, `gesture`, `peripheral` | ✅ live |
| **Sécurité** | `security_status` | aucun | 🔵 **mauvais propriétaire** — Policy et auth sont au Core |
| **Réseau** | `network_status` | aucun (`terminal` en détour) | ❌ |

### 4.2 Hermes — 18 tuiles

| Tuile | `hermesTool` déclaré | Outil réel | Verdict |
|---|---|---|---|
| **Terminal** | `vps_shell_limited` | `terminal` · `process` · `read_terminal` | ⚠️ **l'allowlist VPS est inconnue d'Hermes** |
| **Fichiers** | `files_browse` | `read_file` · `write_file` · `patch` · `search_files` | ✅ |
| **Navigateur** | `browser` | les 12 `browser_*` | ✅ |
| **Internet** | `agent_reach` | `web_search` · `web_extract` · `x_search` | ⚠️ GitHub / YouTube / Reddit / RSS = CLI externe |
| **Docker** | `vps_docker_limited` | via `terminal` uniquement | ⚠️ aucun outil docker natif |
| **VS Code** | `vps_code_limited` | aucun | ❌ fichiers oui, IDE distant non |
| **Analyse** | `analyze` | `execute_code` | ⚠️ détourné |
| **Stockage** | `vps_storage_limited` | via `terminal` (`df -h`) | ⚠️ |
| **Cerveau** | `node_cerveau` | aucun | 🔵 c'est `providers.py`, le Provider Manager |
| **Tokens** | `node_tokens` | aucun | 🔵 c'est la route Core `usage` |
| **Objectifs** | `node_missions` | aucun | ❌ |
| **Skills** | `node_skills` | `skills_list` · `skill_view` · `skill_manage` | ✅ |
| **Connexions** | `node_connexions` | aucun | ❌ Device Manager inexistant |
| **Topologie** | `node_reseau` | aucun | ❌ |
| **Cursor** | — | — | ✅ live (simulation) |
| **Mission Ctrl DEV** | `node_mission_control_dev` | 🔵 route Core `mission_dev` **+** les 12 `kanban_*` | ⚠️ **deux moitiés qui ne se parlent pas** |
| **Crons** | `node_crons` | `cronjob` | ✅ |
| **Outils** | `tool_manager` | `skill_manage` (+ MCP) | ✅ |

### 4.3 Maison — 1 tuile

| Tuile | `hermesTool` déclaré | Outil réel | Verdict |
|---|---|---|---|
| **Maison** | `home_assistant` | `ha_list_entities` · `ha_get_state` · `ha_list_services` · `ha_call_service` | ✅ **dès que `HASS_TOKEN` existe** |

### 4.4 Médias — 2 tuiles

| Tuile | Intention | Outil réel | Verdict |
|---|---|---|---|
| **Musique** | `media.music` | toolset `spotify` — 7 outils | ⚠️ existe, **désactivé** chez Hermes |
| **Vidéo** | `media.video` | aucun | ❌ Plex / VLC = agent d'appareil |

### 4.5 Outils — 2 tuiles

| Tuile | Statut | Note |
|---|---|---|
| **Courrier** | `soon` | Hermes embarque `microsoft_graph_client`, non exposé comme outil LLM |
| **Agenda** | `soon` | — |

### 4.6 Le compte

| Verdict | Tuiles |
|---|---|
| ✅ toolset réel et activé | **7** — Fichiers, Navigateur, Internet, Skills, Crons, Outils, Analyse |
| ⚠️ toolset réel, **désactivé** | **2** — Maison (`homeassistant`), Musique (`spotify`) |
| ⚠️ détourné par `terminal` | **1** — Terminal (allowlist appliquée par la Policy) |
| ❌ aucun exécutant, déclaré exprès | **6** — Docker, Stockage, VS Code, Vidéo, Connexions, Topologie |
| 🔵 relève du Core | **12** — Paramètres, Noyau, Dashboard, Moniteur, Holomat, Sécurité, Réseau, Cerveau, Tokens, Objectifs, Cursor, Mission Ctrl DEV |
| `soon` | **2** — Courrier, Agenda |

**Les 24 anciens noms `hermesTool` ne correspondaient à aucun outil réel.** Le champ a
été remplacé par `intent`, résolu dans `core/jarvis_core/capabilities.py`. Les tuiles
sans exécutant restent **visibles et déclarées** : l'ouverture échoue avec sa raison,
plutôt que de laisser croire que le volet est complet.

---

## 5. Ce qui se passe quand on clique

**Avant** (constat du 2026-08-05) : toute tuile `status: 'hermes'` déclenchait une
**notification** — « Surface HUD — Hermes outil « X » » — et rien d'autre. 20 des 30
tuiles ne faisaient rien, parce que le pont Core→Hermes n'existait pas.

**Depuis** : le HUD n'affiche plus de libellé, il émet une intention.

```
Tuile cliquée / phrase vocale
  │
  ├─ HUD   {type:"surface", action:"open", app:"home", intent:"home.control"}
  │        openHudApp.ts — ne sait pas qui exécute, et n'a pas à le savoir
  │
  ├─ Core  capabilities.for_app("home")   → owner, toolset, risque, permission
  │        allows(cap, rôle)              → ADMIN seul là où c'est écrit
  │        cap.available                  → refus honnête si rien ne la réalise
  │        policy.evaluate(intent, risk)  → LA chaîne du SOUL.md, enfin appliquée
  │           ├── refusée            → surface_error, rien n'est appelé
  │           ├── confirmation       → ApprovalCard diffusée, phrase mise de côté
  │           └── autorisée          → IntentExecutor
  │
  ├─ Pont  hermes.ask(cap, prompt, role, decision)
  │        refuse si : décision négative · owner ≠ hermes · toolset absent ·
  │        toolset non délégable pour ce rôle · clé API manquante
  │
  └─ Hermes  toolset autorisé uniquement → outils → résultat marqué « non fiable »
```

Le lanceur ne bénéficie d'**aucun raccourci** : cliquer « Maison » traverse exactement
ce que traverse « Jarvis, allume le salon ».

---

## 6. Exemple concret de bout en bout — la lumière du salon

### 6.1 Ce qui se passait

```
« Jarvis, allume la lumière du salon »
  → Core STT → handle_chat
  → policy.evaluate(action="chat", risk=INFO)      ← INFO, pas HOME
  → providers.complete()
  → une phrase polie. Aucune lampe ne s'allume.
```

Et par le volet : clic sur **Maison** → notification « Hermes outil `home_assistant` » → fin.

Le chemin `surface/open` existe désormais et applique la Policy au bon niveau de
risque (`HOME`). Ce qui manque encore est **en amont** : la boucle vocale route
toujours « allume le salon » vers `handle_chat`. Reconnaître l'intention dans une
phrase — et non seulement dans un clic — reste à faire.

### 6.2 Prérequis — HA sur le Pi

État constaté le 2026-08-05 sur `jarvis-salon` (Raspberry Pi 3B, 905 Mo, Debian 13,
aarch64, 22 Go libres) : **Home Assistant n'est pas installé.** Docker tourne, sans
aucune image ni conteneur ; aucun port hors 22 ; aucun dongle Zigbee branché.

Trois choses à poser :

1. **HA Container** sur le Pi (HA OS et Supervised exigent 2 Go ; il en a 0,9). Prévoir
   du swap.
2. Un **token longue durée** généré dans HA.
3. Dans `/etc/jarvis/hermes.env` (chmod 600, hors git) :
   ```
   HASS_URL=http://192.168.1.27:8123
   HASS_TOKEN=<token>
   ```

Hermes tourne sur le NUC, **même LAN que le Pi** — pas de tunnel nécessaire pour HA.
`_check_ha_available()` active alors les quatre outils `ha_*`, invisibles jusque-là.

### 6.3 La chaîne cible

```
« Jarvis, allume la lumière du salon »
  │
  ├─ 1. Core — STT, réveil, identification du locuteur (face + timbre)
  │       → profil, rôle, locale
  │
  ├─ 2. Core — intent  home.light.on  ·  risk = HOME
  │
  ├─ 3. Core — policy.evaluate(action="home.light.on", risk=RiskLevel.HOME)
  │       ADMIN / USER : autorisé   ·   CHILD : refusé
  │       ⚠ c'est ICI que la chaîne SOUL.md est appliquée, nulle part ailleurs
  │
  ├─ 4. Core → Hermes (:8642) — avec le catalogue d'outils FILTRÉ par la session
  │       la session ne voit que  ha_*  ·  ni terminal, ni write_file
  │
  ├─ 5. Hermes — raisonne et enchaîne :
  │       ha_list_entities(area="salon")   → light.salon_plafond
  │       ha_call_service("light", "turn_on", entity_id="light.salon_plafond")
  │
  ├─ 6. HA sur le Pi — Zigbee → la lampe s'allume
  │
  └─ 7. Retour Core → bus → HUD (tuile Maison à jour) + TTS **du Core**
          jamais le text_to_speech d'Hermes : il court-circuiterait le cache vocal
```

### 6.4 L'étape 4 — faite

Elle manquait, et elle seule. Poser HA d'abord et brancher Hermes dessus directement
aurait fonctionné — en plaçant la domotique hors de la Policy, où un enfant allumerait
le four aussi facilement qu'une lampe.

Trois fichiers la tiennent :

| Fichier | Rôle |
|---|---|
| `core/jarvis_core/capabilities.py` | La table `intention → propriétaire · toolset · risque · permission`. 28 capacités, 24 avec exécutant. |
| `core/jarvis_core/hermes.py` | La **seule** porte vers Hermes. Exige une `Decision`, filtre les toolsets par rôle, marque les données rapportées comme non fiables. |
| `core/jarvis_core/__init__.py` | `_register_capabilities()` remplit `IntentExecutor`, resté vide jusqu'ici ; `handle_surface` gagne l'action `open`. |

Ce que le rôle peut déléguer (`ROLE_TOOLSETS`) :

| Rôle | Toolsets délégables |
|---|---|
| anonyme / inconnu | **aucun** |
| `guest` | aucun |
| `child` | `spotify` |
| `user` | `homeassistant` · `spotify` · `web` · `browser` |
| `admin` | tous ceux qu'une capacité nomme (calculé, non listé) |

Vérifié par `python -m jarvis_core._smoke_capabilities` — 28 contrôles, dont six
**refus** attendus : décision négative, enfant sur la maison, anonyme, capacité sans
toolset, capacité non-Hermes, clé API absente.

### 6.5 Le raisonnement d'Hermes — tunnel NUC → VPS

Le pont livre l'intention à Hermes avec le bon toolset. Encore faut-il qu'Hermes
sache **raisonner** pour choisir les outils : sans modèle, il reçoit la demande, a
les quatre outils HA sous la main, et répond `No inference provider configured`.

Montage retenu le 2026-08-05 — Ollama du VPS, atteint par un **tunnel sortant**.
Ollama reste en loopback des deux côtés : rien n'est exposé publiquement.

```
NUC 127.0.0.1:11435  ──ssh -L──►  VPS 127.0.0.1:11435  (docker qwen-ollama)
        ▲
   Hermes lit  model.base_url = http://127.0.0.1:11435/v1
```

| Pièce | Emplacement |
|---|---|
| Clé dédiée | NUC `~/.ssh/jarvis_vps_ollama_ed25519`, sans passphrase |
| Autorisation | VPS `~/.ssh/authorized_keys` |
| Service | `deploy/systemd/jarvis-tunnel-ollama.service` |
| Modèle | `/var/lib/jarvis/hermes/config.yaml` → `model:` |

La clé est **inutilisable pour autre chose** :

```
restrict,port-forwarding,permitopen="127.0.0.1:11435",command="/bin/false"
```

`restrict` coupe pty, agent, X11 et tout forwarding ; on rouvre le seul forwarding
utile et on le borne à la destination Ollama. Volée, cette clé ne donne ni shell ni
accès à un autre port du VPS — vérifié : une tentative de `ssh … id` ne rend rien.

Deux options du service ne sont pas décoratives. `ExitOnForwardFailure` : sans lui,
ssh reste connecté quand le bind local a échoué — le service serait « actif » et le
port muet, la panne la plus pénible parce que systemd la déclare saine.
`ServerAliveInterval=30` / `CountMax=3` : une connexion coupée par la box reste
ouverte côté client pendant des heures ; trois échecs font tomber le processus, et
`Restart=always` le relance.

**Trois contraintes découvertes à l'usage**, dans l'ordre où elles sont apparues.

**1. Contexte minimum.** Hermes impose `MINIMUM_CONTEXT_LENGTH = 64_000`
(`agent/model_metadata.py:390`). `qwen2.5:7b-instruct` n'en déclare que 32 768 et est
**refusé** — le modèle historique du VPS ne convient pas pour Hermes, même s'il reste
bon pour le Provider Manager du Core. Retenu : **`llama3.1:8b`**, 131 072 de contexte,
appel d'outils supporté.

**2. Trop d'outils tue l'appel d'outil.** Avec les 15 toolsets ouverts (~25 outils
exposés), llama3.1:8b **décrit** l'appel en prose au lieu de l'émettre, et invente le
résultat : « 3 capteurs » là où il y en a 10. Aucun outil n'est appelé, et la réponse
a l'air correcte. Réduit à `homeassistant · memory · todo`, le même modèle appelle
réellement l'outil et répond **10** — le chiffre exact.

Le modèle n'était pas en cause : interrogé directement avec **une seule** définition
d'outil, il émet un `tool_calls` propre (`ha_list_entities {"domain":"sensor"}`).
C'est la largeur de la surface qui le fait décrocher.

D'où le verrou ajouté dans `hermes.py` : le pont vérifie l'état réel du toolset
(`absent` / `désactivé` / `non configuré`) **avant** de déléguer, et refuse en le
disant. Sans lui, déléguer vers un toolset éteint produit une réponse inventée —
le pire des échecs, celui qui ressemble à un succès.

**3. Le VPS n'a pas de GPU.** 8 cœurs, 31 Go, aucun accélérateur : **3,4 tokens/s**.
Une commande domestique complète (invite système + outils + raisonnement + résultat
+ réponse) a mis **475 secondes** — huit minutes. La chaîne est juste, le débit ne
l'est pas : `DEFAULT_TIMEOUT = 30 s` du pont est dépassé d'un ordre de grandeur.

Ce montage est donc **vérifié mais pas utilisable à la voix**. Pour le rendre
interactif il faut, au choix : un GPU (le ProLiant, s'il en a un), un modèle beaucoup
plus petit, ou un modèle distant payant pour Hermes seul.

### 6.6 Ce qui reste

1. **HA sur le Pi** — installation + token (§6.2). Rien à coder.
2. **`JARVIS_HERMES_KEY`** côté Core : sans elle, le pont refuse en le disant. La clé
   existe déjà dans `/etc/jarvis/hermes.env` sur le NUC.
3. **Reconnaissance d'intention dans la voix** — aujourd'hui seul le clic emprunte
   `surface/open` ; « allume le salon » part encore dans `handle_chat`.
4. **Surfaces de résultat** : `display: GENERATED` passe par le composeur. Les tuiles
   fréquentes gagneraient une surface **préfabriquée**, qui n'exige aucun LLM.

---

## 7. Corollaires relevés au passage

1. ~~**`hermesAppsManifest()` n'a aucun consommateur.**~~ **Retiré.** Il sérialisait le
   catalogue « pour Hermes » et personne ne l'appelait. La correspondance appartient
   désormais au Core, seul capable de la faire respecter.
2. ~~**`VPS_ALLOWLIST.dockerServices` mélange les hôtes.**~~ **Corrigé** : la liste ne
   nomme plus que des services réellement hébergés sur le VPS (`ollama`, `voicebox`,
   `caddy`). Elle contenait `homeassistant` (qui va sur le **Pi**) et `plex` (sur le
   **ProLiant sous Windows**, ni Docker ni SSH) — elle n'autorisait donc rien de réel
   pour ces deux-là, tout en donnant l'illusion inverse. Une allowlist *par hôte*
   demanderait un Device Manager, qui n'existe pas.
3. **Tuiles verrouillées — divergence assumée mais non écrite.** `AppGrid.tsx:106`
   affiche les apps `adminOnly` grisées mais visibles ; `composer.py` cache au LLM ce
   que la session n'a pas le droit de voir. Les deux sont justes — pour un humain
   « Discovery ≠ droits » (SOUL.md), pour un LLM on n'enseigne pas ce qu'on refuse.
   Rien ne le documente : quelqu'un « corrigera » l'une des deux un jour.
4. **Trois magasins de mémoire** : `core/jarvis_core/memory.py`, l'outil `memory`
   d'Hermes, et `deploy/hermes/memories/MEMORY.md` (wiki Markdown — idée memU).
   Progressive retrieve avant tâche non triviale ; agent distille, store rappelle.
   **Pas** de 4ᵉ store (memU cloud/sidecar, vector tiers). Voir
   `deploy/hermes/memories/README.md` + § mémoire dans `JARVIS-VISION-ORCHESTRATION.md`.
5. **Doublons voix** : `text_to_speech`, `wake_word.py` et `voice_mode.py` côté Hermes
   font doublon avec `core/jarvis_core/voice/`.

---

## 8. Ce que ce document ne dit pas

Il ne définit **ni le protocole du pont Core→Hermes, ni le format de résolution
`intention → outils`, ni la liste des outils exposés par profil**. Chacun mérite son
contrat, écrit au moment de le construire.
