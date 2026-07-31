# Bridge HUD React ↔ Core

Fichiers : `src/app/bridge/hudContracts.ts`

Prépare l’harmonisation **jarvis_ai** (voix / agent / panels) + **Holomat** (caméra / gestes / auth session) sans câbler encore le réseau.

| Domaine | Events clés | Backend cible |
|---------|-------------|----------------|
| Voix | `voice_start/stop`, transcripts, barge-in | Voice Manager ← jarvis_ai pipeline |
| Orbe / agent | `set_orb_state`, `agent_status`, approvals | Core + Hermes |
| Holomat | `holomat_status`, `gesture_detected`, `holomat_calibrate_*` | Holomat Manager ← vendor/vision |
| Session | `session_auth` multi-facteurs | Core Policy + Holomat + Voice |
| Prefs | `save_hud_preferences`, `save_gesture_profile` | profils user (§6.8) |

Settings HUD (`SettingsPanel`) = **expérience seulement**. Clés API / providers → Dashboard.
