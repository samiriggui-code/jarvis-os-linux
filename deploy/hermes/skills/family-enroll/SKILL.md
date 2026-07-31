---
name: family-enroll
description: >-
  Enroler un membre du foyer JARVIS (USER/CHILD) via Core Auth + Holomat.
  Règle produit réelle : ADMIN seul gère le foyer ; enfants/conjoint = HUD
  seulement. Au lock, auth → bascule profil. Utiliser quand l’admin dit
  « inscris ma fille / mon conjoint » ou Settings → Foyer.
---

# Skill — Enrollment foyer (Hermes → Core)

## Loi

- Premier user = ADMIN (Dashboard).
- Membres = `USER` | `CHILD` → **HUD uniquement**.
- Timbre / face : flags Core aujourd’hui ; voiceprint = pipeline Voice plus tard.
- Ne jamais enroler un second ADMIN via cette skill.

## Prérequis

Session Core active avec `user_management` ou `dashboard_access`.

## Étapes

1. Collecter `display_name`, `username`, `role` ∈ {USER, CHILD}, PIN optionnel,
   et locale : `preferredLanguage`, `secondaryLanguages`, `voicePreset`
   (enfant → `jarvis_soft`).
2. WS Core :

```json
{
  "type": "auth",
  "action": "enroll",
  "username": "lea",
  "display_name": "Léa",
  "role": "CHILD",
  "pin": "0000",
  "face": true,
  "voice": true
}
```

3. Sauver locale via préférences HUD / Core :

```json
{
  "type": "preferences",
  "action": "save_hud_preferences",
  "user_id": "<id>",
  "prefs": {
    "locale": {
      "preferredLanguage": "fr",
      "secondaryLanguages": [],
      "mode": "mirror",
      "voicePreset": "jarvis_soft",
      "faceId": "lea_001"
    }
  }
}
```

4. Holomat optionnel : `face_enroll_begin` → frames → `face_enroll_commit` + `user_id`.
5. Liste foyer : `{ "type": "auth", "action": "list_users" }` → `auth_users`.
6. Confirmer : membre inscrit ; au lock, face/voix → profil + langue + TTS.

## UI miroir

HUD Paramètres → **FOYER** — même flux. Pas de double admin dans Dashboard lifestyle.
