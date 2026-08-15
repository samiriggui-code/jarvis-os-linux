"""Smoke — routing TTS prod (ElevenLabs nominal, Voicebox gated)."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.personality import (  # noqa: E402
    CLAUDE_ELEVENLABS_VOICE_ID,
    CURSOR_ELEVENLABS_VOICE_ID,
    HERMES_ELEVENLABS_VOICE_ID,
    JARVIS_ELEVENLABS_VOICE_ID,
    resolve_elevenlabs_voice_id,
)
from jarvis_core.voice.cache import VoiceCache  # noqa: E402
from jarvis_core.voice.manager import VoiceManager  # noqa: E402
from jarvis_core.voice.tts_config import voicebox_tts_enabled  # noqa: E402
from jarvis_core.voice.voicebox import VoiceboxClient  # noqa: E402

FAKE_WAV = b"RIFF\x00\x00\x00\x00WAVE"


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    print(f"  {status} — {label}" + (f" ({detail})" if detail else ""))
    if not cond:
        raise SystemExit(1)


def _manager_with_mock_client() -> tuple[VoiceManager, MagicMock]:
    client = MagicMock(spec=VoiceboxClient)
    client.base = "http://127.0.0.1:17600"
    client.resolve_profile_id = AsyncMock(return_value="profile-uuid")
    client.synthesize = AsyncMock(return_value=FAKE_WAV)
    client.health = AsyncMock(return_value={"backend": "cpu"})
    mgr = VoiceManager(client=client)
    mgr.available = True
    return mgr, client


async def test_voicebox_tts_disabled_jarvis_elevenlabs() -> None:
    os.environ["JARVIS_VOICEBOX_TTS"] = "0"
    os.environ["JARVIS_ELEVENLABS_FALLBACK"] = "1"
    os.environ["ELEVENLABS_API_KEY"] = "sk_test_smoke"

    mgr, client = _manager_with_mock_client()
    with patch(
        "jarvis_core.voice.elevenlabs.ElevenLabsLive"
    ) as live_cls:
        live = live_cls.return_value
        live.enabled = True
        live._key = "sk_test_smoke"
        live.synthesize = AsyncMock(return_value=FAKE_WAV)

        ev = await mgr.speak(
            "Phrase dynamique smoke jarvis.",
            speaker_entity="jarvis",
        )

    check("voicebox synthesize not called", client.synthesize.await_count == 0)
    check("resolve_profile not called", client.resolve_profile_id.await_count == 0)
    check("tts_audio", ev.get("type") == "tts_audio")
    check("provider elevenlabs", ev.get("provider") == "elevenlabs")
    check(
        "voice_id jarvis3",
        ev.get("voice_id") == JARVIS_ELEVENLABS_VOICE_ID,
        ev.get("voice_id"),
    )
    live.synthesize.assert_awaited_once()
    args, kwargs = live.synthesize.await_args
    check("synth voice_id arg", kwargs.get("voice_id") == JARVIS_ELEVENLABS_VOICE_ID)


async def test_voicebox_tts_disabled_hermes_elevenlabs() -> None:
    os.environ["JARVIS_VOICEBOX_TTS"] = "0"
    os.environ["JARVIS_ELEVENLABS_FALLBACK"] = "1"
    os.environ["ELEVENLABS_API_KEY"] = "sk_test_smoke"

    mgr, client = _manager_with_mock_client()
    with patch("jarvis_core.voice.elevenlabs.ElevenLabsLive") as live_cls:
        live = live_cls.return_value
        live.enabled = True
        live._key = "sk_test_smoke"
        live.synthesize = AsyncMock(return_value=FAKE_WAV)

        ev = await mgr.speak("Analyse terminée.", speaker_entity="hermes")

    check("voicebox skipped hermes", client.synthesize.await_count == 0)
    check("hermes tts_audio", ev.get("type") == "tts_audio")
    check(
        "hermes voice_id",
        ev.get("voice_id") == HERMES_ELEVENLABS_VOICE_ID,
        ev.get("voice_id"),
    )


async def test_voicebox_tts_disabled_profiles_present_no_call() -> None:
    os.environ["JARVIS_VOICEBOX_TTS"] = "0"
    os.environ["JARVIS_ELEVENLABS_FALLBACK"] = "1"
    os.environ["ELEVENLABS_API_KEY"] = "sk_test_smoke"

    mgr, client = _manager_with_mock_client()
    client.resolve_profile_id = AsyncMock(return_value="jarvis3-uuid")

    with patch("jarvis_core.voice.elevenlabs.ElevenLabsLive") as live_cls:
        live = live_cls.return_value
        live.enabled = True
        live._key = "sk_test_smoke"
        live.synthesize = AsyncMock(return_value=FAKE_WAV)

        await mgr.speak("Test profils présents.", speaker_entity="jarvis")

    check("no profile lookup", client.resolve_profile_id.await_count == 0)
    check("no voicebox synth", client.synthesize.await_count == 0)


async def test_voicebox_tts_enabled_path_available() -> None:
    os.environ["JARVIS_VOICEBOX_TTS"] = "1"
    os.environ["JARVIS_ELEVENLABS_FALLBACK"] = "1"

    mgr, client = _manager_with_mock_client()
    client.resolve_profile_id = AsyncMock(return_value="jarvis3-uuid")
    client.synthesize = AsyncMock(return_value=FAKE_WAV)

    ev = await mgr.speak("Benchmark voicebox.", speaker_entity="jarvis")

    check("voicebox enabled flag", voicebox_tts_enabled())
    check("profile resolved", client.resolve_profile_id.await_count == 1)
    check("voicebox synthesize called", client.synthesize.await_count == 1)
    check("voicebox tts_audio", ev.get("type") == "tts_audio")
    check("no elevenlabs via", ev.get("via") != "elevenlabs")


def test_cache_hit_no_dynamic_provider() -> None:
    cache = VoiceCache.__new__(VoiceCache)
    cache.voice_name = "jarvis3"
    cache.root = Path("/tmp/unused")
    cache._counter = 0
    cache.entries = [{"event": "boot_ok", "file": "x.wav", "text": "Prêt."}]
    cache.by_event = {"boot_ok": cache.entries}
    cache.last_error = None

    wav_read = patch.object(
        Path,
        "read_bytes",
        return_value=FAKE_WAV,
        create=True,
    )
    with wav_read:
        entry_path = MagicMock()
        entry_path.exists.return_value = True
        entry_path.read_bytes.return_value = FAKE_WAV
        with patch.object(cache, "select", return_value=cache.entries[0]):
            with patch.object(type(cache.root), "__truediv__", return_value=entry_path):
                ev = cache.play("boot_ok")

    check("cache hit tts_audio", ev is not None and ev.get("type") == "tts_audio")
    check("cache source", ev.get("source") == "cache")
    check("no provider field", "provider" not in (ev or {}))


def test_resolve_voice_ids() -> None:
    check(
        "jarvis to jarvis3 EL",
        resolve_elevenlabs_voice_id("jarvis") == JARVIS_ELEVENLABS_VOICE_ID,
    )
    check(
        "jarvis not claude asset",
        resolve_elevenlabs_voice_id("jarvis") != CLAUDE_ELEVENLABS_VOICE_ID,
    )
    check(
        "hermes EL",
        resolve_elevenlabs_voice_id("hermes") == HERMES_ELEVENLABS_VOICE_ID,
    )
    check(
        "claude EL",
        resolve_elevenlabs_voice_id("claude") == CLAUDE_ELEVENLABS_VOICE_ID,
    )
    check(
        "cursor EL",
        resolve_elevenlabs_voice_id("cursor") == CURSOR_ELEVENLABS_VOICE_ID,
    )
    check(
        "claude never jarvis3",
        resolve_elevenlabs_voice_id("claude") != JARVIS_ELEVENLABS_VOICE_ID,
    )
    check(
        "cursor never jarvis3",
        resolve_elevenlabs_voice_id("cursor") != JARVIS_ELEVENLABS_VOICE_ID,
    )


async def test_unknown_speaker_no_cross_voice() -> None:
    os.environ["JARVIS_VOICEBOX_TTS"] = "0"
    os.environ["JARVIS_ELEVENLABS_FALLBACK"] = "1"
    os.environ["ELEVENLABS_API_KEY"] = "sk_test_smoke"

    mgr, client = _manager_with_mock_client()
    with patch("jarvis_core.voice.elevenlabs.ElevenLabsLive") as live_cls:
        live = live_cls.return_value
        live.enabled = True
        live._key = "sk_test_smoke"
        live.synthesize = AsyncMock(return_value=FAKE_WAV)

        ev = await mgr.speak("Hello.", speaker_entity="unknown_agent")

    check("unknown skipped", ev.get("type") == "tts_skipped")
    check("unknown reason", ev.get("reason") == "tts_unavailable_for_entity")
    check("elevenlabs not called", live.synthesize.await_count == 0)
    check("voicebox not called", client.synthesize.await_count == 0)


def test_default_voicebox_tts_off() -> None:
    os.environ.pop("JARVIS_VOICEBOX_TTS", None)
    check("default voicebox tts off", not voicebox_tts_enabled())


def main() -> None:
    print("-- TTS routing smokes --")
    test_default_voicebox_tts_off()
    test_resolve_voice_ids()
    test_cache_hit_no_dynamic_provider()
    asyncio.run(test_voicebox_tts_disabled_jarvis_elevenlabs())
    asyncio.run(test_voicebox_tts_disabled_hermes_elevenlabs())
    asyncio.run(test_voicebox_tts_disabled_profiles_present_no_call())
    asyncio.run(test_voicebox_tts_enabled_path_available())
    asyncio.run(test_unknown_speaker_no_cross_voice())
    print("\nTous les tests TTS routing OK.")


if __name__ == "__main__":
    main()
