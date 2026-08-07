# Changelog — jalons de session

> Jalons **projet / session**, pas le détail git. Pour l'historique git : `git log`.

---

## 2026-08-07 — Satellite salon (Pi) + Freebox + wake

Runtime aligné local ↔ NUC ↔ Pi (hashes). Commit deploy + Core salon.

- **Pi** `deploy/pi-salon/` : `jarvis-ear` (:8767 bouche + wake `hey_jarvis` + ADB player), `jarvis-cam` (:8768 MJPEG)
- **Core** : `salon_speaker` / `salon_ingest` (:8766) / `salon_player` → Freebox via Pi
- **nginx** : `/v1/salon/` → ingest ; HUD kiosk NUC **off**
- Freebox : TV Bro installé ; VLC / Netflix / YouTube / Disney / Plex
- Accès hors maison : NUC WAN OK ; Pi via `jarvis-pi-via-nuc` si `:41223` HS
- HUD : face-only lock (PIN retiré UI), gestes opt-in, allègements kiosk
- **Tool Bus Phase 2** + **Surface Decision** (preuve) : `core.monitor` / `system.cpu` → `SURFACE_SNAPSHOT` SystemMonitor (Core only, pas de modif React)
- **Device Capability Discovery Phase 0** : `DeviceRegistry` + NUC `nuc-main` + `GET /v1/devices`
- **Device 1 VALIDÉ** : UUID `pc_client`/`web_hud` dans registre (portable + iPhone) ; caps honnêtes ; stratégie figée Device 2 Pi → puis Router (pas HA cerveau, pas Hermes unique)
- **Device 2 VALIDÉ** : Pi `jarvis-device-announce` → `pi-salon` online (cam LG, audio, HA gateway, Freebox player)
- Restart NUC Core/Hermes : FaceEngine Holomat prêt ; retester auth faciale HUD

## 2026-08-06 (midi) — Auth / device / agentic honesty

- Auth HUD : face + PIN uniquement (voix MFA retirée) ; enrôlement gated PIN admin
- Device policy : mic idle ON, cam sleep, gestes opt-in par persona
- Catalogue HUD + Core `capabilities.available` : docker/storage/code/devices/network/missions → SOON / indisponible
- Déployé NUC : HUD `index-DqbE4fNX.js`, dashboard dist, `capabilities.py` ; Core active

## 2026-08-06

### Accès réseau — décision
- **Twingate écarté** : un client + un compte par appareil, coût multiplié par
  habitant. Remplacé par LAN direct (foyer, rien à installer) + WireGuard
  (Samir seul). Contrat : `architecture/JARVIS-Acces-Reseau.md`
- Mesures : 86 ms par aller-retour, dont **2 ms de Core** — tout le reste est
  du trajet. Rien à optimiser dans le code
- Préparé, **non activé** : `deploy/nginx/jarvis-lan.conf`,
  `setup-lan-tls.sh` (DNS-01 Cloudflare), `check-dns-rebinding.sh`,
  `setup-wireguard.sh`, `wg-add-peer.sh`
- Risque identifié qui commande la conception : un nom résolu **uniquement**
  par le DNS public rend le HUD injoignable *dans* la maison si le WAN tombe

### Enrôlement
- Cause du décalage narration/écran trouvée : cinq étapes attendent des
  signaux, **120 s** de délai cumulé possible
- Relances d'attente branchées sur les cinq étapes, avec des événements
  **déjà en cache** — audible sans régénération facturée
- ⚠ Diagnostic intermédiaire **erroné puis corrigé** : les trois signaux
  `enroll.voice` / `face.landmarks` / `face.model` ont bien des émetteurs
  (`__init__.py:2048`, `:1934`, `:1936`/`:1970`). Rien à câbler

### Cause racine unique du 06/08
- Checks rouges, enrôlement inerte et fausse alerte HDMI remontent tous à
  **caméra + micro non autorisés** sur la nouvelle origine. Changer d'origine
  remet les permissions à zéro

### Périphériques
- Fausse alerte « Vérifiez le raccordement HDMI » corrigée : la sonde lisait
  une absence de **permission** comme une absence de **matériel** — elle dit
  maintenant d'autoriser le micro, ce qui pointe la vraie cause

---

## 2026-08-05

### Infra
- Clé SSH dédiée Pi salon : `jarvis_pi_salon_ed25519`, alias `jarvis-pi-wan` (port 41223)
- Port forwarding Pi vérifié ; auth par clé opérationnelle

### Mémoire Claude
- Création structure `docs/claude/`, `JARVIS_CONTEXT.md`, `DECISIONS.md`, `TODO.md`, `ARCHITECTURE.md`

### État technique (non commité)
- P2 clos : `surface.py` + `IntentExecutor` + smokes
- P3 Core prouvé : `composer.py` + smokes + test OpenRouter
- Boot HUD, gestes MediaPipe, Hermes deploy scripts
- `usage.py` async (fix blocage asyncio)

---

## 2026-08-04 — 2026-08-05 (commits)

- Auth : Core ne fait plus confiance au HUD ; voix retirée comme facteur
- Voix : transcription branchée ; séquences auth/enrollment parlées
- Orbe : trame intérieure visible
- Mission Control DEV : modules nommés ; « créer un projet » fonctionnel
- Architecture : index généré avec garde-fou dérive contrats
- Déploiement : HUD servi ; plan de ports fixé

---

## 2026-08-03 — 2026-08-04

- Contrat Agentic UI validé (`JARVIS-Agentic-UI.md`)
- Vision plateforme consignée (`JARVIS-Core-Plateforme.md`)
