# Voicebox Qwen — import test (2026-08-14)

## A — RÉFÉRENCES

| Profil | Fichier source | Format source | Durée source | Mapping |
|--------|----------------|---------------|--------------|---------|
| **jarvis3** | `Downloads/ElevenLabs_*_jarvis3_ivc_*.mp3` | MP3 mono 44.1 kHz 128 kbps | **61.6 s** | JARVIS |
| **jarvis** | `Downloads/ElevenLabs_*_jarvis _gen_*.mp3` | idem | **62.6 s** | CLAUDE |
| **jarvis2** | `Downloads/ElevenLabs_*_Jarvis2_gen_*.mp3` | idem | **59.4 s** | CURSOR |
| **hermes** | `Downloads/ElevenLabs_*_Ingrid - Warm..._pvc_*.mp3` | idem | **70.0 s** | HERMES (expérimental — voix Ingrid, **pas** `HuLbOdhRlvQQN8oPP0AJ`) |

Copies locales : `deploy/voicebox-test/references/ref-*.mp3`

### Conversion obligatoire (limite Voicebox)

**Erreur API sans conversion :**
`Invalid reference audio: Audio too long (maximum 30.0 seconds)`

| Étape | Détail |
|-------|--------|
| Copie de travail | `normalized/ref-*-29s.wav` |
| ffmpeg | `-t 29 -ac 1 -ar 24000` (mono 24 kHz PCM) |
| Transcript associé | **2 premiers paragraphes** (`reference_transcript_29s.txt`) — pas le transcript complet 60 s |
| Sources | **non modifiées** |

## B — PROFILS CRÉÉS (persistants après restart)

| name | UUID | voice_type | default_engine | sample_count |
|------|------|------------|----------------|--------------|
| jarvis3 | `ac8c227f-14b3-49bf-9968-819af0e361b2` | cloned | qwen | 1 |
| jarvis | `0d7716a0-3c20-4438-9a77-8426104b2aae` | cloned | qwen | 1 |
| jarvis2 | `163de466-c09d-42fd-9b8a-ea03d186a163` | cloned | qwen | 1 |
| hermes | `ef141d56-ee58-487d-8009-214b266420f1` | cloned | qwen | 1 |

Stockage VPS : `/app/data/profiles/{uuid}/{sample-uuid}.wav` + SQLite `voicebox.db`

## C — ENGINE

| Paramètre | Valeur |
|-----------|--------|
| Moteur | **qwen** (Qwen3-TTS) |
| Modèle | **0.6B** (téléchargé ~70 s au 1er `/generate`) |
| Runtime | CPU PyTorch, pas de GPU |
| RAM voicebox | ~5.5 GiB / 12 GiB limite docker |
| CPU synth | ~120–133 % (multi-thread) |

## D — JARVIS3

Phrase test (hors référence) : *« Le noyau répond correctement. J'effectue maintenant une vérification des services disponibles. »*

| Run | HTTP | Latence | WAV | Durée audio |
|-----|------|---------|-----|-------------|
| cold (1ère synth post-download) | 200 | **97.4 s** | 353 KB | 7.36 s |
| warm | 200 | **40.5 s** | 85 KB | 1.76 s |

## E — CLAUDE / jarvis

Phrase : *« Analyse terminée. Les données sont cohérentes… »*

| HTTP | Latence | Durée audio |
|------|---------|-------------|
| 200 | **70.4 s** | 4.88 s |

## F — CURSOR / jarvis2

| HTTP | Latence | Durée audio | ⚠️ |
|------|---------|-------------|-----|
| 200 | 28.3 s | **0.24 s** | Synthèse quasi vide — **clone instable / échec qualitatif** |

## G — HERMES

| HTTP | Latence | Durée audio |
|------|---------|-------------|
| 200 | **105.9 s** | 8.48 s |

Comparaison ElevenLabs prod (`HuLbOdhRlvQQN8oPP0AJ`) : **non faite ici** — référence Voicebox = voix Ingrid ElevenLabs, pas la voix Hermes prod.

## H — VOICE_INSTRUCT (jarvis3, qwen)

Même phrase JARVIS3.

| Variante | HTTP | Latence | Durée audio |
|----------|------|---------|-------------|
| neutre | 200 | 43.6 s | 1.84 s |
| styled (*Calm, composed…*) | 200 | 57.4 s | 3.36 s |

Support API : **oui** (`instruct` accepté, max 500 chars). Différence audible : **à juger par Samir** (fichiers instruct séparés).

## I — RESSOURCES

- Download modèle 0.6B : ~70 s
- Cold synth jarvis3 : 97 s
- Warm synth typique : **28–106 s** selon voix/longueur
- RAM : 5.5 GiB
- **Verdict latence : trop lente** pour voix interactive principale (seuil ~2–3 s)

## J — PERSISTANCE

`docker restart voicebox` → **4 profils + samples intacts** (`GET /profiles` OK).

## K — AUDIOS À ÉCOUTER

Local (téléchargés depuis VPS) :

```
deploy/voicebox-test/output/voicebox-test-jarvis3.wav
deploy/voicebox-test/output/voicebox-test-jarvis3-cold.wav
deploy/voicebox-test/output/voicebox-test-jarvis.wav
deploy/voicebox-test/output/voicebox-test-jarvis2.wav   ← suspect (0.24 s)
deploy/voicebox-test/output/voicebox-test-hermes.wav
deploy/voicebox-test/output/voicebox-test-jarvis3-instruct-neutral.wav
deploy/voicebox-test/output/voicebox-test-jarvis3-instruct-styled.wav
```

VPS : `/tmp/voicebox-test/output/` (même fichiers)

## L — CORE

- `resolve_voice()` : **NON modifié**
- `VoiceManager` / fallback ElevenLabs : **NON modifié**
- Personality : **NON modifié**
- HUD : **NON modifié**

## M — RECOMMANDATION (technique — fidélité = Samir)

| Entité | Voicebox principal ? | Notes |
|--------|---------------------|-------|
| **JARVIS** | **Non** (latence) | Clone qwen fonctionne ; 40–97 s/phrase CPU |
| **CLAUDE** | **Non** | Synthèse OK techniquement |
| **CURSOR** | **Non / rejeté** | Output 0.24 s — recloner |
| **HERMES** | **Non** | Garder ElevenLabs primaire ; test VB expérimental seulement |

ElevenLabs reste **fallback + primaire Hermes**.

## N — NEXT

**Écouter les 7 WAV** dans `deploy/voicebox-test/output/` et confirmer si la fidélité Qwen vaut la latence ; si oui partiellement → recloner **jarvis2** avec clip 30 s mieux aligné + tester **1.7B** ou GPU avant toute bascule Core.
