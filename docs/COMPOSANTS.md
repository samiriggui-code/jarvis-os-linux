# JARVIS — Carte des composants & matrice de panne

Où vit chaque brique, et ce qui tombe avec elle.

Complète [INSTALLATION_DEPLOIEMENT.md](INSTALLATION_DEPLOIEMENT.md) (comment
installer) et [RECOVERY.md](RECOVERY.md) (comment reprendre la main).

---

## 1. Carte d'implantation

### VPS — porte d'entrée et cerveau LLM

| Composant | Port | Service | État |
|-----------|------|---------|------|
| Caddy / nginx | 443 | paquet | à installer |
| Ollama | 11434 | `ollama.service` | à installer |
| faster-whisper PTT | — | à définir | à écrire |
| WireGuard (point d'arrivée) | 51820 | `wg-quick@` | à installer |

**Jamais sur le VPS** : Core, Hermes, PostgreSQL, Holomat, clés du foyer.
Ollama écoute sur `127.0.0.1` uniquement, atteint par le tunnel.

### NUC — le cerveau maison

| Composant | Port | Service | État |
|-----------|------|---------|------|
| **jarvis-core** | 8765 | `jarvis-core.service` | ✅ existe |
| **hermes-agent** | 8642 | `jarvis-hermes.service` (`hermes-agent` alias) | ✅ unit + wrapper |
| **PostgreSQL** | 5432 | `postgresql` | migration `001` prête |
| **Home Assistant** | 8123 | conteneur / paquet | à installer |
| **voicebox** (Whisper + TTS) | 17600 | `jarvis-voicebox.service` | ✅ existe |
| **HUD** (dist) | 8080 | `jarvis-hud.service` (Chromium kiosk) | ✅ existe |
| **Dashboard** (dist) | 5174 | ❌ **rien ne le sert** | à créer |
| Wake word | — | dans le Core | ✅ écrit, ❌ non branché |
| Holomat (visage) | — | dans le Core | ✅ existe |
| Cache vocal — 589 WAV | — | fichiers | ✅ généré, ❌ non lu |
| WireGuard (sortant) | — | `wg-quick@` | à installer |
| Clés OpenRouter · ElevenLabs | — | `/etc/jarvis/` | ✅ en `.env` |

### Pi salon — satellite radio

| Composant | Rôle |
|-----------|------|
| Coordinateur Zigbee (dongle USB) | Radio déportée au centre de la maison |
| `ser2net` ou Zigbee2MQTT distant | Expose le dongle au HA du NUC |
| *(option)* micro + haut-parleur | Satellite vocal du salon |

**Le cerveau HA est sur le NUC.** Le Pi ne porte que la radio — il est au
centre géographique, ce qui donne le meilleur maillage, sans mettre la
domotique sur la machine la plus faible.

### ProLiant — Windows 10

| Composant | Port |
|-----------|------|
| Plex | 32400 |
| Partages SMB | 445 |

Interdits : SSH, Ollama, agent JARVIS, Core.

### Clients

| Appareil | Ce qui tourne | Agent |
|----------|---------------|-------|
| Kiosque NUC | Chromium `--kiosk` | — |
| Portable · téléphone · iPad | PWA / navigateur | ❌ |
| Tablette murale | PWA en kiosque | ❌ |
| Desktop · portable · tablettes filles | — | ✅ **phase 2** |

---

## 2. Matrice de panne

Pour chaque composant : ce qui tombe, ce qui **survit**, et par où entrer.

### Ollama VPS

| | |
|---|---|
| **Tombe** | Conversation libre, raisonnement |
| **Survit** | Wake word · cache vocal · domotique · Plex · Hermes (outils) |
| **Bascule** | → OpenRouter → mode système |
| **Annonce** | « Passage au modèle secondaire. » `[ai_fallback]` |
| **Détection** | `supervisor` → sonde HTTP |

Panne **bénigne** : la cascade du §11 est faite pour ça. Rien de local ne
s'arrête.

### OpenRouter (et Ollama déjà tombé)

| | |
|---|---|
| **Tombe** | Toute conversation libre |
| **Survit** | **Toutes les intentions déterministes** — lampes, média, écrans, diagnostics |
| **Annonce** | « Aucun moteur d'IA disponible. Les fonctions locales restent actives. » `[no_llm]` |

C'est le mode 4 du §11, et c'est le retour sur investissement du cache : la
maison continue d'obéir sans une once d'IA.

### voicebox

| | |
|---|---|
| **Tombe** | STT (comprendre) · TTS de synthèse (phrases nouvelles) |
| **Survit** | **Wake word** (local) · **589 clips en cache** · HUD · Hermes · domotique |
| **Repli** | `tts_fallback` → `SpeechSynthesis` du navigateur |
| **Annonce** | « Le service demandé est indisponible. » `[service_unavailable]` |

Tu entends toujours « Oui Samir ? » — la détection et l'accusé ne dépendent
pas de voicebox. `Wants=` et non `Requires=` dans l'unité : sa mort n'emporte
pas JARVIS BASE.

### Caméra

| | |
|---|---|
| **Tombe** | Identification, donc la session · Holomat · gestes |
| **Survit** | Voix complète, wake word, tout le reste |
| **Bascule** | **Profil anonyme** : vouvoiement, permissions publiques |
| **Annonce** | « Je ne parviens pas à activer la caméra. » `[camera_failed]` |
| **Entrée** | `Ctrl+Alt+R` + PIN — ❌ **cassé aujourd'hui** |

Perdre l'identité doit **réduire** les droits, jamais les ouvrir.

### Micro

| | |
|---|---|
| **Tombe** | **La porte d'entrée unique** — pas de click-to-talk |
| **Survit** | Tout le reste, mais injoignable à la voix |
| **Annonce** | « Aucun microphone détecté. » `[mic_failed]` + indicateur permanent |
| **Entrée** | Clavier seul |

**La panne la plus handicapante du système.** C'est le prix assumé du
« tout à la voix ».

### Home Assistant

| | |
|---|---|
| **Tombe** | Lampes, volets, chauffage, portes, capteurs |
| **Survit** | Voix · conversation · Plex · média · le HUD |
| **Annonce** | « Impossible de joindre {device}. » `[device_unreachable]` |
| **Entrée** | `http://<nuc>:8123` **en direct**, hors JARVIS |

### Pi salon (dongle Zigbee)

| | |
|---|---|
| **Tombe** | Les objets **Zigbee** uniquement |
| **Survit** | HA lui-même, tout le Wi-Fi, tout le reste |

Panne partielle par construction — c'est l'intérêt de séparer la radio du
cerveau.

### Hermes Agent

| | |
|---|---|
| **Tombe** | **Toutes les actions** — 16 apps du catalogue sur 22 |
| **Survit** | Voix · cache · conversation *(via `providers.complete`)* · HA en direct |
| **Repli** | `fallback_provider` — à câbler |
| **Entrée** | Dashboard :5174 · Portainer · systemd |

⚠ Aujourd'hui `terminal`, `docker`, `files`, `connexions` sont marqués
`hermes` : **les outils de diagnostic partent avec ce qu'ils devaient
diagnostiquer.** D'où le niveau 3 (URLs directes).

### PostgreSQL

| | |
|---|---|
| **Tombe** | Users, sessions, permissions, historique, usage |
| **Survit** | Rien d'authentifié. Le Core démarre mais ne peut identifier personne |

**Panne la plus grave après le Core.** Sauvegardes sur le NAS ProLiant.

### jarvis-core

| | |
|---|---|
| **Tombe** | HUD · Dashboard · voix · orchestration — tout JARVIS |
| **Survit** | **La maison** : HA, Plex, interrupteurs physiques |
| **Entrée** | Niveau 3 (URLs directes) puis −1 (`tty2`) |

`Restart=on-failure` + `WatchdogSec=30` — couvre aussi le Core **figé**.

### HUD

| | |
|---|---|
| **Tombe** | L'affichage, et **`Ctrl+Alt+R`** (c'est du React) |
| **Survit** | Core · Hermes · Dashboard · voix |
| **Entrée** | **Dashboard sur :5174, app autonome** |

Le Dashboard est une application React **séparée**, atteinte par iframe
depuis le HUD. Il s'ouvre donc directement au navigateur, HUD mort ou vif.

### Tunnel WireGuard

| | |
|---|---|
| **Tombe** | Accès depuis l'extérieur |
| **Survit** | **Toute la maison**, à l'identique |
| **Annonce** | « La maison est injoignable pour le moment. » `[house_unreachable]` |

Panne bénigne à domicile, totale dehors. C'est pourquoi le tunnel ne porte
**jamais l'audio** : la couche conversationnelle survit à sa chute.

### VPS entier

| | |
|---|---|
| **Tombe** | Accès extérieur · Ollama #1 |
| **Survit** | **Toute la maison** — Core, voix, domotique, cache |
| **Bascule** | OpenRouter → mode système |

C'est la validation de « Core sur le NUC » : le VPS peut brûler, la maison
répond toujours.

---

## 3. Vérification de ton scénario

| Ton hypothèse | Vérifié |
|---|---|
| Le Dashboard ne dépend pas de Hermes | ✅ App React autonome sur :5174 |
| Un satellite qui tombe n'emporte rien | ✅ Clients web sans état |
| HUD mort → Dashboard, Hermes, Core continuent | ✅ **architecturalement**, ⚠ rien ne sert le Dashboard en prod |
| Le Core surveille tous les modules | ⚠ `supervisor.py` existe — sondes `hermes`, `voice`, `face` ; il manque HA, Postgres, Ollama |
| Redémarrage auto | ✅ systemd `Restart=on-failure` — **ne pas doubler avec un Guardian** |
| Safe Mode après 3 crashs | ❌ à faire — `StartLimitBurst=3` + `OnFailure=` le fait nativement |
| Console Linux en dernier recours | ✅ `jarvis.target` + `jarvis-hermes` (alias `hermes-agent`) |
| Notification téléphone | ❌ à faire |

### Les trous réels restants

1. **`jarvis-dashboard.service`** — `dashboard/dist` arrive sur le NUC, rien ne le sert
2. **`elevate_admin(recovery_pin)`** — caméra morte = PIN refusé, le niveau 0 est inaccessible
3. **`DASHBOARD_ORIGIN` en dur** (`http://127.0.0.1:5174`) — en prod le `postMessage` sera rejeté **sans aucune erreur visible**
4. **Registre d'outils** — la liste des URLs directes n'existe nulle part hors de Hermes

~~`hermes-agent.service`~~ — comblé : `deploy/systemd/jarvis-hermes.service` (alias `hermes-agent`).

Le 2 est le plus urgent : sans lui, toute la hiérarchie de secours s'arrête au
niveau 1.
