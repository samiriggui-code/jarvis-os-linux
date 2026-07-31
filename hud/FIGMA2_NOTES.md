# Figma 2 — Machine & orchestrateur

Ce fichier fige ce qui a ete decide autour du **Figma 2** pour eviter toute derive.

## Role de Figma 2

Figma 2 represente la couche **back-office** de JARVIS OS :

- administration machine
- orchestration visible
- supervision systeme
- configuration de la couche Hermes / Core
- lecture et pilotage des services et modules
- panneau equivalent a un `System Settings` de KDE, mais habille en JARVIS

Ce n'est **pas** le HUD principal.
Ce n'est **pas** le panneau "Moi & mon JARVIS".
Ce n'est **pas** le lieu des preferences quotidiennes de l'utilisateur final.

## Logique generale

Le systeme est pense comme suit :

- le **HUD** est la porte d'entree
- Figma 2 est appele **depuis** le HUD
- structurellement, Figma 2 reprend la logique **KDE System Settings**
- visuellement, Figma 2 reste **JARVIS**, pas Breeze

Donc Figma 2 = **Machine & orchestrateur**

## Nature UX de Figma 2

Figma 2 doit etre compris comme :

- un panneau de controle machine
- un centre de supervision
- un cockpit d'administration
- une lecture claire de la plomberie systeme, sans encore la brancher reellement aujourd'hui

Le bon parallele est :

- **KDE System Settings** pour la structure
- **JARVIS OS** pour l'habillage

## Ce qui appartient a Figma 2

### 1. Core / Hermes

- statut Hermes
- statut WS / orchestration
- mode actuel (local / remote / cloud / degraded / system)
- provider actif
- fallback visible
- etat du Policy Engine
- etat global du cerveau / routage

But : montrer comment la machine route, decide et bascule, pas la relation intime utilisateur-assistant.

### 2. Providers IA

- provider local
- provider distant
- provider cloud
- ordre de priorite
- etat de disponibilite
- latence / fallback
- cles API
- quotas visibles

Ce point appartient a Figma 2 car il s'agit de configuration d'infrastructure logique, pas de preference utilisateur simple.

### 3. Services `jarvis-*`

- `jarvis-hud`
- `jarvis-core`
- `jarvis-voice`
- `jarvis-vision`
- `jarvis-home`
- `jarvis-memory`
- `jarvis-security`

Pour chacun :

- statut
- start
- stop
- restart
- sante generale
- dependances visibles

Cela fait partie du vrai panneau machine.

### 4. D-Bus / KWin / Wayland / session systeme

- statut session graphique
- etat du compositeur
- etat D-Bus
- shell session
- composants desktop critiques
- integration au bureau

Ce sont des sujets d'environnement machine, donc Figma 2.

### 5. Policy Engine & securite admin

- regles de risque
- journal des decisions
- confirmations critiques
- modelisation des niveaux de risque
- historique des validations
- etat de la couche d'autorisation

Ici on est bien dans la logique admin / systeme.

### 6. Modele de permissions par utilisateur

Decision importante :

- le **kill-switch micro/camera immediat** reste en Figma 1
- le **modele de permissions par utilisateur** reste en Figma 2

Exemple :

- Samir = acces complet
- Invite = acces limite
- droits par profil
- roles machine

Pourquoi ?
Parce que cela definit l'acces **des autres utilisateurs** et donc releve de l'administration.

### 7. Reseau

- etat reseau global
- wifi / LAN
- decouverte reseau
- acces distant
- segmentation logique
- dependances reseau de la plateforme

La lecture et l'administration reseau profondes relevent de Figma 2.

### 8. Paquets / dependances / maintenance systeme

- paquets systeme
- dependances
- mises a jour
- preparation de l'environnement
- maintenance machine
- recovery
- backup / restore
- etat des composants critiques

Cela fait partie de la couche machine.

### 9. Recovery / maintenance profonde

Figma 2 peut exposer :

- etat Recovery Manager
- sauvegardes
- restauration
- modes de maintenance
- logs critiques
- diagnostic systeme

Mais attention : cette lecture dans le HUD ne doit pas devenir l'unique porte d'entree future de ces actions.

## Ce qui n'appartient pas a Figma 2

Les points suivants ne doivent pas etre places dans Figma 2 comme centre principal :

- nom / personnalite de l'assistant
- recap recent JARVIS cote utilisateur
- memoire de travail visible cote utilisateur
- selection quotidienne du micro / camera / sortie audio
- tests rapides micro / son / camera
- recalibrage utilisateur des gestes
- quick privacy mic/cam cut
- comportements HUD personnels

Ces elements relevent de **Figma 1**.

## Frontiere avec Figma 1

### Figma 1

`Moi & mon JARVIS`

- profil
- memoire active
- recap
- voix
- camera
- gestes
- tests materiels
- quick privacy
- preferences HUD

### Figma 2

`Machine & orchestrateur`

- Core / Hermes
- providers IA
- services `jarvis-*`
- D-Bus / KWin / Wayland
- Policy Engine
- permissions par utilisateur
- reseau / paquets / dependances
- maintenance / recovery

## Cas special : equivalents KDE System Settings

Le vrai panneau equivalent a `System Settings` de KDE se trouve **dans Figma 2**.

Mais il faut bien comprendre sa place :

- il est **appele depuis le HUD**
- il ne remplace pas le HUD
- il constitue la vraie surface d'administration machine

Autrement dit :

- **entree** = HUD
- **surface admin** = Figma 2

## Cas special : icones systeme

Les icones systeme compactes visibles en permanence ne sont pas la responsabilite principale de Figma 2.
Elles relèvent de la presence HUD.

En revanche, leurs **panneaux profonds** ou leurs vues d'administration peuvent ouvrir des surfaces relevant de Figma 2 :

- reseau
- audio systeme
- energie
- devices
- disponibilite machine

Regle :

- **etat compact** = logique HUD / Figma 1
- **configuration profonde** = surface type Figma 2 si c'est machine/admin

## Cas special : camera / micro

Decision importante deja fixee :

- le **choix du micro**
- le **choix de la camera**
- le **choix de la sortie audio**

restent cote **Figma 1**.

Figma 2 peut afficher :

- la disponibilite detectee
- l'etat du capability layer
- la presence du materiel

mais pas devenir le lieu principal de selection utilisateur du device.

Autrement dit :

- Figma 1 = choisir et tester
- Figma 2 = constater et administrer

## Categories recommandees pour Figma 2

Structure type sidebar + panneau detail, a la KDE :

- Core / Orchestrateur
- Providers IA
- Services
- Systeme
- Securite / Policy
- Permissions
- Reseau
- Maintenance / Recovery

Cette structure est la plus coherente avec ce qu'on veut construire.

## Vision produit retenue

Le systeme complet suit cette logique :

- HUD = facade principale
- Figma 1 = experience utilisateur directe
- Figma 2 = machine / orchestrateur / administration
- maintenance basse couche = devra aussi exister plus tard hors HUD

## Point de vigilance majeur

Une grosse partie du contenu de Figma 2 recouvre ce que le projet assigne deja au :

- Recovery Manager
- mode de depannage
- acces bas niveau
- maintenance survivant au HUD

Donc il faut retenir ceci tres clairement :

Figma 2 peut **lire** et plus tard **piloter** ces fonctions dans le HUD,
mais les actions critiques devront un jour aussi etre atteignables **hors du process HUD** :

- panneau web de depannage
- TTY
- session terminal
- mode maintenance independant

Sinon un HUD casse bloquerait l'acces a l'outil cense le reparer.

Ce point n'empeche pas Figma 2 d'exister, mais il encadre son role futur.

## Resume ultra-court

Figma 2 = **Machine & orchestrateur**

Il contient :

- Core / Hermes
- providers IA
- services `jarvis-*`
- D-Bus / KWin / Wayland
- Policy Engine
- permissions admin
- reseau / dependances
- maintenance / recovery

Il ne contient pas comme coeur d'usage :

- preferences user
- memoire active cote utilisateur
- recap JARVIS perso
- choix quotidien micro / camera / son
- calibrages utilisateur
- quick privacy immediat
- comportements HUD personnels
