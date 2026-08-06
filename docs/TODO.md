# TODO — JARVIS OS

> Priorités courantes. État détaillé → [`claude/JARVIS_SESSION_STATE.md`](claude/JARVIS_SESSION_STATE.md).

---

## Priorité immédiate

- [ ] **Hard refresh HUD** `https://jarvis.global-it-ss.com/?boot=0` (bundle `index-DqbE4fNX.js`)
- [ ] **Autoriser caméra + micro** sur cette origine (cause racine checks / enroll)
- [ ] Tester enrôlement gated : visage inconnu → PIN admin → FirstSetup add_profile
- [ ] **Bascule accès LAN** — 4 gestes Samir : `architecture/JARVIS-Acces-Reseau.md` §6
- [ ] **P3 HUD** — `compose` depuis le navigateur, surface visible
- [ ] Régénérer cache vocal `peripheral_audio_out_denied` (muet sinon)

---

## Prochaines sessions

### Session 2 — Home Assistant
- [ ] Lire [`architecture/JARVIS-Satellites.md`](architecture/JARVIS-Satellites.md)
- [ ] Brancher Pi salon (`jarvis-pi-wan`) dans l'écosystème satellite

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

- [ ] Committer le travail non commité (auth/device/agentic/dashboard)
- [ ] Vider `vendor/` des 2 dossiers restants une fois dispatchés
- [ ] Désactiver auth mot de passe SSH sur Pi WAN (clé seule)
