# JARVIS Satellites — contrat d'architecture

> **Un cerveau, plusieurs corps.**
> Le Core est unique et le reste. Les satellites lui apportent des sens et des
> moyens d'action. Ils ne décident jamais.
>
> Écrit le 2026-08-05. Documents liés :
> [`JARVIS-Agentic-UI.md`](JARVIS-Agentic-UI.md) (l'interface est un satellite
> parmi d'autres) et [`JARVIS-Core-Plateforme.md`](JARVIS-Core-Plateforme.md).

---

## 1. Vision

### Le problème

JARVIS est aujourd'hui pensé autour d'un HUD. Le HUD suppose un écran, une
caméra, un micro — et le Core suppose que ce matériel est **le sien**. Cette
hypothèse est fausse dès le deuxième appareil, et elle est déjà dans le code :

```python
# core/jarvis_core/__init__.py — _surface_guards()
if getattr(self, "face", None) is not None:
    context.add("camera")
```

Le Core y déclare « il y a une caméra » parce que *lui* en a une. Dans un modèle
à satellites, la caméra est sur le téléphone, à trois pièces de là, et parfois
nulle part.

### Le concept central : le Satellite

Un **satellite** est un runtime qui prête son matériel au Core. C'est la seule
notion. Il n'y a **pas** de « client mobile », de « client bureau », de « client
distant » : ces mots ne doivent apparaître nulle part dans le Core.

```
                   ┌─────────────────────────┐
                   │          CORE           │  décisions · mémoire
                   │  Policy · agents · état │  Policy · orchestration
                   └────────────┬────────────┘
                                │  un seul protocole
      ┌───────────┬─────────────┼─────────────┬───────────┐
      ▼           ▼             ▼             ▼           ▼
   téléphone   tablette     HUD mural     portable    lunettes AR
   micro       micro        écrans        webcam      caméra
   caméra      caméra       GPU           micro       IMU
   LiDAR       —            haut-parleur  —           affichage
   GPS/IMU     —            —             —           —
```

Le HUD n'est pas au-dessus des autres. **C'est un satellite**, qui se trouve
avoir un grand écran.

### Objectifs

* Un satellite se branche sans que le Core sache d'avance ce qu'il est.
* Le Core choisit **quel corps** utiliser pour chaque interaction.
* Le transport (LAN, VPN, Tailscale, WSS) ne change **aucune** API métier.
* Un satellite qui disparaît ne casse rien : le Core continue avec les autres.

### Non-objectifs

* **Pas de second cerveau.** Un satellite n'a ni Policy, ni mémoire, ni agents.
* **Pas de logique par type d'appareil** dans le Core.
* Pas de dépendance : `JARVIS BASE` doit tourner **sans aucun satellite**.

---

## 2. Principes non négociables

| # | Principe | Conséquence vérifiable |
|---|---|---|
| **S1** | **Un satellite déclare des capacités, le Core accorde des droits.** | Une capacité annoncée n'ouvre rien par elle-même. L'appairage est explicite |
| **S2** | **Les agents ne touchent jamais le matériel.** Ils demandent une capacité au Core. | Aucun agent ne connaît l'identité d'un satellite. Il demande `camera.capture`, pas « le téléphone de Samir » |
| **S3** | **Le transport n'entre pas dans le métier.** | Aucun `if remote` dans le Core. La localité est une *propriété d'état*, pas un mode |
| **S4** | **Un satellite est une entrée non fiable.** | Son inventaire est une *prétention* ; ses données sont **externes** et filtrées avant tout LLM |
| **S5** | **Aucune capacité n'est requise.** | Le Core dégrade, il ne tombe pas. Zéro satellite reste un état nominal |
| **S6** | **Une capacité indisponible est un refus tracé**, jamais un silence. | Le mode de panne de ce projet est « déclaré, jamais appelé, et rien ne le signale ». Il ne doit pas être réintroduit ici |

### S1 en détail — capacité ≠ droit

C'est la leçon déjà payée deux fois dans ce projet :

> **Un contrôle appliqué du côté contrôlé n'est pas un contrôle.**

La gravité d'une action était calculée par le HUD et crue par le Core ; n'importe
quel WebSocket pouvait la minorer (corrigé le 2026-08-05, cf. `gravity_for`).
Le même piège attend ici, en pire : un satellite qui déclare `biometric` et se
verrait accorder l'authentification renforcée aurait juste eu à le dire.

| Ce que le satellite fait | Ce que le Core fait |
|---|---|
| Déclare : « j'ai une caméra IR » | Décide si CE satellite, appairé et identifié, a le droit d'authentifier |
| Déclare : « j'ai un LiDAR » | Décide si un scan est autorisé, et sous quelle gravité |
| Fournit une mesure | La **filtre** avant de la servir à un composant ou à un agent |

Cela prolonge la règle produit existante : **Discovery ≠ droits (appairage
explicite)**.

---

## 3. Le Satellite Runtime

### 3.1 Identité

Un satellite est identifié par une **clé**, jamais par un nom qu'il choisit.

| Champ | Rôle |
|---|---|
| `satellite_id` | Empreinte de la clé publique. Stable, non choisi par le satellite |
| `label` | Nom lisible (« téléphone de Samir »). **Décoratif** — jamais utilisé pour décider |
| `paired_at` / `paired_by` | Trace d'appairage. Un satellite non appairé n'obtient que le minimum public |
| `revoked` | Révocation immédiate, côté Core. Un appareil perdu se coupe sans le toucher |

Usurper une capacité ne rapporte rien — usurper une **identité** rapporte tout.
D'où la clé.

### 3.2 Inventaire — dynamique, expirant, révocable

L'inventaire n'est **pas** déclaré une fois à la connexion. Une batterie se vide,
une permission navigateur se retire, une caméra se débranche. Il est donc
**daté** et **réémis** à chaque changement.

```jsonc
{
  "v": 1,
  "type": "SATELLITE_HELLO",
  "satellite_id": "sat_9f3a…",
  "label": "téléphone de Samir",
  "runtime": { "kind": "web", "version": "1.4.0" },

  "sensors":   ["mic", "camera", "camera.ir", "lidar", "gps", "imu"],
  "actuators": ["screen", "speaker", "vibration", "notification", "torch"],
  "compute":   { "cpu": 8, "gpu": true, "npu": false },

  "surface":   { "screens": 1, "css_px": [390, 844], "pointer": "touch" },

  "state": {
    "battery": 0.62, "charging": false,
    "bandwidth_kbps": 40000, "rtt_ms": 24,
    "orientation": "portrait", "locale": "fr-FR"
  },

  "streams": ["audio.in", "video.in"],
  "ttl_s": 60
}
```

* `sensors` / `actuators` — **ce que le matériel peut**, pas ce qu'il a le droit
  de faire.
* `surface` — remplace toute notion de « mobile » ou « desktop ». Le Core lit des
  pixels et un type de pointeur, jamais une catégorie d'appareil (**S3**).
* `state` — ce qui **change**. C'est lui qui rend l'arbitrage possible.
* `ttl_s` — sans réémission, l'inventaire **périme**. Un satellite silencieux est
  traité comme absent, jamais comme « probablement encore là ».

Le Core répond par ce qu'il **accorde** :

```jsonc
{
  "type": "SATELLITE_WELCOME",
  "satellite_id": "sat_9f3a…",
  "granted": ["mic", "camera", "screen", "speaker", "notification"],
  "denied":  { "camera.ir": "satellite non appairé", "lidar": "capacité non activée" },
  "role": "user",
  "session": "s_41c2…"
}
```

`denied` porte toujours un **motif**. Une capacité refusée en silence est
indistinguable d'une capacité inexistante — et c'est exactement le défaut que ce
projet passe son temps à corriger (**S6**).

---

## 4. Capacités — le vocabulaire

Une capacité est nommée `domaine.action`, jamais liée à un appareil.

| Classe | Exemples | Traverse le WAN ? |
|---|---|---|
| **Déclarative** | « j'ai un LiDAR » | oui — c'est du texte |
| **Action ponctuelle** | `camera.capture`, `gps.position`, `lidar.scan`, `torch.set`, `notify.push` | oui |
| **Sortie** | `voice.output`, `display.render` | oui |
| **Domotique** | `light.control`, `cover.control`, `sensor.read`, `presence.detect`, `scene.activate` | oui |
| **Flux continu** | `audio.in`, `video.in`, `pointcloud.in` | **non** — LAN seulement |

Ce tableau **n'introduit pas de mode distant** (**S3**). La faisabilité d'un flux
se déduit de `state.bandwidth_kbps` et `state.rtt_ms`, propriétés d'état comme la
batterie. Le Core n'a pas à savoir *pourquoi* le débit est bas.

### 4.1 Granularité — à trancher avant d'écrire

Deux modèles s'opposent, et le choix engage la Policy :

| Modèle | Exemple | Conséquence |
|---|---|---|
| **Verbe** | `light.turn_on`, `light.turn_off`, `cover.open` | La Policy distingue lire d'agir. Vocabulaire long |
| **Domaine** | `light.control`, `cover.control` | Court, mais `light.control` ne sait pas différencier allumer une lampe de couper le chauffage |

Position tenue ici : **verbe pour tout ce qui agit, domaine pour tout ce qui
lit.** La gravité est attachée à la capacité (comme `supportedActions` l'est au
catalogue UI) ; un nom trop large force à donner à la lecture la gravité de
l'écriture, et on retombe sur le défaut corrigé le 2026-08-05 — une action lourde
qui passe sous une gravité faible.

⚠ `presence.detect` et `sensor.read` ne sont **pas** des lectures anodines :
savoir qui est à la maison est une donnée du foyer. Leur permission doit être
distincte de `system.read`.

### 4.2 `voice.output` et `display.render` reclassent l'existant

Ces deux-là ne sont pas des capacités de plus : elles **absorbent tout ce que le
HUD fait déjà**. Une composition de surface devient un appel à `display.render`
sur un satellite ; une phrase parlée devient `voice.output`.

Conséquence à assumer : les phases **P0–P3** du contrat agentic UI ne sont pas
remplacées, elles deviennent **l'implémentation de `display.render` pour un
satellite à écran**. Le protocole de surface reste ; c'est son adressage qui
change (cf. dette §6.1-1).

---

## 5. Capability Router

Le composant qui manquait, et le seul endroit où l'on choisit un corps.

```
Intention utilisateur
      ▼
Hermes — comprend l'objectif, demande une CAPACITÉ (jamais un appareil)
      ▼
Policy — cette capacité, pour cet utilisateur, à cette gravité : autorisée ?
      ▼
Capability Router — quel satellite ? (§5.2)
      ▼
Satellite — exécute
      ▼
Core — filtre le résultat (S4), puis sert
```

**La Policy passe avant le routage.** L'ordre n'est pas cosmétique : router
d'abord reviendrait à choisir un appareil pour une action qui sera peut-être
refusée, et à le lui avoir annoncé.

### 5.1 Satellites natifs et satellites adaptés

Tout satellite ne peut pas exécuter notre runtime. Home Assistant en est
l'exemple : c'est un système complet, avec ses propres intégrations.

| Type | Exemple | Comment il parle |
|---|---|---|
| **Natif** | HUD, téléphone, lunettes | Exécute le Satellite Runtime, émet `SATELLITE_HELLO` |
| **Adapté** | Home Assistant | Un **adaptateur côté Core** traduit son API en capacités et fabrique son inventaire |

Pour le Capability Router, **les deux sont identiques** : il ne voit que des
capacités. C'est ce qui interdit d'écrire un runtime JARVIS pour chaque système
tiers — on écrit un adaptateur, une fois, côté Core.

---

### 5.2 Arbitrage — quel corps pour quelle intention

C'est le cœur, et la partie la plus facile à bâcler.

#### La règle par défaut

> **La réponse revient là où la demande est née.**

Question posée au téléphone → réponse sur le téléphone. C'est le comportement
attendu et il doit être le défaut, pas une option.

#### La sélection

Quand une intention réclame une capacité, le Router retient les satellites qui
satisfont **tous** les critères, puis ordonne :

| Critère | Nature |
|---|---|
| possède la capacité, inventaire **non périmé** | éliminatoire |
| capacité **accordée** à ce satellite (S1) | éliminatoire |
| satellite d'origine de la demande | +++ |
| co-présence avec l'utilisateur (dernière interaction récente) | ++ |
| qualité : `rtt_ms`, `bandwidth_kbps`, batterie non critique | + |
| coût d'interruption (un mur d'écrans dérange moins qu'un téléphone la nuit) | + |

**Aucun candidat → refus explicite**, avec la raison et la liste de ce qui
manque. Jamais une exécution silencieuse ailleurs : demander un scan et le voir
partir sur un appareil resté au salon serait pire qu'un échec.

### 5.3 Satellite Home — le premier satellite adapté

Le Raspberry Pi héberge Home Assistant, qui pilote le Zigbee et les capteurs.
Il devient un satellite de type `iot_gateway`, **adapté** au sens §5.1 : il
n'exécute pas notre runtime, un adaptateur côté Core traduit son API en
capacités.

```
Core → Home Assistant Adapter → HA API → Raspberry Pi → Zigbee / capteurs
```

L'adaptateur fabrique l'inventaire à partir des entités HA découvertes, et le
tient à jour. Pour le Capability Router, `light.turn_on` servie par HA et
`camera.capture` servie par un téléphone sont **indiscernables** — c'est la
preuve que l'abstraction tient.

Ce que le Pi ne contient jamais : mémoire utilisateur, logique d'agent, décision
IA, orchestration. Il capte et il actionne (règle produit existante : *Home
Assistant ne parle jamais*).

#### ⚠ Deux décideurs, un seul monde physique

Home Assistant doit rester **autonome si JARVIS est indisponible** — c'est juste,
et c'est la raison d'être d'un nœud domotique. Mais l'autonomie suppose des
automatisations **dans HA**, alors que la Policy vit **dans le Core**. Donc deux
choses peuvent allumer la même lampe, et rien ne dit laquelle a décidé.

Ce n'est pas un split-brain de données — c'en est un de **décision**, plus
difficile à voir. Sans règle écrite, un jour une lumière s'allume et personne ne
sait pourquoi.

Règle proposée, à valider :

| Dans HA | Dans le Core |
|---|---|
| Réflexes **locaux, sans jugement** : détecteur de fumée → sirène, bouton physique → lampe, minuterie de volet | Tout ce qui **interprète une intention** ou **arbitre entre plusieurs options** |
| Doit fonctionner Core éteint | Peut exiger le Core |

Critère : si l'automatisation a besoin de savoir *qui* est là ou *ce qui est
demandé*, elle appartient au Core. Si elle réagit à un fait physique isolé, elle
appartient à HA.

#### Ce que ça change pour les agents (S2)

```
Agent : « j'ai besoin d'une photo »
   │
   ▼
Core  : quelle capacité ? camera.capture
        quels satellites la portent, accordée, en ligne ?
        lequel est le mieux placé ?
        la Policy autorise-t-elle ? gravité ?
   │
   ▼
Satellite choisi : exécute, renvoie
   │
   ▼
Core  : filtre (S4), puis sert
```

L'agent n'a jamais nommé d'appareil. C'est ce qui permet d'ajouter des lunettes
AR ou un robot **sans toucher un seul agent**.

---

## 6. Greffe sur l'existant

Trois mécanismes du Core se généralisent sans réécriture.

| Existant | Extension satellite |
|---|---|
| `requiredContext` au catalogue UI (`camera`, `shell`) — déjà appliqué à l'admission | La source devient les capacités **accordées au satellite de la session**, au lieu du matériel du Core |
| `IntentExecutor` — registre d'actions, absence d'exécutant = refus tracé | Un exécutant peut être **distant**. Le registre devient « capacité → satellite choisi ». La règle du refus tracé vaut telle quelle |
| `BindingResolver` — le Core lit et filtre, l'agent ne remplit jamais | `sat.gps`, `sat.imu` : le Core **demande au satellite**, filtre (S4), puis sert |

### 6.1 Deux dettes à payer d'abord

1. **`SurfaceBroadcaster` est mono-client.** Un seul `document`, un seul
   `run_id`, un seul `seq` pour tous. Deux satellites connectés aujourd'hui se
   corrompent mutuellement la séquence. La composition doit devenir **par
   session**.

2. **`resolve_bindings` est synchrone.** Interroger un capteur distant est
   asynchrone et peut expirer. Si on le branche tel quel, une réponse utilisateur
   se bloque sur un téléphone en veille — exactement le défaut de télémétrie
   corrigé le 2026-08-05. **Toute lecture distante doit avoir un délai maximal et
   un comportement de repli**, décidés avant l'écriture, pas après.

---

## 7. Sécurité

| Risque | Réponse |
|---|---|
| Satellite qui ment sur ses capacités | Sans effet : la capacité n'ouvre rien (S1). Seule l'identité compte, et elle est cryptographique |
| Satellite compromis | Révocation côté Core. Portée limitée aux capacités accordées, jamais à la Policy |
| **Injection par capteur** | Une donnée de satellite est **externe** (S4) : filtrée avant tout LLM. Un nom de lieu GPS est du texte d'origine inconnue |
| Exfiltration par capacité | Un flux est une capacité comme une autre : il passe par la Policy et laisse une trace |
| Satellite qui exécute sans autorisation | Impossible par construction : il ne reçoit que des ordres déjà arbitrés. Il n'a pas de Policy à contourner |

Le point **S4** mérite d'être répété : c'est la règle produit existante
« données externes filtrées avant LLM », et un capteur est une source externe au
même titre qu'une page web.

---

## 8. Roadmap

**Règle de progression, héritée du contrat agentic UI : une phase se termine
quand quelque chose est observable. Pas quand le code compile.**

| Phase | Contenu | Critère de sortie — observable |
|---|---|---|
| **S0** | Identité + `HELLO`/`WELCOME`. Le HUD devient un satellite parmi d'autres. Registre des satellites vivants | Deux navigateurs connectés apparaissent comme **deux** satellites distincts, avec leurs capacités |
| **S1** | Surface **par session**. Dette 6.1-1 payée | Le même Core sert **deux compositions différentes** à deux satellites simultanés |
| **S2** | `requiredContext` alimenté par les capacités **accordées**. Appairage explicite | Un composant `camera` est refusé sur un satellite sans caméra, **et le motif est visible** |
| **S3** | Exécution distante : `IntentExecutor` route vers un satellite. Délai maximal et repli (dette 6.1-2) | Une intention `camera.capture` s'exécute sur le téléphone depuis une demande née sur le HUD mural |
| **S4** | Arbitrage §5.2 complet, capteurs comme sources `$bind` | La même question donne une réponse **riche** au mur et **sobre** au téléphone |
| **SH** | **Satellite Home** — adaptateur Home Assistant, inventaire depuis les entités découvertes | « Jarvis, prépare le salon cinéma » éteint les lumières et ferme les volets, **en passant par la Policy** |
| **S5** | Flux (`audio.in`, `video.in`) en LAN | Le micro du téléphone alimente le Whisper du NUC |

**SH peut se faire en parallèle de S2–S4** : c'est un satellite adapté, il ne
dépend pas du runtime natif. C'est même le meilleur banc d'essai du Capability
Router, parce que ses capacités sont nombreuses, nommées et déjà réelles — là où
un téléphone n'en apporte que trois ou quatre.

⚠ Prérequis SH non vérifié : **l'état du Raspberry Pi n'a jamais été constaté**
dans ce dépôt. Le placement (`jarvis-placement-services`) le prévoit avec Home
Assistant et le dongle Zigbee, mais rien ici ne l'a confirmé — ni IP, ni accès,
ni inventaire d'équipements. Première étape de SH : **regarder la machine**,
comme pour le NUC et le VPS.

**S1 avant S3** : router une exécution vers un satellite qu'on ne sait pas encore
adresser individuellement produirait des réponses au mauvais endroit — et un
utilisateur qui ne comprend pas pourquoi est pire qu'une fonction absente.

---

## 9. À trancher — décisions de Samir

1. **Un satellite non appairé voit quoi ?** Rien du tout, ou une surface publique
   minimale (heure, état, invitation à appairer) ?
2. **Qui parle, quand plusieurs satellites peuvent ?** La règle §5.1 (« là où la
   demande est née ») couvre la voix. Reste le **non sollicité** : une alerte à
   3 h du matin part sur quel corps ?
3. **Le catalogue UI doit-il déclarer des variantes de format ?** Position tenue
   ici : **non** — le HUD reste seul propriétaire du pixel (§6.1 du contrat
   agentic UI), donc un composant s'adapte à `surface.css_px`. Déclarer des
   variantes ferait entrer la notion d'appareil dans le catalogue, ce que **S3**
   interdit.
4. **Appairage : par quel geste ?** PIN sur le Dashboard, QR affiché au HUD,
   présence physique sur le LAN ? La règle « Discovery ≠ droits » impose un geste
   délibéré ; laquelle des trois reste ouvert.
5. ~~**Un satellite peut-il être un serveur ?**~~ **Tranché** : oui, et c'est le
   type `iot_gateway` (§5.3). Il n'a ni écran ni utilisateur, et il s'appaire
   comme un équipement, pas comme un terminal.
6. **Granularité des capacités** (§4.1) — verbe (`light.turn_on`) ou domaine
   (`light.control`) ? Position proposée : verbe pour agir, domaine pour lire.
7. **Un satellite est-il lié à UN utilisateur ?** Le téléphone, oui. La tablette
   murale est partagée par le foyer, et le Pi n'a pas d'utilisateur du tout. Donc
   `utilisateur associé` ne peut pas être obligatoire — il faut au moins trois
   cas : personnel, partagé, sans utilisateur. Ça change qui voit quoi (§S1).
8. **Partage HA / Core des automatisations** (§5.3) — valider la règle « réflexe
   physique dans HA, interprétation dans le Core », ou en écrire une autre. Mais
   il en faut une.

---

## 10. Ce qui rendrait ce document faux

À vérifier avant de considérer une phase comme faite :

- [ ] Aucun `if` sur un type d'appareil dans `core/` (**S3**)
- [ ] Aucun agent ne nomme un satellite (**S2**)
- [ ] Une capacité refusée porte toujours un motif lisible (**S6**)
- [ ] Un inventaire périmé est traité comme absent, jamais comme valide
- [ ] Le Core démarre et fonctionne avec **zéro** satellite connecté (**S5**)
- [ ] Toute lecture distante a un délai maximal explicite (dette 6.1-2)
