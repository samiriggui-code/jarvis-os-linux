# TODO — JARVIS OS

> Priorités courantes. État détaillé → [`claude/JARVIS_SESSION_STATE.md`](claude/JARVIS_SESSION_STATE.md).

---

## Priorité immédiate

- [ ] Rétablir Freebox WAN **41223** (Pi) — secours actuel `jarvis-pi-via-nuc`
- [ ] Chrome / Spotify Freebox si besoin (TV Bro OK pour le web)
- [ ] Hard refresh HUD + autoriser cam/micro sur origine HTTPS LAN
- [ ] **Bascule accès LAN** — `architecture/JARVIS-Acces-Reseau.md` §6
- [ ] **P3 HUD** — `compose` depuis le navigateur
- [ ] Zigbee / vraies commandes HA (aujourd’hui surtout monitoring)

---

## Prochaines sessions

### Session 2 — Home Assistant
- [x] Pi salon voix/cam/player (ear + cam + ADB) — runtime 2026-08-07
- [ ] Lire [`architecture/JARVIS-Satellites.md`](architecture/JARVIS-Satellites.md)
- [ ] Inventaire HA au-delà des ping LAN

### Session 3 — HUD / Agentic UI
- [ ] Câbler exécuteurs SOON (docker/storage/devices/missions/network)
- [ ] Câbler `hud/src/agentic/composer.ts` → WS `surface/compose`
- [ ] Valider `ApprovalCard` + exécution bout en bout

### Session 4 — Code ciblé
- [ ] Appel vocal → Hermes (après P3 HUD)
- [ ] Mémoire persistante en base
- [ ] Patterns Eve (approbation → exécution)

---

## Décisions ouvertes (Samir)

1. **Skills Core vs Skills Hermes** — deux notions, un nom
2. **Portée sandbox** (vision §7.3)
3. **`ROLE_PERMISSIONS`** — `child` sans `memory.read` : valider ?

---

## Dette / hygiene

- [ ] Vider `vendor/` des 2 dossiers restants une fois dispatchés
- [ ] Désactiver auth mot de passe SSH sur Pi WAN (clé seule)
