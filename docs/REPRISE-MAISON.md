# Reprise — de retour à la maison

> Écrit le 2026-08-05 en fin de session, depuis le **bureau** (donc en WAN).
> À relire en arrivant chez toi, PC allumé, **sur le LAN**.
>
> Ce document ne remplace pas [`REPRISE-2026-08-06.md`](REPRISE-2026-08-06.md) :
> il couvre seulement le chantier « maison » ouvert aujourd'hui.

---

## 1. ⚠ Premier réflexe : tu es en LAN, plus en WAN

Toutes les commandes de la session ont été passées par le WAN. **En rentrant,
change d'alias** — le WAN fonctionne toujours, mais il passe par Internet pour
rien, et il est plus lent.

| Machine | Au bureau (WAN) | À la maison (LAN) |
|---|---|---|
| **Pi / Home Assistant** | `ssh jarvis-pi-wan` | `ssh jarvis-pi` |
| **NUC** | `ssh -p 41222 -i ~/.ssh/jarvis_nuc_ed25519 root@82.66.254.106` | `ssh jarvis-nuc` |
| **VPS** | `ssh hostinger` | inchangé |

**Home Assistant** : plus besoin de tunnel. Ouvre directement
**`http://192.168.1.27:8123`**.

**Tunnels à fermer / rouvrir.** Il en reste peut-être un vers HA sur ton port
8123 local. Vérifie et coupe :

```powershell
Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" | ForEach-Object { $_.CommandLine }
```

Le seul tunnel encore utile en LAN est celui vers **Hermes** (`:8642`), qui
n'écoute qu'en loopback sur le NUC :

```bash
ssh -N -L 8642:127.0.0.1:8642 jarvis-nuc
```

---

## 2. Ce qui a été fait aujourd'hui

### Home Assistant — installé et vivant

- **HA Container 2026.7.4** sur le Pi (`jarvis-salon`, `192.168.1.27`).
  `/opt/homeassistant/compose.yaml`, `network_mode: host`, redémarrage auto.
- Le Pi 3B n'a que 905 Mo : un **swapfile disque de 1 Go en priorité 10** a été
  ajouté (le zram existant comprime la RAM, il n'en crée pas).
- **Jeton longue durée** posé sur le NUC dans `/etc/jarvis/hermes.env` (chmod 600,
  hors dépôt). Le NUC atteint HA en **15 ms** — même LAN, aucun tunnel requis.

### Tableau de bord personnalisé

Trois vues — **Maison**, **JARVIS**, **Famille** — construites sur **15 capteurs
de présence** couvrant tes 17 appareils. Versionné dans `deploy/homeassistant/` :

```
configuration.yaml              packages + dashboard YAML
packages/jarvis_reseau.yaml     les 15 sondes
dashboards/jarvis.yaml          les trois vues
```

En **mode YAML** : l'interface ne peut pas l'écraser, et il survit à la carte SD.

### Le pont Core → Hermes

- `core/jarvis_core/capabilities.py` — la table `intention → propriétaire ·
  toolset · risque · déclencheurs`. 28 capacités.
- `core/jarvis_core/hermes.py` — la seule porte vers l'agent. Exige une décision
  Policy, filtre les toolsets par rôle, refuse un toolset éteint.
- `IntentExecutor` était **vide** depuis P2 : il porte maintenant 24 intentions.
- Tunnel **NUC → VPS** pour Ollama, en service systemd
  (`deploy/systemd/jarvis-tunnel-ollama.service`), clé dédiée restreinte au seul
  port 11435.

### La domotique repasse au Core — correction majeure

La première version déléguait `home.control` à Hermes : **475 secondes** pour
allumer une lampe, et des résultats inventés. Deux textes l'interdisaient déjà
(`JARVIS-Satellites.md` : « Core → Home Assistant Adapter → HA API » ; cahier des
charges §11 : « Mode 3, sans LLM : le Core continue »).

`core/jarvis_core/homeassistant.py` — adaptateur déterministe. **207 ms
d'inventaire, 0-10 ms par commande.** Aucun LLM, aucun GPU nécessaire.

### Les waves sont branchées

Le cache contient **1869 WAV**, dont 733 clips sur 304 événements. Tous les
événements domotiques existent (`light_on` ×7, `device_unreachable` ×10,
`house_unreachable`, `not_understood`…). Ils n'étaient **jamais déclenchés** —
c'est fait, dans `_say_home`.

### Deux bugs trouvés en testant

1. **`match_intent` ratait « lumiere ».** Le déclencheur était « lumières » —
   pluriel et accentué. Une transcription vocale sans accent tombait dans la
   conversation, en silence. Corrigé : repli d'accents + formes « lumière » et
   « lampe », des deux côtés (le garde-fou anti-dérive l'exige).
2. **Le ProLiant paraissait éteint.** Windows bloque l'ICMP : il sert Plex depuis
   le début sur `192.168.1.44:32400`. La sonde teste maintenant le **port**.

### Le player Free est pilotable

ADB autorisé sur `192.168.1.49:5555` (Android 10). Netflix lancé, titre visé par
lien profond, et **l'état de lecture est lisible** (`dumpsys media_session`) — ce
qui manquait à DIAL, qui disait « running » sur un écran de profil.

---

## 3. Ce qu'on attaque dès que tu es chez toi

Dans cet ordre — les trois premiers ne prennent que quelques minutes chacun.

### a. Apple TV de la chambre — deux PIN

`AppleTV6,2` (Apple TV 4K, tvOS 26.5) en `192.168.1.172`, sur la **2ᵉ entrée
HDMI de la Bravia**. Le flux d'appairage a été testé et fonctionne ; il demande
**deux codes successifs** : *AirPlay* puis *Companion*.

Sois devant la TV de la chambre, je relance et tu me dictes les codes.

Gain : allumage et pilotage de l'Apple TV, **et** commutation de la Bravia par
CEC — ce que tu avais suggéré. C'est ce qui permettra à JARVIS de faire venir la
TV sur son écran avant de parler.

### b. Anynet+ sur la Samsung

*Menu → Général → Gestionnaire de périphériques externes → **Anynet+ (HDMI-CEC)***.

Sans ça le CEC reste à moitié muet : le bus répond, la TV s'identifie, mais elle
n'acquitte pas les changements de source. Le Pi a du CEC natif (`/dev/cec0`, déjà
exposé au conteneur HA) — il ne manque que cet interrupteur.

### c. Deux réponses qu'il me faut

- **Sur quelle prise HDMI est le NUC** (au dos de la Bravia) ? Nécessaire pour
  que « Jarvis, affiche le HUD » bascule au bon endroit.
- **Profil Netflix** : choisis celui de tes filles une fois avec la télécommande,
  je relance le lien profond `80243216` (*Super détectives !*) et on vérifie
  qu'il tombe direct sur la série.

### d. Bravia — PIN à l'écran

Intégration `braviatv` sur `192.168.1.79`. Pense à activer *Réseau → Démarrage à
distance*, sinon tu pourras l'éteindre mais jamais l'allumer.

### e. Le lave-linge

`samsung-washer` en `192.168.1.119`. Il n'ouvre **aucun port** : il ne parle
qu'au cloud. Il faut l'intégration **SmartThings** et tes identifiants Samsung.

---

## 4. La topologie, corrigée

Je m'étais trompé de pièce en cours de session. La bonne version :

| Pièce | Entend | Parle | Voit |
|---|---|---|---|
| **Chambre** — NUC + Bravia + caméra LG | ✅ micro de la caméra | ✅ HDMI vers la Bravia | ✅ caméra LG |
| **Salon** — Pi + Samsung | ❌ **aucun micro** | ✅ HDMI vers la Samsung | ❌ |

Le JARVIS complet est **dans la chambre**. Le salon parle mais n'entend pas.

**Deux achats à prévoir** : un **micro USB pour le Pi** (~15 €) qui rendrait le
salon symétrique, et le **dongle Zigbee** le jour où tu voudras des lampes.

**Réserve qui tient toujours** : même dans la chambre, le NUC ne s'entend que si
la Bravia est sur son entrée. C'est exactement ce que le point (a) doit résoudre.

---

## 5. Ce que je peux faire sans toi

- **Réparer le Cast IPv6.** `pychromecast` tente le Freebox Player en IPv6 et
  échoue — c'est pourquoi `media_player.freebox_player_pop` est `unavailable`
  alors qu'il répond parfaitement en IPv4.
- **Câbler `media.video` comme capacité du Core.** L'ADB marche, les waves
  `media_launched` existent, il ne manque que le fil. Propriétaire CORE, sans LLM,
  même traitement que la domotique.

---

## 6. État de vérification, en sortant

| | |
|---|---|
| `_smoke_capabilities` | OK — 36 contrôles |
| `_smoke_p2` · `_smoke_p3` | OK — aucune régression |
| `Orchestrator().intents` | 24 intentions |
| `npm run typecheck` (HUD) | **0 erreur** — le typecheck n'existait pas avant aujourd'hui |
| `python architecture/build.py --check` | 7 contrats ✓ |

Seul écart signalé, **antérieur et sans rapport** : le HUD écoute
`FACE_OBSTRUCTION`, que le Core n'émet jamais.

---

## 7. Ce qui reste ouvert, franchement

- **Hermes met 8 minutes** à raisonner sur le VPS (3,4 tokens/s, pas de GPU). Sans
  conséquence pour la maison — elle ne passe plus par lui — mais bloquant pour
  tout ce qui demande un vrai jugement.
- **Le toolset d'Hermes a dû être réduit** à `homeassistant · memory · todo` :
  au-delà d'une dizaine d'outils, llama3.1:8b décrit l'appel au lieu de l'émettre.
  Les autres capacités déléguées sont donc refusées — proprement, avec leur
  raison, mais refusées.
- **Aucun appareil pilotable dans HA** tant que (a), (d) et (e) ne sont pas faits.
  Les 15 capteurs disent qui est présent, pas comment l'allumer.
