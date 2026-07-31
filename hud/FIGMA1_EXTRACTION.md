# Figma 1 — Extraction utile pour reconstruction QML du HUD

Ce document extrait **uniquement** ce qui est utile dans **Figma 1** pour reconstruire le HUD et les surfaces frontales en QML.

But :

- ne pas repartir de zero
- ne pas reinventer
- ne pas confondre Figma 1 et Figma 2
- garder une base de reconstruction composant par composant

Ce document ne traite **pas** la plomberie Core reelle.

## Perimetre retenu

Figma 1 sert a reconstruire :

- le **front HUD**
- les **settings front**
- le **gesture control**
- le **launcher**
- les **motifs visuels** reutilisables par le HUD

Figma 1 ne sert pas a definir :

- les services systemd profonds
- D-Bus
- KWin / Wayland
- les permissions admin
- le panneau machine profond

Ces points restent du cote Figma 2.

## Ecrans identifies dans Figma 1

### 1. System Configuration — User Profile

Capture de reference :

- `System Configuration`
- sidebar gauche
- panneau detail a droite
- footer d'actions `Cancel / Save Changes`

Ce que cet ecran apporte :

- la **structure generale** du front settings
- le **header de panneau**
- la **sidebar categories**
- la **forme des champs**
- la **grammaire du footer**

Ce que cet ecran devient chez nous :

- page `Front Settings`
- sous-section `Profile`
- base structurelle pour toutes les pages de settings front

### 2. System Configuration — AI Model

Ce que cet ecran apporte :

- variante **focus violet**
- menu select / dropdown
- slider
- bloc analytics / performance
- toggles a droite

Ce qui nous interesse :

- structure de page secondaire
- style des toggles
- style des cartes de mesures
- usage d'un accent secondaire par section

Ce que cet ecran devient chez nous :

- pas une page `AI Model` telle quelle
- mais un motif reutilisable pour :
  - `Voice`
  - `Memory`
  - certains comportements du HUD

### 3. System Configuration — API Keys

Ce que cet ecran apporte :

- champs secrets
- icone oeil
- message de statut / warning
- liste verticale de credentials

Ce qui nous interesse :

- pattern de champ sensible
- pattern de bloc d'information / note de securite
- pattern de formulaire dense et propre

Ce que cet ecran devient chez nous :

- cote Figma 1 : uniquement si besoin de montrer un secret utilisateur simple
- sinon surtout un **motif de composant**

Important :
la vraie gestion providers / cles d'API profondes reste plutot du cote Figma 2.

### 4. System Configuration — Security

Ce que cet ecran apporte :

- carte d'etat de securite
- toggles verticaux
- tableau de resume

Ce qui nous interesse :

- visualisation de "privacy quick"
- etat de confiance
- actions de reduction d'acces

Ce que cet ecran devient chez nous :

- `Privacy Quick`
- partie frontale de confiance / coupure immediate

Attention :
ce n'est **pas** le modele admin de permissions.
Le modele de permissions par utilisateur reste Figma 2.

### 5. Gesture Control

Ce que cet ecran apporte :

- panneau dedie a la vision / tracking
- grande zone camera / hand map
- statut de detection
- geste actif
- liste de gestes de reference
- toast de geste detecte

Ce que cet ecran devient chez nous :

- page `Vision & Gestures`
- ou sous-page du front settings

Ce que l'on garde absolument :

- choix camera
- preview camera
- detection status
- geste actif
- liste de gestes
- calibrage / repositionnement

### 6. App Launcher

Ce que cet ecran apporte :

- grille d'apps
- categories / filtres
- style des tuiles
- style des icones neon

Ce que cet ecran devient chez nous :

- une surface `Launcher`
- distincte des settings

Important :

- `Launcher` != `Settings`
- le launcher ouvre
- les settings reglent

## Composants a extraire

Voici les **vrais blocs reutilisables** a tirer de Figma 1.

### A. Shell de panneau

Pattern general :

- grand panel sombre
- bord cyan fin
- coins arrondis
- header horizontal
- close button rond avec accent rouge
- separation header / body / footer

Equivalent QML cible :

- `SettingsShell.qml`

Responsabilites :

- cadre de panneau
- titre
- sous-titre
- close affordance
- footer actions

### B. Sidebar categories

Pattern :

- colonne gauche fixe
- items empiles
- item actif surligne
- icone + label
- accent de section

Equivalent QML cible :

- `SettingsSidebar.qml`
- `SettingsNavItem.qml`

Usage :

- `Front Settings`
- plus tard `System Settings`

### C. Champ / row de formulaire

Pattern :

- label haut
- champ sombre arrondi
- texte clair
- densite propre

Equivalent QML cible :

- `SettingsField.qml`

Variantes :

- text field
- secret field
- read-only field
- select field

### D. Toggle switch

Pattern :

- capsule arrondie
- bouton interne lumineux
- etat actif tres visible

Equivalent QML cible :

- `SettingsToggle.qml`

Usage :

- voix
- privacy
- comportement HUD
- gestes

### E. Carte de statut / resume

Pattern :

- carte compacte
- titre court
- metrique / resume
- accent couleur

Equivalent QML cible :

- `StatusCard.qml`

Usage :

- privacy quick
- voice test
- vision detection
- memory recap

### F. Bloc camera / vision

Pattern :

- grand viewport
- overlay simple
- badge camera active
- contenu main / tracking

Equivalent QML cible :

- `VisionPreviewCard.qml`
- `GestureList.qml`

### G. Toast / detection popup

Pattern :

- petit panneau flottant
- info rapide
- une ligne d'etat

Equivalent QML cible :

- `HudToast.qml`

Usage :

- gesture detected
- quick privacy
- device changed

### H. Tile launcher

Pattern :

- grille
- tuile sombre
- glow central
- icone neon
- label bas

Equivalent QML cible :

- `LauncherTile.qml`
- `LauncherGrid.qml`

## Tokens visuels a extraire

### Couleurs

Palette dominante :

- fond bleu/noir tres sombre
- cyan electrique
- variantes :
  - violet
  - amber
  - vert securite
  - rouge fermeture / danger

Interpretation pour QML :

- cyan = parcours principal / system / neutral high-tech
- violet = IA / model / provider-like section
- amber = warning / confidentialite / cle / vigilance
- vert = securite active / ok / trusted
- rouge = close / off / cut

### Typographie

Ce qu'on observe :

- titre techno uppercase espacé
- sous-titres fins
- labels compacts
- champs lisibles

Equivalent cible :

- titres = `Theme.fontTitle`
- corps = `Theme.fontBody`

### Formes

- coins tres arrondis mais pas organiques
- capsules
- bordures fines
- glow discret
- densite serieuse

### Rythme de layout

- grande colonne gauche
- zone detail claire a droite
- footer stable
- beaucoup d'air
- pas de surcharge visuelle

## Traduction ecran -> usage JARVIS

### User Profile

Peut devenir :

- profil utilisateur
- identite JARVIS
- personnalite
- alias

### AI Model

Ne doit **pas** devenir une vraie page provider complete dans Figma 1.

Peut devenir :

- comportement intelligent visible
- style de voix
- memory mode
- toggles experience

### API Keys

Ne doit pas devenir la vraie gestion infra.

Peut devenir :

- motif de champ secret
- un mini bloc d'integration user-side si necessaire

### Security

Doit devenir :

- quick privacy
- visualisation de confiance
- reduction immediate d'acces

Pas :

- politique admin multi-utilisateur

### Gesture Control

Doit devenir :

- surface vision utilisateur complete

### App Launcher

Doit devenir :

- launcher HUD separé

## Adaptations JARVIS imposees

On ne copie pas Figma 1 tel quel.
On l'adapte a notre logique deja fixee.

### Adaptation 1 — renommer la logique de page

`System Configuration` du Figma 1 devient, chez nous, un **front settings hub**, pas un vrai panneau machine.

### Adaptation 2 — reclasser les rubriques

Ce que nous gardons reellement en Figma 1 :

- Profile
- Memory & Recap
- Voice
- Vision & Gestures
- Privacy Quick
- HUD Preferences

### Adaptation 3 — selection devices

Contrairement a une separation naive :

- micro
- camera
- sortie audio

restent dans Figma 1 si c'est du **choix utilisateur + test + calibrage**.

### Adaptation 4 — launcher separe

Le launcher n'est pas une sous-page settings.
Il devient une surface HUD a part.

### Adaptation 5 — back-office exclu

Tout ce qui est :

- systemd
- D-Bus
- KWin
- providers complets
- permissions admin
- recovery profond

sort de Figma 1.

## Ce qu'il faut reconstruire en QML d'abord

Ordre de reconstruction recommande :

### Phase 1 — composants de base

- `SettingsShell.qml`
- `SettingsSidebar.qml`
- `SettingsNavItem.qml`
- `SettingsField.qml`
- `SettingsToggle.qml`
- `StatusCard.qml`

### Phase 2 — surfaces Figma 1

- `FrontSettingsScene.qml`
- `GestureControlScene.qml`
- `LauncherScene.qml`

### Phase 3 — adaptation au HUD

- ouverture depuis le HUD
- transitions
- quick open
- integration aux etats du shell

## Mapping final propose

### Figma 1 -> surfaces QML

- `System Configuration / User Profile` -> `FrontSettingsScene.qml`
- `System Configuration / AI Model` -> motifs de toggles + slider + cards
- `System Configuration / API Keys` -> motifs de secret fields
- `System Configuration / Security` -> `PrivacyQuickSection.qml`
- `Gesture Control` -> `GestureControlScene.qml`
- `App Launcher` -> `LauncherScene.qml`

## Resume ultra-court

Ce qu'on extrait vraiment de Figma 1 :

- shell de panneau
- sidebar settings
- champs
- toggles
- cartes de statut
- bloc vision
- popup de detection
- grille launcher

Ce qu'on reconstruit ensuite :

- `Front Settings`
- `Gesture Control`
- `Launcher`

Ce qu'on n'y met pas :

- plomberie machine profonde
- systemd
- D-Bus
- KWin
- permissions admin
- recovery profond
