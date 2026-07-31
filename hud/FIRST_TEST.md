# Premier test JARVIS — HUD + Core + OpenRouter + voix Windows

Objectif : entendre JARVIS répondre via OpenRouter, avec auth cinéma HUD + TTS stub Windows.
Hermes / Piper / Whisper = **plus tard** (vendor refs). Ne les monte pas pour ce premier test.

## Architecture du test

```
[HUD hud/ :5173]
   │  WebSocket
   ▼
[Core core/ :8765] ── OpenRouter (Qwen…) ──► réponse
   │
   └─ display_notification → HUD TTS stub (Windows SpeechSynthesis FR)
```

Auth scènes = encore cinéma local (simulateur). DB User Manager Core = prête, bridge enroll HUD = étape suivante.

---

## 0. Choisir ta voix Windows (IMPORTANT)

1. Ouvre Chrome → F12 → Console
2. Colle :
```js
speechSynthesis.getVoices().filter(v => v.lang.startsWith('fr')).map(v => v.name)
```
3. Choisis une voix, ex. `Microsoft Hortense` ou `Microsoft Paul`
4. Dans `hud/.env.development` :
```
VITE_TTS_VOICE_NAME=Microsoft Hortense
```
5. Redémarre `npm run dev` du HUD

Si la liste est vide : tape d’abord `speechSynthesis.getVoices()` puis réessaie (Chrome charge les voix en async).

**Piper / ElevenLabs** : pas pour ce test. Cahier §3.4 → stub Windows jusqu’à `jarvis-voice`.

---

## 1. Core + OpenRouter

```powershell
cd c:\laragon\www\jarvis-os-linux\core
.\.venv\Scripts\activate
pip install -r requirements.txt

copy .env.example .env
# Édite .env → colle ta clé OPENROUTER_API_KEY (jamais dans git)

python -m jarvis_core
```

Tu dois voir : `mode=cloud` et `Auth prêt`.

---

## 2. Dashboard (optionnel)

```powershell
cd c:\laragon\www\jarvis-os-linux\dashboard
npm run dev
# :5174
```

---

## 3. HUD

```powershell
cd c:\laragon\www\jarvis-os-linux\hud
npm run dev
# :5173
```

Notif attendue : **Core en ligne**.

---

## 4. Parcours test

1. **Auth cinéma** : FirstSetup / Auth / skip `?skipAuth=1`
2. Console de commande : tape `Bonjour Jarvis, présente-toi.`
3. Si Core online → OpenRouter répond → **voix Windows parle**
4. TopBar cadenas → LockScene
5. Icône cerveau → AdminAuthScene → Dashboard

---

## Dépannage

| Symptoôme | Fix |
|-----------|-----|
| Core hors ligne | `python -m jarvis_core` + firewall |
| mode=system | clé absente dans `core/.env` |
| Pas de voix | `VITE_TTS_STUB=true` + voix FR installée Windows |
| Double parole | normalement évité (Core parle, orbe locale se tait si Core online) |
| Erreur OpenRouter | modèle / crédit / clé — regarde le log Core |

---

## Prochaines étapes (après ce test)

1. FirstSetupScene → `auth enroll` Core (DB réelle)
2. AuthScene → `auth login`
3. `jarvis-voice` (Piper) quand tu quittes le stub Windows
4. Hermes Agent HTTP `:8642` (cerveau outils) — séparé du Provider Manager chat
