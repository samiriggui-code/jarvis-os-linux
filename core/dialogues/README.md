# Dialogues JARVIS — bibliothèque Auth / système

> **Règle de nommage : JARVIS ne dit jamais « Hermes ».**
> Hermes est le nom du moteur interne, jamais celui de l'assistant. À l'oral,
> l'assistant s'appelle **JARVIS** — ou ne se nomme pas du tout (« le noyau
> cognitif », « les matrices cognitives »). Aucune phrase de cette
> bibliothèque ne doit prononcer un nom de composant technique.

Source de vérité des monologues pour le **Dialogue Manager** (cahier §13.10).

Le HUD React **ne duplique pas** ces textes : il consomme l’événement WS `dialogue_line`.

## Fichiers

| Fichier | Domaine |
|---------|---------|
| `auth.yaml` | Protocole Auth immersif (cinematic / human / security_alert) |
| `boot.yaml` | Démarrage système (réf. courte ; Auth boot détaillé dans `auth.yaml`) |
| `security.yaml` | Alertes accès / protection |
| `quotidien.yaml` | Réponses aux intentions déterministes (sans LLM) — pré-générées et mises en cache |
| `enrolement.yaml` | Enrôlement, empreinte vocale, scan facial, PIN — **tout au vouvoiement** |
| `session.yaml` | Session, profils, permissions, administration, confidentialité |
| `systeme.yaml` | Appareils, réseau, modes IA, arrêt |

## Schéma d’une ligne

```yaml
- event: face_authenticated
  tone: cinematic          # cinematic | human | technical | security_alert | silent
  security_level: auth     # public | auth | elevated | admin | alert
  user_role: null          # admin | user | child | guest | null = tous
  text: "Identité confirmée."
  voice: jarvis
  face_animation: acknowledge
  orb_state: pulse
  hud_overlay: access_granted   # optionnel
  holo_sfx: soft_chime          # optionnel
  pause_ms: 400                 # pause après la phrase (§3.4)
  voice_params:
    rate: 0.92
    style: executive
```

## Trois extensions du schéma

**`text` accepte une liste** — variantes tirées au hasard à l'exécution :

```yaml
text:
  - "C'est fait."
  - "Voilà."
  - "Entendu."
```

Entendre le même fichier audio quarante fois par jour est ce qui transforme
un assistant en distributeur automatique. Quatre variantes suffisent, et ne
coûtent que quatre générations.

**`address: vous | tu | absent`** — `absent` = phrase neutre, servie aux cinq
profils avec **un seul** fichier audio. Règle d'écriture : *éviter les
pronoms par défaut*. « Action non autorisée. » sert tout le monde ;
« Vous n'avez pas l'autorisation. » oblige à doubler la bibliothèque. En
prime, les tournures impersonnelles sonnent plus JARVIS.

Le réglage vit sur le profil utilisateur (défaut `vous`), négocié une fois
par l'événement `address_ask`. Inconnu ou invité → `vous`, sans exception.
Le tutoiement est **cosmétique** : il ne passe jamais par le mécanisme des
permissions, sinon un enfant s'accorde des droits en répondant « oui » à une
question sympathique.

**Les placeholders `{user}`, `{room}`, `{device}`, `{service}`, `{target}`**
sont expansés **à la génération du cache**, pas à la lecture : un WAV par
valeur réelle. On ne recolle jamais des fragments pour fabriquer une phrase
— la couture s'entend. Exception admise : les nombres insérés dans une
phrase fixe (heure, température), assez fréquents pour valoir le compromis.

## Cache audio

Les lignes sont pré-générées en WAV et stockées sur le NUC. Elles ne coûtent
ni token ni caractère ElevenLabs, répondent sans latence, et **fonctionnent
quand Ollama, OpenRouter ou Internet sont tombés** — c'est le mode dégradé,
obtenu gratuitement.

Générer avec le modèle **qualité** (la latence est sans importance ici) et
stocker **brut** : le Voice Filter s'applique à la lecture, côté HUD. Sinon
le moindre réglage de réverb impose de tout regénérer.

Prononciation des prénoms et noms propres : `core/data/voice/prononciation.yaml`.

Identité vocale et pipeline TTS / Voice Filter / Lip Sync : cahier **§3.4** (service `jarvis-voice` indépendant).
