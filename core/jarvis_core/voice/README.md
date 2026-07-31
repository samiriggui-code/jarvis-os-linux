# Voice Manager (§3.4)

TTS / STT via **voicebox**, appelé en **HTTP** comme service séparé.
`vendor/voicebox-main` reste en lecture seule — même règle que Hermes
(`vendor/README.md`). Rien n'est copié ici.

```
HUD ──WS──> Core ──HTTP──> voicebox
 ▲                            │
 └──── WAV base64 ────────────┘   le HUD joue le son
```

## Pourquoi le HUD joue le son

`POST /speak` de voicebox est un job asynchrone qui sort le son sur la carte
son de *sa* machine. En dev le son sortirait du PC et pas du HUD. On utilise
`POST /generate/stream` (WAV direct, ni disque ni polling), le Core relaie le
WAV au HUD et le HUD le joue. Conséquences :

- **barge-in** possible (couper la voix quand l'utilisateur parle)
- **périphérique de sortie** = `hud_preferences.voice.outputDeviceId`
- l'orbe repasse en standby sur le **vrai** `voice/playback end`, plus sur un
  `sleep(0.4)` à l'aveugle

## Contrat WebSocket

| Sens | Message |
|---|---|
| Core → HUD | `tts_audio` `{ utterance_id, format:"wav", audio_b64, voice, … }` |
| Core → HUD | `tts_fallback` `{ utterance_id, text, reason }` |
| Core → HUD | `tts_skipped` `{ utterance_id, reason }` |
| Core → HUD | `voice_status`, `component_state` |
| HUD → Core | `{ type:"voice", action:"playback", phase:"start"\|"end", utterance_id }` |
| HUD → Core | `{ type:"voice", action:"status"\|"speak"\|"cancel"\|"transcribe"\|"save_profile" }` |

Types TS : `hud/src/app/bridge/hudContracts.ts`. Lecture : `hud/src/app/bridge/ttsCore.ts`.

## Dégradation

Voicebox absent, en erreur, ou modèle en téléchargement → `tts_fallback` et le
HUD parle avec `SpeechSynthesis` (`ttsDev.ts`). **JARVIS BASE reste vocal sans
voicebox.** Après une panne, le Core ne retente pas avant 30 s (`RETRY_AFTER_S`)
pour ne pas ajouter un timeout de 60 s à chaque phrase.

## Voix par utilisateur

Le HUD choisit un **preset** (`locale.voicePreset`), pas un moteur. Le mapping
preset → profil voicebox vient de l'env :

| Env | Défaut |
|---|---|
| `JARVIS_VOICEBOX_URL` | `http://127.0.0.1:17600` |
| `JARVIS_VOICEBOX_PROFILE_FR` | `jarvis-fr` |
| `JARVIS_VOICEBOX_PROFILE_EN` | `jarvis-en` |
| `JARVIS_VOICEBOX_PROFILE_SOFT` | `jarvis-soft` |

`core/data/users/<id>/voice_profile` surcharge le preset — c'est le crochet pour
donner à chaque membre du foyer sa voix clonée une fois son visage reconnu.
La langue de réponse est arbitrée par `jarvis_core/locale.py`, pas ici.

## Choix de moteur

`luxtts` par défaut (~1 Go VRAM, 150x realtime CPU) : le conversationnel a
besoin de latence, pas de clonage. Réserver `qwen` aux phrases pré-générées
(boot, réveil, alertes).

## Démarrer voicebox

```bash
cd vendor/voicebox-main && docker compose up   # → 127.0.0.1:17600
```

Puis créer un profil de voix par preset dans l'UI voicebox. Sans profil, le
Core renvoie `tts_fallback` avec `reason: no_profile`.

Vérifier depuis le Core :

```bash
python -c "import asyncio; from jarvis_core.voice import VoiceManager; \
  vm=VoiceManager(); print(asyncio.run(vm.probe()), vm.status())"
```
