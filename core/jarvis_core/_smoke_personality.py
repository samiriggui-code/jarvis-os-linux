"""Smoke — Personality Resolver V1 (déterministe, sans LLM)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.personality import (  # noqa: E402
    BackendAvailability,
    HERMES_ELEVENLABS_VOICE_ID,
    LLMCallMode,
    PersonalityRequest,
    SpeakerEntity,
    HumorLevel,
    resolve_personality,
    resolve_elevenlabs_voice_id,
    resolve_voice_asset,
    get_entity,
)
from jarvis_core.personality.principles import JARVIS_IDENTITY_CORE, MAJORDOME_RULES  # noqa: E402
from jarvis_core.personality.resolver import build_system_message  # noqa: E402
from jarvis_core.personality.voice_map import JARVIS_MAIN_ASSET  # noqa: E402
from jarvis_core.voice.profiles import resolve_voice  # noqa: E402


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    print(f"  {status} — {label}" + (f" ({detail})" if detail else ""))
    if not cond:
        raise SystemExit(1)


def test_admin_chat() -> None:
    r = resolve_personality(
        PersonalityRequest(
            speaker=SpeakerEntity.JARVIS,
            user_role="admin",
            context=LLMCallMode.NARRATIVE,
            language="fr",
            title="monsieur",
        )
    )
    check("narrative on", r.apply_narrative)
    check("humor subtle", r.humor == HumorLevel.SUBTLE)
    check("majordome", "majordome" in r.register)
    check("monsieur in instructions", "monsieur" in r.system_instructions)


def test_child() -> None:
    r = resolve_personality(
        PersonalityRequest(
            speaker=SpeakerEntity.JARVIS,
            user_role="child",
            context=LLMCallMode.NARRATIVE,
            user_name="Syrine",
        )
    )
    check("child-safe", r.child_safe)
    check("simple tech", r.technical_level.value == "simple")
    check("prénom", "Syrine" in r.system_instructions)
    check("pas ironie", "ironie ambiguë" in r.system_instructions)
    check("voice instruct", r.voice_instruct is not None)


def test_critical_alert() -> None:
    r = resolve_personality(
        PersonalityRequest(
            context=LLMCallMode.ALERT,
            severity="critical",
        )
    )
    check("humor off", r.humor == HumorLevel.OFF)
    check("alert register", r.register == "alert")
    check("interdit humour", "interdit" in r.system_instructions.lower())


def test_composer_off() -> None:
    r = resolve_personality(PersonalityRequest(context=LLMCallMode.COMPOSER))
    check("narrative off", not r.apply_narrative)
    check("humor off", r.humor == HumorLevel.OFF)
    sys_msg = build_system_message(r)
    check("pas majordome", "majordome technologique" not in sys_msg)
    check("format strict", "format" in sys_msg.lower())


def test_architecture() -> None:
    r = resolve_personality(
        PersonalityRequest(
            context=LLMCallMode.ARCHITECTURE,
            user_role="admin",
        )
    )
    check("narrative on", r.apply_narrative)
    check("advanced", r.technical_level.value == "advanced")
    check("payload only", "payload" in r.system_instructions.lower())


def test_entities() -> None:
    j = get_entity(SpeakerEntity.JARVIS)
    check("jarvis connected", j.backend == BackendAvailability.CONNECTED)
    check("jarvis asset jarvis3", j.voice_cache_folder == JARVIS_MAIN_ASSET)
    c = get_entity(SpeakerEntity.CLAUDE)
    check("claude not connected", c.backend == BackendAvailability.NOT_CONNECTED)
    check("claude voice folder", c.voice_cache_folder == "jarvis")
    cur = get_entity(SpeakerEntity.CURSOR)
    check("cursor jarvis2", cur.voice_cache_folder == "jarvis2")
    h = get_entity(SpeakerEntity.HERMES)
    check("hermes connected backend", h.backend == BackendAvailability.CONNECTED)
    check("hermes can speak", h.can_speak)
    check("hermes elevenlabs id", h.elevenlabs_voice_id == HERMES_ELEVENLABS_VOICE_ID)
    check("hermes cache folder", h.voice_cache_folder == "hermes")
    check(
        "resolve hermes voice",
        resolve_elevenlabs_voice_id(SpeakerEntity.HERMES) == HERMES_ELEVENLABS_VOICE_ID,
    )


def test_voice_mapping() -> None:
    check(
        "jarvis to jarvis3",
        resolve_voice_asset("jarvis", preset="jarvis_fr") == "jarvis3",
    )
    check(
        "jarvis not historical jarvis asset",
        resolve_voice_asset("jarvis", preset="jarvis_fr") != "jarvis",
    )
    check("claude to jarvis", resolve_voice_asset("claude") == "jarvis")
    check("cursor to jarvis2", resolve_voice_asset("cursor") == "jarvis2")
    check("hermes to hermes", resolve_voice_asset("hermes") == "hermes")

    sel_j = resolve_voice("smoke-u", preset="jarvis_fr", speaker_entity="jarvis")
    check("resolve_voice jarvis3", sel_j.profile == "jarvis3")
    check("resolve_voice jarvis not jarvis2", sel_j.profile != "jarvis2")

    sel_c = resolve_voice("smoke-u", preset="jarvis_fr", speaker_entity="claude")
    check("resolve_voice claude asset", sel_c.profile == "jarvis")

    sel_cur = resolve_voice("smoke-u", preset="jarvis_fr", speaker_entity="cursor")
    check("resolve_voice cursor asset", sel_cur.profile == "jarvis2")

    sel_child = resolve_voice("smoke-u", preset="jarvis_soft", speaker_entity="jarvis")
    check("child jarvis_soft", sel_child.profile == "jarvis-soft")

    sel_claude_soft = resolve_voice("smoke-u", preset="jarvis_soft", speaker_entity="claude")
    check("claude ignore soft", sel_claude_soft.profile == "jarvis")


def test_operator_prompt_hierarchy() -> None:
    r = resolve_personality(
        PersonalityRequest(
            speaker=SpeakerEntity.JARVIS,
            user_role="child",
            context=LLMCallMode.NARRATIVE,
        )
    )
    legacy = "Tu es JARVIS, assistant IA français. Réponds brièvement."
    sys_msg = build_system_message(r, operator_instructions=legacy)
    check("personality preserved", JARVIS_IDENTITY_CORE.split(".")[0] in sys_msg)
    check("child rules preserved", "enfant" in sys_msg.lower())
    check("majordome preserved", "majordome" in sys_msg.lower() or "Registre majordome" in sys_msg)
    check("operator appended", legacy in sys_msg)
    check("operator not sole content", MAJORDOME_RULES.split(":")[0] in sys_msg)

    comp = resolve_personality(PersonalityRequest(context=LLMCallMode.COMPOSER))
    comp_msg = build_system_message(comp, operator_instructions=legacy)
    check("composer no majordome", "majordome technologique" not in comp_msg)
    check("composer operator append", legacy in comp_msg)


def test_fake_agent_forbidden() -> None:
    c = get_entity(SpeakerEntity.CLAUDE)
    cur = get_entity(SpeakerEntity.CURSOR)
    check("claude cannot speak without backend", not c.can_speak)
    check("cursor cannot speak without backend", not cur.can_speak)


def main() -> None:
    print("-- Personality V1 resolver --")
    test_admin_chat()
    test_child()
    test_critical_alert()
    test_composer_off()
    test_architecture()
    test_entities()
    test_voice_mapping()
    test_operator_prompt_hierarchy()
    test_fake_agent_forbidden()
    print("\nTous les tests personality OK.")


if __name__ == "__main__":
    main()
