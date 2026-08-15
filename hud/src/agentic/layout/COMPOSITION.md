# Agentic HUD — Contrat de composition

> Simulation locale = prototype du moteur final.  
> **CONTENU > CONTAINMENT > LAYOUT > ESTHÉTIQUE**

## Séparation des rôles

| Couche | Décide |
|--------|--------|
| **Agent** | quoi afficher, priorité, densité, créer/supprimer une section |
| **Layout Engine** | grille, spans, espacement, adaptation viewport |
| **Component** | rendu intrinsèque, contraintes internes |
| **Motion** | transitions de recomposition (pas des pops isolés) |

L’agent **ne** pose **jamais** de coordonnées pixel.

## Section = conteneur interactif

Toute section a un header : pastilles rouge/jaune/vert (fermer · réduire · agrandir) + titre.  
États : `normal` | `collapsed` | `expanded`.  
Suppression / ajout → recomposition animée du layout restant.

## Surface HUD

- Zone utile = entre TopBar et VoiceBar (capture rouge).
- **Aucun scroll** horizontal ni vertical.
- Overflow = `hidden` ; le moteur redistribue, il ne fait pas défiler.

## Sizing

- Hauteur : `auto` / content-based.
- Largeur : span de grille **dynamique** (2→24 cols) selon largeur canevas + taille `sm|md|lg|xl`.
- Interdit : hauteur fixe pour remplir l’écran ; dalle vide pour 2 lignes de texte ; chevauchement.

## Responsive (phone → 4K)

Fichier : `layout/responsivePack.ts`

| Largeur canevas | Breakpoint | Colonnes |
|-----------------|------------|----------|
| < 420 | phone | 2 |
| < 720 | tablet | 4 |
| < 1100 | laptop | 6 |
| < 1600 | desktop | 12 |
| < 2560 | qhd | 16 |
| ≥ 2560 | uhd (4K+) | 24 |

- Packer ligne-par-ligne : **aucun chevauchement**
- `sm/md/lg/xl` + collapsed/expanded → spans relatifs au nombre de colonnes
- Zoom HUD = densité (plus/moins de colonnes), pas un `transform: scale` qui casse la grille
- `ResizeObserver` sur la surface rouge (TopBar → VoiceBar)
