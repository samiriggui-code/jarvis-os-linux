---
name: settings-split
description: >-
  Rappelle et applique la frontière entre la page Settings expérience (profil,
  voix, gestes, mémoire) et le panneau Système (Core, services, réseau,
  policy) du HUD JARVIS. À utiliser dès qu'on conçoit ou code une page de
  réglages dans hud/, ou qu'on adapte une référence Figma externe.
---

# Skill — Settings expérience vs Panneau système (HUD JARVIS)

## Quand l'utiliser

Dès qu'une tâche touche à une page de réglages du HUD (`hud/qml/`), ou qu'on
adapte une maquette Figma externe pour l'y intégrer.

## Contexte (pour ne pas le reperdre)

Deux références Figma communautaires ont été analysées et servent de patrons
structurels, jamais de charte graphique à copier :

- **Figma 1** — "JARVIS Personal AI OS" → patron de dashboard personnel,
  devient la page **Settings expérience**.
- **Figma 2** — "Jarvis New ui / NEXUS AI" → patron de HUD système, devient le
  **Panneau système**, structuré façon KDE Systemsettings (sidebar catégories
  + détail), pas Kirigami (absent du stack PySide6 actuel).

## Procédure

1. Avant d'ajouter un réglage, vérifier dans le tableau de
   `.cursor/rules/settings-split.mdc` s'il appartient à **Settings
   expérience** (personnel, sans risque, buildable sans Core) ou **Panneau
   système** (admin, passe par Policy Engine, dépend du protocole Core).
2. Ne jamais séparer un device de sa calibration (micro/caméra restent en
   Settings expérience avec leur calibrage).
3. Distinguer coupure rapide (Settings expérience) et modèle de permissions
   multi-utilisateur (Panneau système).
4. Vérifier que les actions critiques du Panneau système ne deviennent pas
   *uniquement* accessibles depuis le HUD — cohérence avec Recovery Manager
   (`cahierdecharges.md` §6.5, §12).
5. Le protocole Core (`list_tools`, `call_tool`, `get_config`/`set_config`)
   n'existe pas encore (`core/jarvis_core/__init__.py` ne gère que `ping` et
   `user_event/chat`) — construire le Panneau système avec du placeholder
   explicite tant que ce protocole n'est pas écrit ; ne pas câbler de fausses
   actions qui n'aboutissent nulle part.
6. Réutiliser les composants existants (`HudPanel`, `KvRow`, `HudButton`,
   `WaveMeter`, `Theme`) — jamais la palette ou le thème des Figma sources.

## Fichiers liés

- Rule Cursor ciblée : `.cursor/rules/settings-split.mdc`
- Conventions HUD : `.cursor/rules/qml-hud.mdc`
- Conventions Core : `.cursor/rules/core.mdc`
- Règles projet : `CLAUDE.md`, `.cursor/rules/project.mdc`
