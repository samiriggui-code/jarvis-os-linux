---
name: user-locale
description: >-
  Profil multi-user face+voix+langue. Après Holomat/auth, charger preferred_language,
  secondary_languages, voicePreset, permissions. Répondre en miroir / preferred / sticky.
  Whisper lang_id quand dispo. CE N’EST PAS UN MOCK.
---

# Skill — Locale & identité foyer

## Flux

```
Caméra (face) + micro (timbre)
  → Auth Core (user_id, role, permissions)
  → load hud_preferences.locale
  → Hermes adapte : langue réponse + TTS voicePreset + droits appareils
```

## Schéma profil (hud_preferences.locale)

```yaml
preferredLanguage: fr          # langue principale
secondaryLanguages: [en]       # acceptées
mode: mirror                   # mirror | preferred | sticky
stickyLanguage: null           # override « passe en anglais »
voicePreset: jarvis_fr         # jarvis_fr | jarvis_en | jarvis_soft
faceId: samir_001
```

Exemples foyer :

| User | preferred | secondary | voice |
|------|-----------|-----------|-------|
| Samir (ADMIN) | fr | en | jarvis_fr |
| User 2 | en | fr | jarvis_en |
| Enfant (CHILD) | fr | — | jarvis_soft |

## Règles de réponse

1. **mirror** (défaut robuste) : répondre dans la langue de l’énoncé (Whisper `language` ou heuristique).
2. **preferred** : toujours `preferredLanguage`.
3. **sticky** : après « Passe en anglais » / « Switch to French », garder jusqu’à nouvel ordre.
4. Commande hors `secondaryLanguages` : accepter si switch explicite ; sinon rester preferred.

## Exemples

- Samir : « Lance Plex. » → « Bien sûr, j'ouvre Plex. » (FR + jarvis_fr)
- Samir : « Open Visual Studio Code. » → « Sure. Opening Visual Studio Code. » (mirror EN)
- « What's on my calendar? » → EN ; « Quelle est la météo ? » → FR

## Permissions

Le profil auth porte `role` + `permissions` (ADMIN seul Dashboard). Locale ne change pas les droits — elle change langue/voix uniquement.

## Core

`jarvis_core.locale.resolve_reply_language` + event `locale_resolved` / `chat_reply` avec `language` + `voicePreset`.
