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

- Premier user = ADMIN (Dashboard) — **first_run uniquement**.
- Membres foyer via kiosk = **USER uniquement** (jamais ADMIN ici).
- Timbre / face : flags Core aujourd’hui ; voiceprint = pipeline Voice plus tard.
- Ne jamais enroler un second ADMIN via cette skill.
- Kiosk NUC : **pas de clavier/souris** — prénom à la voix, Jarvis répète,
  confirmation oui/non ; même principe pour la capture faciale.

## Prérequis

Session Core active avec `user_management` ou `dashboard_access`.

## Étapes

1. Collecter `display_name`, `username`, `role` ∈ {USER, CHILD}, PIN optionnel,
   et locale : `preferredLanguage`, `secondaryLanguages`, `voicePreset`
   (enfant → `jarvis_soft`).
2. **Ouvrir le kiosk maison** (caméra NUC) — obligatoire pour Holomat :

```json
{
  "type": "auth",
  "action": "start_enrollment",
  "username": "lea",
  "display_name": "Léa",
  "role": "CHILD"
}
```

   Équivalent vocal admin : « Jarvis, enrôle Léa » → intention `hud.enroll`.
   Le Core diffuse `hud_command/start_enrollment` à tous les HUD ; le kiosk
   ouvre FirstSetupScene (face + voix sur la caméra salon).

3. Après capture kiosk, créer le profil (si pas déjà fait par le HUD) :

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

4. Sauver locale via préférences HUD / Core :

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

5. Holomat : géré par le kiosk (`face_enroll_begin` → frames → `face_enroll_commit`).
6. Liste foyer : `{ "type": "auth", "action": "list_users" }` → `auth_users`.
7. Confirmer : membre inscrit ; au lock, face/voix → profil + langue + TTS.

## UI miroir

HUD Paramètres → **FOYER** — même flux. Pas de double admin dans Dashboard lifestyle.
