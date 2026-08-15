"""Smoke M2.2 — re-observation HA indépendante pour home.control.

ACTION → appel HA → re-lecture indépendante get_state() → comparaison
état attendu/réel → RESULT_VALIDATED / DISPUTED / FAILED.

Sans réseau réel : un faux HomeAssistantAdapter (méthode `inventory` async)
tient lieu de HA — mêmes objets `Entity` que le code réel, mêmes chemins.

    python -m jarvis_core._smoke_verification_home_m22
"""
from __future__ import annotations

import asyncio
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


class _FakeHass:
    """Simule HomeAssistantAdapter.inventory() — pas de réseau."""

    def __init__(self, entities: list, *, raise_on_read: Exception | None = None) -> None:
        self._entities = entities
        self._raise = raise_on_read
        self.calls = 0

    async def inventory(self, *, force: bool = False) -> list:
        self.calls += 1
        if self._raise is not None:
            raise self._raise
        return self._entities


def _entity(entity_id: str, state: str, attributes: dict | None = None):
    from jarvis_core.homeassistant import Entity

    return Entity(
        entity_id=entity_id,
        name=entity_id,
        state=state,
        area=None,
        attributes=attributes or {},
    )


async def test_turn_off_validated() -> None:
    from jarvis_core.verification_hooks import _observe_home_reobserve

    hass = _FakeHass([_entity("media_player.chambre_chambre", "off")])
    orch = SimpleNamespace(hass=hass)
    result = {
        "ok": True,
        "action": "off",
        "pre_state": "playing",
        "entity_id": "media_player.chambre_chambre",
        "service": "media_player.turn_off",
        "changed": [],
    }
    obs = await _observe_home_reobserve(result, orch=orch)
    assert obs.success is True, obs.observed
    assert "post_state='off'" in obs.observed
    print("  OK — turn_off réellement observé off → success")


async def test_turn_off_disputed_when_state_unchanged() -> None:
    """Cas Sony Bravia : HA répond ok mais l'appareil ne change pas d'état."""
    from jarvis_core.verification_hooks import _observe_home_reobserve

    hass = _FakeHass([_entity("media_player.bravia_kdl_40ex521", "idle")])
    orch = SimpleNamespace(hass=hass)
    result = {
        "ok": True,
        "action": "off",
        "pre_state": "idle",
        "entity_id": "media_player.bravia_kdl_40ex521",
        "service": "media_player.turn_off",
        "changed": [],
    }
    obs = await _observe_home_reobserve(result, orch=orch)
    assert obs.success is False, obs.observed
    assert "pas dans" in obs.observed, obs.observed
    print("  OK — HA claim ok mais état inchangé → DISPUTED (pas VALIDATED)")


async def test_online_is_not_proof_of_action() -> None:
    """Cas de smoke obligatoire : ONLINE/joignable ≠ action réussie."""
    from jarvis_core.verification_hooks import _observe_home_reobserve

    # L'entité répond (joignable, "online" au sens large) mais reste dans son
    # état d'avant : l'action "toggle" n'a visiblement pas pris effet.
    hass = _FakeHass([_entity("switch.salon_freebox_v9_r1_wi_fi", "on")])
    orch = SimpleNamespace(hass=hass)
    result = {
        "ok": True,
        "action": "toggle",
        "pre_state": "on",
        "entity_id": "switch.salon_freebox_v9_r1_wi_fi",
        "service": "switch.toggle",
        "changed": [],
    }
    obs = await _observe_home_reobserve(result, orch=orch)
    assert obs.success is False, obs.observed
    assert "inchangé" in obs.observed
    print("  OK — entité joignable/online mais état inchangé → pas de succès inventé")


async def test_ha_unreachable_distinct_reason() -> None:
    from jarvis_core.verification_hooks import _observe_home_reobserve

    hass = _FakeHass([], raise_on_read=RuntimeError("HTTP 500"))
    orch = SimpleNamespace(hass=hass)
    result = {
        "ok": True,
        "action": "on",
        "pre_state": "off",
        "entity_id": "light.salon",
        "service": "light.turn_on",
        "changed": [],
    }
    obs = await _observe_home_reobserve(result, orch=orch)
    assert obs.success is False
    assert "injoignable" in obs.observed
    print("  OK — HA injoignable pour re-lecture ≠ échec device (raison distincte)")


async def test_entity_missing_after_action() -> None:
    from jarvis_core.verification_hooks import _observe_home_reobserve

    hass = _FakeHass([_entity("light.autre", "on")])  # entité demandée absente
    orch = SimpleNamespace(hass=hass)
    result = {
        "ok": True,
        "action": "on",
        "pre_state": "off",
        "entity_id": "light.salon",
        "service": "light.turn_on",
        "changed": [],
    }
    obs = await _observe_home_reobserve(result, orch=orch)
    assert obs.success is False
    assert "introuvable" in obs.observed
    print("  OK — entité introuvable après action → échec explicite")


async def test_mute_checks_attribute_not_state() -> None:
    """volume_mute ne change pas `state` — il faut lire l'attribut dédié."""
    from jarvis_core.verification_hooks import _observe_home_reobserve

    hass = _FakeHass(
        [_entity("media_player.chambre_chambre", "playing", {"is_volume_muted": True})]
    )
    orch = SimpleNamespace(hass=hass)
    result = {
        "ok": True,
        "action": "mute",
        "pre_state": "playing",
        "entity_id": "media_player.chambre_chambre",
        "service": "media_player.volume_mute",
        "changed": [],
    }
    obs = await _observe_home_reobserve(result, orch=orch)
    assert obs.success is True, obs.observed
    print("  OK — mute vérifié via l'attribut is_volume_muted, pas via state")


async def test_toggle_without_pre_state_never_guesses() -> None:
    from jarvis_core.verification_hooks import _observe_home_reobserve

    hass = _FakeHass([_entity("switch.x", "on")])
    orch = SimpleNamespace(hass=hass)
    result = {
        "ok": True,
        "action": "toggle",
        "pre_state": None,  # inconnu — ne doit jamais être supposé
        "entity_id": "switch.x",
        "service": "switch.toggle",
        "changed": [],
    }
    obs = await _observe_home_reobserve(result, orch=orch)
    assert obs.success is False
    assert "pre_state_inconnu" in obs.observed
    print("  OK — pre_state inconnu (toggle) → jamais de succès supposé")


async def test_wired_into_verification_pipeline() -> None:
    """Bout en bout : build_verification_request → VerificationPipeline → VALIDATED."""
    from jarvis_core.memory import build_memory_api
    from jarvis_core.verification import RESULT_VALIDATED, VerificationPipeline
    from jarvis_core.verification_hooks import build_verification_request, run_verification_safe

    with tempfile.TemporaryDirectory() as tmp:
        hass = _FakeHass([_entity("light.chambre", "on")])
        orch = SimpleNamespace(hass=hass)
        pipe = VerificationPipeline(memory_api=build_memory_api(root=Path(tmp)))
        req = await build_verification_request(
            intent="home.control",
            result={
                "ok": True,
                "action": "on",
                "pre_state": "off",
                "entity_id": "light.chambre",
                "service": "light.turn_on",
                "changed": [],
            },
            user_id="smoke-m22",
            payload={"prompt": "allume la lumière de la chambre"},
            orch=orch,
        )
        assert req is not None
        out = run_verification_safe(pipe, req)
        assert out is not None and out.validated and out.stage == RESULT_VALIDATED, out
        assert out.evidence and out.evidence.get("details", {}).get("source") == "home_reobserve"
        print("  OK — home.control bout en bout : HA action → re-lecture → RESULT_VALIDATED")


async def test_wired_disputed_end_to_end() -> None:
    from jarvis_core.memory import build_memory_api
    from jarvis_core.verification import RESULT_DISPUTED
    from jarvis_core.verification_hooks import build_verification_request, run_verification_safe
    from jarvis_core.verification import VerificationPipeline

    with tempfile.TemporaryDirectory() as tmp:
        # HA claim "ok" mais l'état réel ne suit pas (ex. Bravia sans TURN_OFF réel).
        hass = _FakeHass([_entity("media_player.bravia_kdl_40ex521", "idle")])
        orch = SimpleNamespace(hass=hass)
        pipe = VerificationPipeline(memory_api=build_memory_api(root=Path(tmp)))
        req = await build_verification_request(
            intent="home.control",
            result={
                "ok": True,
                "action": "off",
                "pre_state": "idle",
                "entity_id": "media_player.bravia_kdl_40ex521",
                "service": "media_player.turn_off",
                "changed": [],
            },
            user_id="smoke-m22",
            payload={"prompt": "éteins la télé"},
            orch=orch,
        )
        assert req is not None
        out = run_verification_safe(pipe, req)
        assert out is not None and out.stage == RESULT_DISPUTED, out
        assert out.validated is False
        assert out.memory_status == "skipped"
        print("  OK — home.control bout en bout : claim ok mais état inchangé → RESULT_DISPUTED, 0 memory")


async def _main_async() -> None:
    await test_turn_off_validated()
    await test_turn_off_disputed_when_state_unchanged()
    await test_online_is_not_proof_of_action()
    await test_ha_unreachable_distinct_reason()
    await test_entity_missing_after_action()
    await test_mute_checks_attribute_not_state()
    await test_toggle_without_pre_state_never_guesses()
    await test_wired_into_verification_pipeline()
    await test_wired_disputed_end_to_end()


def main() -> int:
    print("=== smoke verification M2.2 (home reobserve) ===")
    asyncio.run(_main_async())
    print("=== ALL OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
