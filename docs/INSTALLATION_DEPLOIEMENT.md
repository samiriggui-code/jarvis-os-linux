# JARVIS OS — Architecture & installation de déploiement

> Vision Mission Control / Memory Engine / agents : `hud/cahierdecharges.md` **§15**.  
> **Décision produit (tranché)** — cible **prod**, pas un parcours « optionnel / plus tard ».  
> **Core + Hermes + HA + voix + Holomat** sur le **NUC**.  
> **VPS** = TLS + HUD/Dash + reverse WSS + **Ollama (LLM #1)** + relais hors domicile.  
> **ProLiant (Windows)** = **Plex + bibliothèque NAS uniquement** — **pas d’Ollama**, **pas de SSH**.  
> **PostgreSQL obligatoire** (users, Dashboard, config).  
> **Aucun port ouvert sur la box** — tunnel sortant NUC → VPS.

Références : [`core/`](../core/), [`hud/`](../hud/), [`deploy/`](../deploy/), [`vendor/agents/hermes-agent/`](../vendor/agents/hermes-agent/), cahier §2 / §3 / §6.8 / §10 / §11 / §13 / §14 (`hud/cahierdecharges.md`).

---

## 1. Principe

| Machine | Ce qui tourne dessus |
|---------|----------------------|
| **VPS** | Caddy/nginx (TLS + HUD/Dash + **WSS → Core**) · **Ollama** (LLM foyer #1) · STT hors domicile (Whisper PTT) |
| **NUC** | **Core** · **Hermes** (dès le 1er chat) · **Home Assistant** · **PostgreSQL** · Whisper + wake · Piper / voicebox · Holomat · clés **OpenRouter** + **ElevenLabs** |
| **Pi salon** | Satellite HA (Zigbee / pièce) — pas le cerveau HA |
| **ProLiant (Windows)** | **Plex + bibliothèque / NAS** — pas d’agent OS, pas de SSH, pas d’Ollama |
| **Portable / téléphone** | **Navigateur web uniquement** (pas d’agent Windows / Android pour l’instant) — micro + caméra navigateur |
| **OpenRouter / ElevenLabs** | Clés API sur le **NUC** (Core / Hermes) |

### Règles non négociables

1. **Core sur le NUC** — caméra / micro physiques, Holomat, policy, Postgres. Pas de Core sur le VPS.
2. **Hermes dès le premier chat** — seed `deploy/hermes/` obligatoire. Cerveau + outils (HA, Plex, …). Pas de chat « Core seul » en prod.
3. **Chaîne LLM** :
   ```
   Ollama VPS → OpenRouter (2ᵉ IA / agents lourds) → mode système (sans LLM)
   ```
   Pas d’Ollama sur le ProLiant.
4. **Voix maison** : wake + Faster-Whisper + Piper (ou voicebox). **ElevenLabs** : cache phrases + **TTS dehors** (tél / portable web).
5. **Clients externes** : web seulement → demander **micro + caméra** (voix + visage). Pas d’agent natif Windows/Android pour l’instant.
6. **PostgreSQL** : users, sessions, tables Dashboard / config / usage — **obligatoire**. SQLite = transition / hors prod.
7. **HA** : installé sur le NUC ; **Hermes configure HA**, scanne l’écosystème, propose / ajoute les périphériques (appairage + Policy — discovery ≠ droits).
8. **ProLiant Windows** : joignable via **Plex API / partage médias** depuis le NUC — **jamais via SSH**.

### Charge NUC

Core + Hermes + Whisper + Holomat + HA + Postgres. Si saturation : Whisper `base` → `tiny`, puis alléger la vision — **ne pas déporter le Core**.

---

## 2. Schéma global

```
                    Internet
                        │
                        ▼
              ┌─────────────────────┐
              │        VPS          │
              │  TLS · HUD/Dash     │
              │  WSS → tunnel       │
              │  Ollama (LLM #1)    │
              │  Whisper PTT (dehors)│
              └──────────┬──────────┘
                         │ tunnel sortant NUC→VPS
                         ▼
┌────────────────────────────────────────────────────────────┐
│                         LAN maison                         │
│  ┌──────────────────────┐    ┌─────────────┐  ┌──────────┐ │
│  │         NUC          │    │  ProLiant   │  │ Pi salon │ │
│  │  Core · Hermes · HA  │◄──►│ Windows     │  │ Zigbee   │ │
│  │  Postgres · Whisper  │    │ Plex · NAS  │  │ satellite│ │
│  │  Piper · Holomat     │    │ (pas SSH)   │  └────▲─────┘ │
│  │  clés OpenRouter /  │    └─────────────┘       │       │
│  │  ElevenLabs          │                          │       │
│  └──────────┬───────────┘                          │       │
│             │              HA ← radio ─────────────┘       │
│             ▼                                              │
│        Navigateur / kiosque (micro + caméra)               │
└────────────────────────────────────────────────────────────┘
```

Flux :

```
Utilisateur (voix / HUD web)
        → Core (auth · policy · Postgres · WS)
        → Hermes (seed SOUL/skills)
              ├── Ollama VPS
              ├── OpenRouter
              └── outils : HA (scan/config) · Plex (API) · …
        → TTS : Piper (maison) / ElevenLabs (extérieur + cache)
```

```
IA → Proposition → Policy Engine → Autorisation → Exécution
```

---

## 3. Rôles

### 3.1 VPS

| Service | Rôle |
|---------|------|
| Caddy / nginx | HTTPS HUD/Dash, `wss://…/ws` → Core NUC |
| **Ollama** | **LLM #1** (chat courant, Hermes) |
| faster-whisper | STT **push-to-talk** hors domicile |
| (pas) | Core, Hermes, Holomat, Postgres users, clés maison en clair |

### 3.2 NUC

| Process | Rôle |
|---------|------|
| `jarvis-core` | API WS, auth, Holomat, policy, providers |
| `hermes-agent` | Orchestration + skills — **installé avant le 1er chat** |
| **PostgreSQL** | Users, Dashboard, config, usage, tables essentielles |
| **Home Assistant** | Domotique — configuré / enrichi par Hermes |
| `jarvis-voice` | Wake · Whisper · Piper (ou voicebox) |
| Holomat | Face enroll / verify (caméra NUC + clients web) |
| Secrets | `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, tokens HA/Plex, DSN Postgres |

### 3.3 ProLiant (Windows)

| Service | Rôle |
|---------|------|
| Plex | Bibliothèque médias → agent Plex (API / token) |
| NAS / partages | Stockage films / séries |
| **Interdit** | SSH, Ollama, agent JARVIS Windows, Core |

Accès NUC → ProLiant : **HTTP Plex + SMB/NFS si besoin**, firewall LAN restreint au NUC.

### 3.4 Clients (web)

| Contexte | Auth / capteurs | Voix |
|----------|-----------------|------|
| Maison (kiosque / LAN) | Caméra + micro (wake / Holomat) | Whisper + Piper NUC |
| Extérieur (tél / portable) | **Permissions navigateur** micro (+ caméra si face) | PTT → Whisper VPS · TTS **ElevenLabs** |

Pas d’APK / pas d’agent Windows pour l’instant.

### 3.5 Agents d’appareil — phase 2, pas maintenant

Un agent sert **uniquement** à exécuter une action sur une machine où quelqu’un
travaille : ouvrir *ton* VS Code, lancer Netflix sur *cet* écran, ouvrir YouTube
sur *sa* tablette. Rien d’autre ne le justifie.

| Machine | Agent | Pourquoi |
|---------|-------|----------|
| Desktop Windows | ✅ phase 2 | Apps, fichiers, écran |
| Portable Windows | ✅ phase 2 | Même binaire, même code |
| Tablettes Android (filles) | ✅ phase 2 | Lancer YouTube |
| **VPS** | ❌ jamais | Aucune session utilisateur. Ollama en HTTP, le reste en systemd |
| **NUC** | ❌ jamais | Le Core *est* dessus — il n’a pas besoin d’un agent pour se parler |
| **ProLiant Windows** | ❌ jamais | Serveur. Plex par son API, stockage par SMB. Rien à « lancer » |
| **Tablette murale** | ❌ jamais | C’est un HUD, pas une cible d’action (§3.6) |

**Deux bases de code, pas quatre.** L’agent Linux du cahier §13.3 ne sert à
rien ici : les machines Linux du foyer font tourner le Core ou des services.

Contraintes connues avant d’écrire la moindre ligne :

- **Windows** : l’agent tourne **dans la session utilisateur** (démarrage à
  l’ouverture de session, icône de notification), **jamais** en service SYSTEM
  — l’isolation de session 0 empêche un service d’ouvrir une app sur l’écran.
- **Android** : *foreground service* + notification permanente + exclusion de
  l’optimisation de batterie, sinon le système tue l’agent en quelques minutes.
- **Connexion sortante** vers le Core, toujours. C’est ce qui rend « à la
  maison » et « à l’extérieur » identiques, sans mode distant à écrire.
- **Jamais d’adressage par IP LAN** : uniquement par identifiant d’entité. Une
  IP casse dès qu’on sort.
- Le protocole (contrat WS) se fige **avant** le premier agent, sinon Windows
  et Android parleront deux dialectes.

### 3.6 Tablette murale — HUD maison

Panneau mural Android : état de l’écosystème en un coup d’œil, orbe, tactile
**et** vocal — l’équivalent d’un tableau de bord HA, mais avec JARVIS dedans.

**Aucun agent, aucun APK.** C’est la **PWA en mode kiosque** (Fully Kiosk
Browser ou équivalent). Alimentée en USB au mur, écran réveillé au mouvement.

La seule vraie conséquence est côté HUD : il lui faut un **profil de mise en
page « panneau mural »** — cibles tactiles larges, lisible à trois mètres, pas
de clavier, veille et réveil gérés. Même base de code React, autre disposition.
À prévoir dans le HUD plutôt qu’à replaquer après coup.

---

## 4. Tunnel NUC → VPS

WireGuard / Tailscale (recommandé) ou SSH `-R` / frp.  
`https://jarvis…` → HUD · `wss://jarvis…/ws` → Core.  
LAN : accès direct NUC si tunnel / Internet tombe.

---

## 5. Matrice LLM / voix / données

| Besoin | Backend | Où |
|--------|---------|-----|
| Chat / Hermes courant | **Ollama** | **VPS** |
| 2ᵉ IA / agents lourds | **OpenRouter** | Clés **NUC** |
| Secours | Mode système | Core (sans LLM) |
| STT maison | Faster-Whisper + wake | **NUC** |
| TTS maison | Piper / voicebox | **NUC** |
| TTS extérieur (+ cache phrases) | **ElevenLabs** | Clé NUC, lecture client |
| Users / Dashboard / config | **PostgreSQL** + SQLAlchemy/Alembic | **NUC** |
| Médias | Plex | **ProLiant Windows** |

Ordre Provider :

```
Ollama VPS → OpenRouter → mode système
```

---

## 6. Ordre d’installation (prod)

### Phase A — NUC cerveau

1. [ ] Ubuntu NUC · caméra + micro OK
2. [ ] Arbre `/opt/jarvis` · sync monorepo
3. [ ] **PostgreSQL** + `JARVIS_DATABASE_URL` · `cd core && alembic upgrade head` (SQLAlchemy + Alembic)
4. [ ] **JARVIS Core** + `.env` : OpenRouter + ElevenLabs + DSN + URL Ollama VPS
5. [ ] Holomat `fetch_models` · enroll visage LAN
6. [ ] **Hermes** + **seed** `deploy/hermes/` (**avant** 1er chat produit)
7. [ ] Whisper + wake + Piper **ou** voicebox
8. [ ] Test : wake → Hermes → réponse voix (LAN)

### Phase B — Maison

9. [ ] **Home Assistant** sur NUC · token long-lived
10. [ ] Hermes : configure HA, **scan écosystème**, propose périphériques (Policy + appairage)
11. [ ] Pi salon satellite Zigbee si besoin
12. [ ] ProLiant Windows : Plex + lib · token API · **pas de SSH**
13. [ ] Brancher agent-plex / agent-HA · tests « film » / « lumière »

### Phase C — VPS + extérieur

14. [ ] Ollama VPS + modèle (tool-calling pour Hermes)
15. [ ] Build HUD/Dash · TLS · tunnel · WSS
16. [ ] Whisper PTT sur VPS · ElevenLabs pour clients externes
17. [ ] Test tél / portable : HTTPS, **autoriser micro + caméra**, auth, orbe, commande maison via tunnel

### Phase D — Durcissement

18. [ ] Secrets `/etc/jarvis/` · units systemd par fonction
19. [ ] Backups Postgres + config HA + profils · NAS ProLiant
20. [ ] Plan charge NUC (Whisper↓ puis vision↓)

### Phase E — Tablette murale (aucun code à écrire)

21. [ ] Tablette Android fixée + alimentation USB permanente
22. [ ] Kiosque (Fully Kiosk ou équivalent) → URL du HUD · réveil au mouvement
23. [ ] Jumeler la tablette comme **entité** avec son propre profil (§3.6)
24. [ ] Profil de mise en page « panneau mural » côté HUD

### Phase F — Agents d’appareil (§3.5)

25. [ ] **Figer le contrat WS** avant d’écrire le moindre agent
26. [ ] Agent factice (≈100 lignes) → valider routage, ciblage, permissions
27. [ ] Agent Windows réel — **une seule** capacité : `app.launch`
28. [ ] Autres capacités, une par une
29. [ ] Agent Android en dernier

> Piège classique : commencer par l’agent Windows. On mélange alors le
> protocole et les spécificités Windows, et l’agent Android oblige à tout
> reprendre. L’agent factice d’abord.

---

## 7. Installation — notes

### 7.1 Core / secrets (NUC)

```bash
# /etc/jarvis/core.env (exemple)
OPENROUTER_API_KEY=...
ELEVENLABS_API_KEY=...
JARVIS_REMOTE_LLM_URL=http://IP_VPS:11434   # Ollama VPS = LLM #1
JARVIS_DATABASE_URL=postgresql+psycopg://jarvis:...@127.0.0.1:5432/jarvis
JARVIS_HERMES_URL=http://127.0.0.1:8642
# Plex : token (pas SSH ProLiant)
# HA : token long-lived

# Puis : cd /opt/jarvis/core && .venv/bin/alembic upgrade head
```

### 7.2 Hermes

```bash
# vendor/agents/hermes-agent/ + seed obligatoire :
bash deploy/scripts/seed-hermes-consciousness.sh --force-soul
# Providers : Ollama VPS → OpenRouter
# Skills HA : config + discovery écosystème (appairage obligatoire)
```

### 7.3 Voix NUC

Wake + Faster-Whisper (`tiny`/`base`) + Piper **ou** voicebox (`JARVIS_VOICEBOX_URL`).

### 7.4 VPS

Ollama + reverse HTTPS/WSS + Whisper PTT. Pas de Core.

### 7.5 ProLiant Windows

Installer **Plex** + bibliothèque. Exposer API Plex au NUC (réseau). **Ne pas** installer OpenSSH « pour JARVIS », **ne pas** installer Ollama.

### 7.6 HA + Hermes

HA sur NUC (Docker/VM isolé). Hermes : token → configure intégrations, scanne, **propose** ajouts ; l’utilisateur **valide** (Policy). Discovery ≠ droits.

---

## 8. Séparation des couches

| Couche | Fait | Ne fait pas |
|--------|------|-------------|
| HUD web | UI, WS, micro/caméra navigateur, joue audio | Pas de LLM, pas de clés, pas de root |
| Core NUC | Auth, Postgres, policy, Holomat, providers | Pas d’UI lourde |
| Hermes NUC | Raisonne, HA/Plex tools, seed SOUL | Pas d’admin direct root |
| VPS | TLS, Ollama #1, WSS, STT dehors | Pas de biométrie maison |
| ProLiant | Plex + fichiers | Pas de SSH agent, pas de LLM |
| OpenRouter / ElevenLabs | 2ᵉ IA · TTS dehors / cache | Pas d’accès IoT direct |

---

## 9. Comptes / API à activer (prod)

| Compte / service | Obligatoire |
|------------------|-------------|
| **Ollama sur VPS** | Oui (LLM #1) |
| **OpenRouter** | Oui (2ᵉ IA / agents) |
| **ElevenLabs** | Oui (extérieur + cache) |
| **PostgreSQL** (NUC) | Oui |
| **Hermes** + seed | Oui dès le 1er chat |
| **HA** + token | Oui (Phase B, même cycle foyer) |
| **Plex** token (ProLiant) | Oui pour médias |
| Compte SaaS « Hermes » | Non |
| Agent Windows / Android | Non (web only) |
| SSH ProLiant | Non |

---

## 10. État monorepo (honnête)

| Élément | État |
|---------|------|
| Core Auth aujourd’hui | **SQLAlchemy + Alembic** — Postgres via `JARVIS_DATABASE_URL`, SQLite fallback |
| Providers | OpenRouter + Ollama remote — aligner priorité = **VPS puis OpenRouter** |
| Hermes + `deploy/hermes/` | Seed prêt · brancher HA discovery |
| Tunnel + Caddy | À poser (Phase C) |
| Whisper / Piper units | À installer sur NUC |

---

## 11. Liens

- [`deploy/README.md`](../deploy/README.md)
- [`deploy/NUC_TREE.md`](../deploy/NUC_TREE.md)
- [`deploy/hermes/`](../deploy/hermes/)
- [`core/README.md`](../core/README.md)
- Cahier : §10 Auth/DB · §11 Provider · §13 Hermes · §14 hors domicile
