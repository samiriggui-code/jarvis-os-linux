# Figma 1 — Front HUD / Moi & mon JARVIS

Ce fichier fige ce qui a ete decide autour du **Figma 1** pour eviter toute derive.

## Role de Figma 1

Figma 1 represente la couche **frontale** de JARVIS OS :

- l'experience utilisateur directe
- le HUD
- les preferences liees a l'usage personnel
- les reglages immediats de l'interaction avec JARVIS
- les surfaces visuelles appelees depuis le HUD

Ce n'est **pas** la plomberie Core.
Ce n'est **pas** le panneau d'administration machine profond.
Ce n'est **pas** le controle systemd / D-Bus / KWin.

## Logique generale

Le systeme est pense comme suit :

- le **HUD** est la porte d'entree
- Hermes appellera plus tard des surfaces et des outils
- Figma 1 couvre le **front utilisateur**
- Figma 2 couvre la **machine et l'orchestrateur**

Donc Figma 1 = **Moi & mon JARVIS**

## Ce qui appartient a Figma 1

### 1. Profil utilisateur

- nom utilisateur
- identite locale
- nom de l'assistant
- personnalite / ton de l'assistant
- preferences generales de relation utilisateur <-> JARVIS

### 2. Memoire de travail et recap JARVIS

- memoire de travail active
- contexte courant
- recap recent
- historique de session utile
- resume de ce que JARVIS est en train de suivre pour l'utilisateur

But : donner une lecture simple de la memoire **coté experience utilisateur**, pas du moteur interne.

### 3. Voix

La voix cote Figma 1 inclut **le choix des devices**, pas seulement les tests.

- choix du microphone
- test micro
- choix de la sortie audio
- test sortie audio
- moteur TTS visible cote user
- sensibilite wake word
- comportement d'ecoute
- retour vocal utilisateur

Decision importante :

- le **device micro** reste dans Figma 1
- le **device sortie audio** reste dans Figma 1

On ne separe pas "selection du materiel" dans Figma 2 et "calibration" dans Figma 1.
L'utilisateur doit pouvoir **choisir et tester** au meme endroit.

### 4. Vision & gestes

Figma 1 contient la partie experience directe de la vision :

- choix de la camera
- repositionnement camera
- calibrage gestes
- calibrage Holomat
- sensibilite et comportement de tracking
- test vision local
- preview du cadrage

Decision importante :

- le **device camera** reste dans Figma 1
- le **calibrage** reste dans Figma 1

L'utilisateur doit pouvoir choisir sa camera et recalibrer ses gestes dans une seule surface.

### 5. Comportements HUD

- preferences visuelles du HUD
- comportement vocal immediat
- options de presentation de l'interface
- reactions et surfaces rapides
- ergonomie d'interaction

Cette partie reste frontale, liee a la maniere dont l'utilisateur vit JARVIS au quotidien.

### 6. Confidentialite immediate / kill-switch

Figma 1 contient les actions de coupure rapide qui **reduisent** l'acces :

- coupure rapide micro
- coupure rapide camera
- acces instantane a ces actions

Decision importante :

- les **quick privacy controls** restent en Figma 1
- car ce sont des actions immediates, a faible risque, qui reduisent l'acces

Exemple :

- couper le micro
- couper la camera

Ces actions doivent etre accessibles rapidement depuis l'experience utilisateur.

## Ce qui n'appartient pas a Figma 1

Les points suivants ne doivent pas etre places dans Figma 1 :

- gestion profonde de l'orchestrateur
- providers IA complets
- services systemd `jarvis-*`
- D-Bus
- KWin / Wayland
- reseau systeme avance
- paquets / dependances
- maintenance / recovery
- modele de permissions par utilisateur
- Policy Engine admin
- journal des decisions de securite

Ces elements relevent de **Figma 2**.

## Frontiere avec Figma 2

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

## Cas special : icones systeme

Les icones systeme visibles en permanence appartiennent a la logique HUD, donc cote Figma 1 pour l'affichage d'etat :

- wifi
- son
- micro
- bluetooth
- camera
- energie
- heure / date

Mais leur **panneau detaille** ou leur configuration profonde peut ouvrir des surfaces plus riches.

Regle :

- **etat compact visible** = logique Figma 1 / HUD
- **controle detaille profond** = peut ouvrir une surface type Figma 2 selon la profondeur necessaire

## Cas special : App Launcher

Le launcher du premier Figma ne doit pas etre melange aux settings.

- `App Launcher` = ouvrir des surfaces
- `Settings` = parametrer l'experience utilisateur

Donc le launcher reste une **surface HUD a part**.

## Cas special : System Configuration du premier Figma

La page `System Configuration` du premier Figma n'est pas un panneau systeme KDE complet.
Dans notre vision, elle devient un **front settings panel**.

Elle peut contenir :

- User Profile
- Memory & Recap
- Voice
- Vision & Gestures
- Privacy Quick

Mais elle ne doit pas devenir le panneau systemd / machine admin.

## Vision produit retenue

Le systeme complet suit cette logique :

- HUD = facade principale
- Figma 1 = experience utilisateur directe
- Figma 2 = back-office machine / orchestrateur
- maintenance basse couche = doit exister plus tard hors du HUD

## Ce qu'il faudra garder pour plus tard

Point de vigilance deja discute :

Une partie du contenu de Figma 2 recouvrira la maintenance, le reseau, les services et le recovery.
Ces actions devront un jour etre accessibles aussi **hors du HUD** :

- panneau web de depannage
- session terminal
- TTY / mode maintenance

pour qu'un HUD casse ne bloque pas l'acces a l'outil cense le reparer.

Ce point n'impacte pas la definition de Figma 1, mais il faut le garder en memoire.

## Resume ultra-court

Figma 1 = **Moi & mon JARVIS**

Il contient :

- preferences user
- memoire et recap
- choix micro / camera / sortie audio
- tests et calibrages
- gestes / vision
- comportements HUD
- kill-switch micro / camera

Il ne contient pas :

- systemd
- D-Bus
- KWin
- providers admin
- services machine
- maintenance profonde
- policy admin
- permissions par utilisateur
