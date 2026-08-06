# JARVIS — Résilience & accès de secours

Document opérationnel. Il répond à une seule question : **JARVIS ne répond
plus, comment j'entre pour réparer ?**

---

## Le principe

> **Le Dashboard ne dépend jamais de Hermes. C'est l'inverse : le Dashboard
> pilote Hermes.**
>
> Le Core reste l'autorité de contrôle et ne peut pas être bloqué par la panne
> d'un composant qu'il supervise.

Corollaire, valable à chaque étage :

> **Chaque niveau fonctionne sans aucun niveau au-dessus de lui.**

Un chemin de secours qui a besoin de la caméra, du micro ou de Hermes n'est
pas un chemin de secours : c'est une deuxième façon de tomber en panne.

---

## Hiérarchie

```
Niveau  4   Satellites          téléphone · tablette · Apple TV · Freebox
Niveau  3   HUD                 interface graphique — purement cosmétique
Niveau  2   Hermes Agent        outils, skills, actions
Niveau  1   Dashboard Admin     auth normale, tout pilotable
Niveau  0   Dashboard Recovery   Ctrl+Alt+R · PIN · incassable
Niveau -1   Console Linux        systemd · SSH · TTY
Niveau -2   BIOS / UEFI          clé USB · accès physique
```

Chaque niveau survit à la mort de tous ceux au-dessus. Un satellite qui tombe
n'emporte rien. Un HUD figé laisse le Dashboard, Hermes et le Core debout.

---

## ⚠ Un conflit à trancher avant d'implémenter

Le cahier §3.3 pose : **« Dashboard React — module admin du HUD (pas une app
séparée) »**.

C'est **incompatible** avec le principe ci-dessus. Si le Dashboard vit dans le
HUD, alors HUD mort = Dashboard mort, et le niveau 0 disparaît avec le niveau 3.

Il faut choisir :

| Option | Conséquence |
|--------|-------------|
| **Dashboard servi indépendamment** (`jarvis-dashboard.service`) | Le niveau 0 tient. Recommandé |
| Dashboard = module du HUD | Le niveau 0 doit être une **page séparée**, servie par le Core |

Dans les deux cas, **le mode Recovery ne peut pas être du React embarqué dans
le HUD** : un bundle planté ne peut pas se réparer lui-même.

---

## Niveau 0 — Dashboard Recovery

Le dernier recours *logiciel*. Déclenché par **`Ctrl+Alt+R`**, ou joignable
directement depuis un autre poste du LAN.

Ce mode :

- désactive toutes les animations et hologrammes
- désactive le verrouillage vocal (`pointer-events` réactivés)
- réactive tous les boutons
- affiche les erreurs brutes des services
- permet de redémarrer chaque module **individuellement**

### Ce qu'il affiche

```
🟢 Core API          🔴 Hermes Agent      🟢 PostgreSQL
🔴 voicebox          🟢 Ollama VPS        🔴 Caméra
🔴 Micro             🟢 MQTT              🟢 Home Assistant
```

Un bouton **Restart** par ligne, et les **URLs directes** des outils (niveau 3
ci-dessous) affichées en clair — pour pouvoir les recopier si même cette page
tombe.

### Entrée par code PIN

```
PIN saisi
   → vérifié CÔTÉ CORE contre users.pin_hash     (jamais en dur dans le front)
   → OUVRE une session admin  method="recovery_pin"
   → aucune caméra, aucun micro, aucun Hermes dans ce chemin
```

**Ce qui ne va pas aujourd'hui** : `elevate_admin()` exige une session HUD
déjà ouverte, et cette session vient de la reconnaissance faciale. Le code PIN
existe côté front (`tryCode`) mais retombe sur la même condition — **caméra
morte = PIN refusé quoi qu'on tape**. Le chemin de secours dépend
précisément de ce qui est cassé.

Trois garde-fous, non négociables :

- **Annoncé à voix haute** — « Mode administrateur activé » (déjà en cache).
  Une entrée en secours ne doit jamais être discrète.
- **Expirée** après ~15 min d'inactivité. Une session de secours oubliée est
  une porte ouverte.
- **Tracée** dans `auth_audit`, avec verrouillage après N tentatives.

> À corriger avant tout invité : les codes admin sont **en dur dans le bundle
> JavaScript** (`421337`, `0000`, `admin`). Lisibles en dix secondes dans les
> outils de développement.

---

## Niveau -1 — Console Linux (break glass)

Fonctionne même si Dashboard, HUD, Hermes, React, Caddy, API et Ollama sont
tous morts. Il ne reste que Ubuntu, systemd, SSH et la console locale.

**Tout composant important doit être un service systemd.** État actuel :

| Service | Existe ? |
|---------|----------|
| `jarvis-core.service` | ✅ `Restart=on-failure` + `WatchdogSec=30` |
| `jarvis-hud.service` | ✅ |
| `jarvis-voicebox.service` | ✅ `Wants` et non `Requires` — sa mort n'emporte pas JARVIS |
| `jarvis.target` | ✅ regroupe core / hud / voicebox / hermes |
| `jarvis-hermes.service` | ✅ alias `hermes-agent.service` — `Wants`, pas `Requires` |
| `jarvis-dashboard.service` | ❌ manquant (cf. conflit §3.3) |
| `postgresql`, `mosquitto`, `home-assistant` | fournis par leurs paquets |

> Pas de `whisper.service` ni `piper.service` : **voicebox les embarque tous
> les deux**. Un seul conteneur, un seul service.

```bash
systemctl status jarvis-core
systemctl restart hermes-agent          # alias de jarvis-hermes
systemctl restart jarvis-hermes         # même unité
systemctl restart jarvis.target         # toute la pile

journalctl -u jarvis-hermes -n 100 --no-pager
journalctl -u jarvis-core -n 100 --no-pager
df -h                                   # cause n°1 des pannes mystérieuses
```

**Garder un getty actif sur `tty2`.** La tentation en kiosque est de tout
désactiver : c'est la seule porte quand le réseau est tombé *et* que X ne
démarre plus. SSH ne sert à rien sans réseau.

---

## Niveau -2 — BIOS / UEFI

SSD défaillant, système de fichiers corrompu, panne matérielle. Écran,
clavier, clé USB de secours. Rien de logiciel ne peut préparer ce niveau,
sinon **avoir les sauvegardes ailleurs** — Postgres, config HA, profils du
foyer, sur le NAS du ProLiant.

---

## Watchdog — ne pas réinventer systemd

Le Core embarque déjà `supervisor.py`, et sa docstring pose la bonne règle :

> *« Il signale, il ne redémarre pas. systemd redémarre. »*

**C'est juste, et il faut s'y tenir.** Un Guardian maison qui relancerait des
services ferait doublon avec `Restart=on-failure`, et deux superviseurs qui
redémarrent le même service en même temps produisent des boucles vicieuses.

Ce que systemd sait déjà faire, gratuitement :

| Besoin | Mécanisme natif |
|--------|-----------------|
| Redémarrage auto | `Restart=on-failure` · `RestartSec=` |
| Service **figé** (répond plus sans crasher) | `Type=notify` + `WatchdogSec=` — déjà en place sur le Core |
| « 3 crashs → on arrête » | `StartLimitBurst=3` · `StartLimitIntervalSec=` |
| « à l'échec, lancer autre chose » | `OnFailure=jarvis-safe-mode.target` |
| Ordre et dépendances | `Wants=` (souple) · `Requires=` (strict) |

### Ce qu'un Guardian apporterait en plus

Uniquement ce que systemd **ne peut pas exprimer** :

- un service qui répond `200 OK` mais renvoie n'importe quoi
- une logique **inter-services** (« Hermes est vivant mais l'API Ollama qu'il
  utilise ne répond plus »)
- une notification vers le téléphone

Autrement dit : le rôle actuel de `supervisor.py`. **Il existe déjà.** Il lui
manque la sonde `hermes-agent` et la notification.

---

## Safe Mode

Déclenché après N échecs de Hermes — et là encore, `StartLimitBurst=3` +
`OnFailure=` le fait nativement.

Le Dashboard démarre **sans** HUD, micro, caméra, hologrammes ni IA. Il ne
reste que : configuration, journaux, redémarrage, mise à jour, rollback,
console.

C'est le niveau 0 forcé automatiquement au lieu d'être demandé à la main.

---

## `jarvis-rescue` — script de secours

Une commande unique à taper en console (niveau -1) :

1. Vérifier tous les services et afficher leur état
2. Redémarrer ceux qui sont arrêtés
3. Réparer les permissions de `/opt/jarvis`, `/etc/jarvis`, `/storage/jarvis`
4. Nettoyer les fichiers temporaires · vérifier l'espace disque
5. Relancer le Dashboard
6. Afficher un rapport de diagnostic

---

## Scénarios de panne

### Caméra HS

*Débranchée, accaparée par une autre application, pilote planté.*

Marchent encore : wake word, STT, TTS, Hermes, domotique.
Tombe : l'identification, donc la session.

```
« hey jarvis »
   → orbe : wake, puis listening         (le micro va bien)
   → échec caméra
   → « Je ne parviens pas à activer la caméra. »      [camera_failed]
   → bascule en profil ANONYME
```

Profil anonyme = **vouvoiement, permissions publiques uniquement**. Pas de
domotique sensible, pas de portes, pas de Dashboard. JARVIS reste utile mais
ne fait rien d'engageant. Perdre l'identité doit **réduire** les droits,
jamais les ouvrir.

**Entrée** : `Ctrl+Alt+R` → PIN. Aucune caméra dans ce chemin.

### Micro HS

Tombe : le wake word — donc **la porte d'entrée unique**. C'est le prix de la
décision « pas de click-to-talk » : sans micro, JARVIS est injoignable à la
voix, et il n'existe aucun bouton de repli.

```
au démarrage : le détecteur ne s'ouvre pas
   → « Aucun microphone détecté. »                     [mic_failed]
   → orbe : micro coupé, VISIBLE EN PERMANENCE
```

L'indicateur reste affiché en continu, pas seulement quand on essaie de
parler. Une orbe d'apparence normale alors que le micro est mort est le pire
des mensonges.

**Entrée** : `Ctrl+Alt+R` → PIN. Le clavier est la seule porte restante.

### voicebox HS

Cas **différent** du micro : le micro va bien, le wake word fonctionne.

```
« hey jarvis »
   → wake ✓          (détection LOCALE, indépendante de voicebox)
   → son de réveil ✓
   → accusé depuis le CACHE ✓          « Oui Samir ? »
   → puis STT indisponible
   → « Le service demandé est indisponible. »          [service_unavailable]
```

**Le réveil et l'accusé continuent de marcher.** C'est le retour sur
investissement des 589 clips : JARVIS garde sa voix quand son moteur vocal
est mort.

### HUD figé

`Ctrl+Alt+R` **ne sert à rien** : c'est du code React, mort avec le reste. Un
bundle planté ne peut pas se réparer lui-même.

**Entrée** : niveau 0 servi ailleurs que par le HUD, depuis le portable.

### Core mort

Plus de HUD, plus de Dashboard, plus de recovery web. Mais **la maison
continue** : HA sur le Pi, Plex sur le ProLiant, les lampes répondent à leurs
interrupteurs.

**Entrée — niveau 3, les outils en direct :**

| Outil | URL |
|-------|-----|
| Home Assistant | `http://<pi>:8123` |
| Portainer | `https://<nuc>:9443` |
| Plex | `http://<proliant>:32400/web` |
| voicebox | `http://<nuc>:17600` |

Ces URLs doivent vivre dans un **registre hors JARVIS** — lisible par le
Dashboard *et* à la main. Si la liste des outils n'existe que dans Hermes, un
Hermes mort te prive de savoir ce qui tourne et où.

---

## JARVIS annonce toujours sa panne

Toutes les phrases de panne sont **en cache** (`core/dialogues/diagnostic.yaml`).
Délibéré : une annonce de panne qui dépend du cloud est une annonce qui ne
sort pas. Si le réseau est mort, JARVIS doit quand même pouvoir le dire.

**Ne jamais laisser une orbe figée sans un mot.** Un utilisateur devant un
écran muet croit que tout est cassé et redémarre la machine — souvent en
aggravant le problème.

---

## Tableau de décision

| Symptôme | Entrée | Niveau |
|----------|--------|--------|
| JARVIS n'identifie personne | `Ctrl+Alt+R` + PIN | 0 |
| JARVIS ne réagit pas à son nom | `Ctrl+Alt+R` + PIN | 0 |
| JARVIS entend mais ne comprend pas | `Ctrl+Alt+R` + PIN | 0 |
| Écran blanc / HUD figé | Dashboard Recovery depuis le portable | 0 |
| Rien ne répond en web | URLs directes des outils | 3 |
| La machine ne démarre pas | clavier + `tty2` · `jarvis-rescue` | -1 |
| Le disque ne monte plus | clé USB de secours | -2 |

---

## Ce qui manque pour que ce document soit vrai

- [ ] **Trancher le conflit §3.3** — Dashboard indépendant du HUD, ou page Recovery séparée
- [ ] `elevate_admin(method="recovery_pin")` — ouvrir une session sans caméra
- [ ] Page Recovery servie hors du HUD
- [x] `jarvis-hermes.service` — alias `hermes-agent` (`deploy/systemd/jarvis-hermes.service`)
- [ ] `OnFailure=` Hermes → Safe Mode natif (StartLimitBurst déjà sur l’unité)
- [ ] Sonde `hermes-agent` dans `supervisor.py` + notification téléphone
- [ ] Registre d'outils avec URLs directes, lisible hors JARVIS
- [ ] Script `jarvis-rescue`
- [ ] Retirer les codes admin en dur du bundle HUD
- [ ] Vérifier qu'un getty tourne sur `tty2`
