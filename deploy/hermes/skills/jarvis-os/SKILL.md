---
name: jarvis-os
description: >-
  Loi produit JARVIS OS pour Hermes : protocole vocal, Policy, rôles foyer,
  Dashboard admin-only, cycle micro veille. Charger dès qu’une demande touche
  la maison, la voix, Holomat, le Dashboard, l’auth, ou l’architecture OS.
  CE N’EST PAS UN MOCK — règles opérationnelles réelles.
---

# Skill — JARVIS OS (loi produit)

## Non-négociable

```
IA → Proposition → Policy Engine → Autorisation → Exécution
```

Jamais IA → root. Secrets hors réponses TTS. Hermes **orchestre** ; Core **applique**.

## Protocole vocal

| Phase | Comportement |
|-------|----------------|
| Veille | Micro repos ; wake « Jarvis » seul |
| Réveil | Sort de léthargie |
| Commande | Doit commencer par « Jarvis … » sinon **ignorer** |
| Réflexion / réponse | STT commande off ou borné |
| Fin de cycle | Retour veille |

Test micro HUD = RMS orbe bas-gauche, **zéro** STT commande.

## Rôles

| Rôle | Accès |
|------|--------|
| ADMIN | HUD + Dashboard + hermes/tools/agents + user_management |
| USER | HUD + maison/média/apps |
| CHILD | HUD limité + média/apps limités |
| GUEST | HUD basique |

Seul ADMIN a `dashboard_access`. Les membres famille n’ouvrent **jamais** le Dashboard.

## Auth / lock

1. Lock session HUD → logout Core.
2. Auth Holomat / PIN / (futur) timbre → `auth.login` → profil actif.
3. Elevation Dashboard : `auth.elevate` seulement si `dashboard_access`.

## Enrollment famille

Utiliser skill **family-enroll** + Core WS `auth.enroll` avec `role: USER|CHILD`.
Après first_run, enrollment réservé à une session admin.

## Services (unitaire)

Un service systemd par fonction (`jarvis-core`, `jarvis-hud`, `jarvis-voice`, …).
Ne jamais concevoir un monolithe. LLM uniquement via AI Provider Manager
(Ollama VPS → OpenRouter → mode système).

## Apps HUD / VPS

Skill **hud-apps** : chaque app a un `hermesTool` + `risk`. Terminal/Docker/Code/Stockage =
**VPS limité** (allowlist + confirmation ADMIN). Outils nouveaux via `outils` / tool_manager.
Dashboard (`hub`) = ADMIN seul.

## Ce que tu ne inventes pas

- Pas de droits magiques pour un appareil découvert.
- Pas de « mode démo » qui ignore Policy ou le préfixe Jarvis.
- Pas de fusion Dashboard dans le HUD expérience Settings.
- Pas de shell root libre sur le VPS.
