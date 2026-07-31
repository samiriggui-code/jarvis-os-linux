---
name: cahier-des-charges
description: >-
  Met à jour cahierdecharges.md en fusionnant le contenu dans les bonnes
  sections, en créant des sections si besoin, et en renumérotant titres ## N.
  et renvois §N. À utiliser dès qu'on modifie le cahier des charges JARVIS OS.
---

# Skill — Cahier des charges JARVIS OS

## Quand l'utiliser

Toute modification de `cahierdecharges.md` (nouveau risque, manager, mode IA, recovery, etc.).

## Procédure

1. Lire le fichier et repérer la/les section(s) concernées via les titres `## N.` et les renvois `§N`.
2. Si le contenu **étend** un sujet existant → intégrer dans cette section (sous-partie `###` si besoin).
3. Si le sujet est **nouveau** → ajouter une section `## N.` à l'emplacement logique (souvent avant `## Suite` / roadmap).
4. Après toute insertion qui décale la numérotation :
   - Renuméroter tous les titres `## N.`
   - Mettre à jour **tous** les renvois textuels `§N`, « voir §N », « cf. §N »
5. Ajouter `> **Point ouvert** : …` pour les décisions non tranchées.
6. Ne pas dupliquer : préférer un renvoi croisé vers la section canonique.
7. Garder le style du document : prose + schémas ASCII + tableaux, pas de gros blocs de code produit.

## Fichiers liés

- Spec : `cahierdecharges.md`
- Règles projet : `CLAUDE.md`, `.cursor/rules/project.mdc`
- Rule Cursor ciblée : `.cursor/rules/cahier-des-charges.mdc`
