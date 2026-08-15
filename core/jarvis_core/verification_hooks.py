"""Hooks mince Verification ↔ chemins d'exécution Core (M2.1 + M2.2 home).

Ne décide pas RESULT_VALIDATED — seul VerificationPipeline / Core le fait.
Hermes texte, tool.completed, ok agent ≠ preuve.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from typing import Any

from .capabilities import Owner, for_intent
from .verification import Observation, VerificationRequest

logger = logging.getLogger("jarvis.verification.hooks")

# Intents à preuve uniquement — pas HUD open / chat / web.search…
PROOF_INTENTS: frozenset[str] = frozenset(
    {
        # remote (RemoteResult = observation machine)
        "vps.terminal",
        "pi.terminal",
        # device (registre online ≠ claim agent)
        "core.cursor",
        "device.app_launch",
        # home critique (re-observe HA = M2.2 ; ici jamais auto-preuve)
        "home.control",
        # missions
        "core.missions",
        "core.mission_dev",
        # shell NUC via Hermes — dans allowlist pour gate, jamais VALIDATED sur claim
        "system.shell",
    }
)


def needs_verification(intent: str) -> bool:
    return (intent or "").strip() in PROOF_INTENTS


def stable_mission_id(
    intent: str,
    *,
    payload: dict[str, Any] | None = None,
    result: Any = None,
    host: str | None = None,
) -> str:
    """Identifiant stable → mr:{id} idempotent."""
    payload = payload or {}
    if isinstance(result, dict):
        for key in ("mission_id", "request_id"):
            raw = result.get(key)
            if raw:
                return str(raw).strip()
        mission = result.get("mission")
        if isinstance(mission, dict) and mission.get("id"):
            return str(mission["id"]).strip()

    explicit = payload.get("mission_id") or payload.get("request_id")
    if explicit:
        return str(explicit).strip()

    command = str(payload.get("command") or payload.get("prompt") or "").strip()
    if intent in ("vps.terminal", "pi.terminal", "system.shell") and command:
        digest = hashlib.sha256(f"{intent}|{host or ''}|{command}".encode()).hexdigest()[:16]
        return f"term:{intent}:{digest}"

    if intent == "core.missions":
        blob = str(payload.get("prompt") or "")
        digest = hashlib.sha256(blob.encode()).hexdigest()[:16]
        return f"missions:{digest}"

    if intent == "core.mission_dev":
        mid = payload.get("mission_dev_id")
        if mid:
            return f"mission_dev:{mid}"
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:16]
        return f"mission_dev:{digest}"

    device_id = ""
    app_id = ""
    if isinstance(result, dict):
        device_id = str(result.get("device_id") or "")
        app_id = str(result.get("app_id") or "")
    digest = hashlib.sha256(f"{intent}|{device_id}|{app_id}|{payload.get('prompt') or ''}".encode()).hexdigest()[:16]
    return f"intent:{intent}:{digest}"


def claimed_success_from_result(result: Any) -> bool:
    """Claim exécutant uniquement — jamais une Validation."""
    if isinstance(result, dict):
        if "ok" in result:
            return bool(result.get("ok"))
        if result.get("text"):
            # Hermes-style : texte présent ≠ preuve, mais claim souvent True
            return True
        return False
    if result is None:
        return False
    return True


def claimed_result_text(result: Any) -> str:
    if isinstance(result, dict):
        for key in ("agent_result", "summary", "text", "output", "reason", "error"):
            val = result.get(key)
            if val is not None and str(val).strip():
                return str(val).strip()[:2000]
        return json.dumps(result, ensure_ascii=False, default=str)[:2000]
    return str(result)[:2000]


async def build_observation(
    intent: str,
    result: Any,
    *,
    orch: Any | None = None,
    host: str | None = None,
) -> Observation:
    """
    Observation indépendante du claim LLM/agent.

    - remote_exec → ok/returncode/output (machine)
    - Hermes / system.shell → jamais success
    - device → DeviceRegistry.online (pas result.ok agent)
    - home → M2.2, re-lecture HA indépendante (voir `_observe_home_reobserve`)
    - missions → relecture MissionStore

    `async` uniquement pour le chemin home.control (seul à faire un appel
    réseau réel) — les autres branches restent du travail en mémoire, aucune
    latence introduite pour vps/pi/device/missions.
    """
    cap = for_intent(intent)
    if cap is not None and cap.owner is Owner.HERMES:
        return Observation(
            observed="hermes_claim_is_not_proof",
            success=False,
            details={"source": "hermes_rejected", "intent": intent, "reviews": []},
        )

    if intent in ("vps.terminal", "pi.terminal"):
        return _observe_remote_result(result, intent=intent, host=host)

    if intent == "system.shell":
        return Observation(
            observed="system.shell via Hermes — claim rejected as proof",
            success=False,
            details={"source": "hermes_shell_rejected", "reviews": []},
        )

    if intent in ("core.cursor", "device.app_launch"):
        return _observe_device(result, orch=orch)

    if intent == "home.control":
        return await _observe_home_reobserve(result, orch=orch)

    if intent == "core.missions":
        return _observe_missions(result)

    if intent == "core.mission_dev":
        return Observation(
            observed="mission_dev independent verify deferred",
            success=False,
            details={"source": "mission_dev_deferred", "claim_ok": bool(isinstance(result, dict) and result.get("ok")), "reviews": []},
        )

    return Observation(
        observed="no_independent_observer",
        success=False,
        details={"source": "none", "intent": intent, "reviews": []},
    )


async def build_verification_request(
    *,
    intent: str,
    result: Any,
    user_id: str,
    payload: dict[str, Any] | None = None,
    orch: Any | None = None,
    host: str | None = None,
    proposition: str | None = None,
    device_id: str | None = None,
) -> VerificationRequest | None:
    """None si intent hors allowlist (pas de Verification / Memory)."""
    if not needs_verification(intent):
        return None

    payload = payload or {}
    mid = stable_mission_id(intent, payload=payload, result=result, host=host)
    action = str(payload.get("command") or payload.get("prompt") or intent)
    claim_ok = claimed_success_from_result(result)
    obs = await build_observation(intent, result, orch=orch, host=host)

    resolved_device = device_id
    if not resolved_device and isinstance(result, dict):
        resolved_device = str(result.get("device_id") or "") or None

    wing = _wing_for(intent, host=host, device_id=resolved_device)
    return VerificationRequest(
        mission_id=mid,
        user_id=user_id or "local",
        intent=intent,
        proposition=proposition or f"Exécuter {intent}",
        action_demanded=action[:500],
        claimed_result=claimed_result_text(result),
        claimed_success=claim_ok,
        observe=obs,
        device_id=resolved_device,
        wing=wing,
        room="missions",
        title=f"{intent}",
        importance="high",
        tags=["mission", intent],
    )


def run_verification_safe(pipeline: Any, request: VerificationRequest | None) -> Any | None:
    """N'interrompt jamais l'exécution Core si Verification/Memory échoue."""
    if pipeline is None or request is None:
        return None
    try:
        return pipeline.run(request)
    except Exception:  # noqa: BLE001
        logger.exception("verification hook failed · mission=%s", request.mission_id)
        return None


def verification_surface_payload(outcome: Any, request: VerificationRequest | None) -> dict[str, Any]:
    """Sérialise l'outcome pour `surface_result.verification` (contrat HUD VerificationCard).

    N'altère pas le pipeline — alias des champs déjà présents.
    """
    validated = bool(getattr(outcome, "validated", False))
    raw_outcome = str(getattr(outcome, "outcome", "") or "")
    if validated:
        card_outcome = "verified"
    elif raw_outcome in ("disputed", "failed"):
        card_outcome = "disputed"
    else:
        card_outcome = "pending"
    observed = getattr(outcome, "observed", None)
    proposition = (request.proposition if request else "") or ""
    action = (request.action_demanded if request else "") or ""
    claimed = (request.claimed_result if request else "") or ""
    stage = str(getattr(outcome, "stage", "") or "")
    return {
        "stage": stage,
        "outcome": raw_outcome,
        "validated": validated,
        "memory_status": getattr(outcome, "memory_status", "skipped"),
        "memory_record_id": getattr(outcome, "memory_record_id", None),
        "mission_id": getattr(outcome, "mission_id", None),
        "observed": observed,
        "intent": (request.intent if request else None),
        "proposition": proposition,
        "action_demanded": action,
        "claimed_result": claimed,
        "action_requested": action,
        "action_executed": claimed,
        "result_observed": observed or "",
        "result_validated": stage if validated else "",
        "card_outcome": card_outcome,
    }


def _observe_remote_result(result: Any, *, intent: str, host: str | None) -> Observation:
    if not isinstance(result, dict):
        return Observation(
            observed="remote_result_missing",
            success=False,
            details={"source": "remote_exec", "intent": intent, "reviews": []},
        )
    ok = bool(result.get("ok"))
    rc = result.get("returncode")
    output = str(result.get("output") or "")[:1500]
    error = str(result.get("error") or "")[:500]
    observed = (
        f"remote_exec host={host or intent} ok={ok} returncode={rc}\n"
        f"output={output}\nerror={error}"
    )
    return Observation(
        observed=observed,
        success=ok,
        details={
            "source": "remote_exec",
            "host": host,
            "returncode": rc,
            "ok": ok,
            "reviews": [],  # futur LLM reviewers — jamais preuve seule
        },
    )


def _observe_device(result: Any, *, orch: Any | None) -> Observation:
    if not isinstance(result, dict):
        return Observation(
            observed="device_result_missing",
            success=False,
            details={"source": "device_registry", "reviews": []},
        )
    device_id = str(result.get("device_id") or "").strip()
    if not device_id or orch is None or not hasattr(orch, "devices"):
        return Observation(
            observed="device_registry_unavailable — agent ok is not proof",
            success=False,
            details={
                "source": "device_registry",
                "agent_ok": bool(result.get("ok")),
                "reviews": [],
            },
        )
    dev = orch.devices.get_device(device_id)
    online = bool(dev and getattr(dev, "online", False))
    observed = (
        f"device_registry device_id={device_id} online={online} "
        f"(agent_ok={bool(result.get('ok'))} ignored_as_proof)"
    )
    return Observation(
        observed=observed,
        success=online,
        details={
            "source": "device_registry",
            "device_id": device_id,
            "online": online,
            "agent_ok": bool(result.get("ok")),
            "reviews": [],
        },
    )


# Délais de re-lecture HA après action (secondes) — bornés, jamais indéfinis
# (dette 6.1-2, JARVIS-Satellites.md). Deux essais : le local répond en
# quelques centaines de ms, un appareil Zigbee/plus lent peut avoir besoin
# du second.
_REOBSERVE_DELAYS_S: tuple[float, ...] = (0.5, 1.0)


def _expected_ha_outcome(domain: str, action: str, pre_state: Any) -> dict[str, Any]:
    """Ce qu'on doit observer pour dire qu'une action HA a réellement pris effet.

    Jamais une supposition optimiste : quand la cible n'est pas déterministe
    (toggle/stop selon l'intégration), on compare à l'état précédent plutôt
    que d'inventer un état attendu.
    """
    if action == "on":
        if domain == "cover":
            return {"state": "open"}
        return {"not_state": {"off", "unavailable", "standby"}}
    if action == "off":
        if domain == "cover":
            return {"state": "closed"}
        return {"state_in": {"off", "standby"}}
    if action == "open":
        return {"state": "open"}
    if action == "close":
        return {"state": "closed"}
    if action == "pause":
        return {"state": "paused"}
    if action == "play":
        return {"state": "playing"}
    if action == "mute":
        return {"attribute": ("is_volume_muted", True)}
    # toggle / stop / non reconnu : pas de cible fixe fiable entre intégrations.
    return {"changed_from": pre_state}


def _matches_ha_expected(entity: Any, expected: dict[str, Any]) -> tuple[bool, str]:
    if "state" in expected:
        want = expected["state"]
        ok = entity.state == want
        return ok, ("state_ok" if ok else f"state attendu {want!r}, observé {entity.state!r}")
    if "state_in" in expected:
        want = expected["state_in"]
        ok = entity.state in want
        return ok, ("state_ok" if ok else f"state {entity.state!r} pas dans {sorted(want)}")
    if "not_state" in expected:
        avoid = expected["not_state"]
        ok = entity.state not in avoid
        return ok, ("state_ok" if ok else f"state {entity.state!r} toujours dans {sorted(avoid)}")
    if "attribute" in expected:
        name, want = expected["attribute"]
        got = (entity.attributes or {}).get(name)
        ok = got == want
        return ok, (f"{name}_ok" if ok else f"{name} attendu {want!r}, observé {got!r}")
    if "changed_from" in expected:
        pre = expected["changed_from"]
        if pre is None:
            return False, "pre_state_inconnu — comparaison impossible, pas de succès supposé"
        ok = entity.state != pre
        return ok, ("state_a_change" if ok else f"state inchangé ({entity.state!r})")
    return False, "expectation_non_reconnue"


async def _observe_home_reobserve(result: Any, *, orch: Any | None) -> Observation:
    """M2.2 — relit l'état HA après action, indépendamment du claim.

    ACTION → appel HA (déjà fait, `result`) → re-lecture indépendante
    `inventory(force=True)` → comparaison état attendu/réel → Observation.
    Un équipement joignable/ONLINE n'est jamais confondu avec une action
    réussie : on compare l'état APRÈS à ce que l'action demandait, jamais
    la seule joignabilité de l'entité.
    """
    if not isinstance(result, dict):
        return Observation(
            observed="home_result_missing",
            success=False,
            details={"source": "home_reobserve", "reviews": []},
        )
    if result.get("ha") is False and result.get("opened"):
        return Observation(
            observed="home UI open only — not a memorable proof",
            success=False,
            details={"source": "home_ui_open", "reviews": []},
        )

    entity_id = str(result.get("entity_id") or "").strip()
    action = str(result.get("action") or "").strip()
    if not entity_id or not action:
        return Observation(
            observed="home_reobserve missing entity_id/action — claim rejected as proof",
            success=False,
            details={"source": "home_reobserve", "claim_ok": bool(result.get("ok")), "reviews": []},
        )

    hass = getattr(orch, "hass", None)
    if hass is None:
        return Observation(
            observed="home_reobserve unavailable — no HA adapter on orchestrator",
            success=False,
            details={"source": "home_reobserve", "entity_id": entity_id, "reviews": []},
        )

    domain = entity_id.split(".", 1)[0]
    pre_state = result.get("pre_state")
    expected = _expected_ha_outcome(domain, action, pre_state)

    entity_after = None
    ok = False
    reason = "not_checked"
    for delay in _REOBSERVE_DELAYS_S:
        await asyncio.sleep(delay)
        try:
            entities = await hass.inventory(force=True)
        except Exception as exc:  # noqa: BLE001 — HA injoignable ≠ device en échec
            return Observation(
                observed=f"home_reobserve HA injoignable pour re-lecture : {exc}",
                success=False,
                details={"source": "home_reobserve", "entity_id": entity_id, "reviews": []},
            )
        entity_after = next((e for e in entities if e.entity_id == entity_id), None)
        if entity_after is None:
            continue
        ok, reason = _matches_ha_expected(entity_after, expected)
        if ok:
            break

    if entity_after is None:
        return Observation(
            observed=f"home_reobserve entité introuvable après action : {entity_id}",
            success=False,
            details={"source": "home_reobserve", "entity_id": entity_id, "reviews": []},
        )

    expected_repr = {k: (sorted(v) if isinstance(v, set) else v) for k, v in expected.items()}
    observed = (
        f"entity_id={entity_id} action={action} pre_state={pre_state!r} "
        f"post_state={entity_after.state!r} attendu={expected_repr} → {reason}"
    )
    return Observation(
        observed=observed,
        success=ok,
        details={
            "source": "home_reobserve",
            "entity_id": entity_id,
            "action": action,
            "pre_state": pre_state,
            "post_state": entity_after.state,
            "expected": expected_repr,
            "reviews": [],
        },
    )


def _observe_missions(result: Any) -> Observation:
    """Relecture MissionStore — indépendante du claim vocal."""
    if not isinstance(result, dict):
        return Observation(
            observed="missions_result_missing",
            success=False,
            details={"source": "mission_store", "reviews": []},
        )
    action = str(result.get("action") or "")
    if action == "list":
        return Observation(
            observed="missions list — not a durable mission_result",
            success=False,
            details={"source": "mission_store", "action": "list", "reviews": []},
        )
    mission = result.get("mission")
    if not isinstance(mission, dict) or not mission.get("id"):
        return Observation(
            observed="missions mission payload missing",
            success=False,
            details={"source": "mission_store", "action": action, "reviews": []},
        )
    mid = str(mission["id"])
    try:
        from .missions import MissionStore

        store = MissionStore()
        found = store.get(mid) if hasattr(store, "get") else None
        if found is None:
            # fallback list scan
            for m in store.list_missions(include_done=True):
                if getattr(m, "id", None) == mid:
                    found = m
                    break
        if found is None:
            return Observation(
                observed=f"mission_store missing id={mid}",
                success=False,
                details={"source": "mission_store", "mission_id": mid, "reviews": []},
            )
        status = getattr(found, "status", None) or (found.get("status") if isinstance(found, dict) else None)
        if action == "complete":
            ok = status == "done"
            return Observation(
                observed=f"mission_store id={mid} status={status} (complete)",
                success=ok,
                details={"source": "mission_store", "mission_id": mid, "status": status, "reviews": []},
            )
        if action == "add":
            ok = status in ("open", "active", "todo", "pending", "done") or status is not None
            return Observation(
                observed=f"mission_store id={mid} status={status} (add)",
                success=bool(ok),
                details={"source": "mission_store", "mission_id": mid, "status": status, "reviews": []},
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("mission_store observe failed: %s", exc)
        return Observation(
            observed=f"mission_store observe error: {exc}",
            success=False,
            details={"source": "mission_store", "reviews": []},
        )
    return Observation(
        observed=f"missions action={action} not memorable",
        success=False,
        details={"source": "mission_store", "action": action, "reviews": []},
    )


def build_dev_agent_observation(result: Any, *, read_only: bool) -> Observation:
    """P5 REAL → Mission DEV — observation indépendante d'un step dev.agent.run.

    Jamais le texte de l'agent (``agent_result``) comme preuve : READ-only se
    valide par ``exit_code=0`` + absence de mutation ; WRITE se valide par
    diff/tests réellement observés (cf. ``dev_agent.verification``).
    """
    if not isinstance(result, dict):
        return Observation(
            observed="dev_agent_result_missing",
            success=False,
            details={"source": "dev_agent_run", "reviews": []},
        )

    from .dev_agent.verification import observations_from_result, sufficient_for_future_validation

    obs = observations_from_result(result)
    claim = result.get("agent_result")
    exit_ok = result.get("exit_code") == 0
    files_changed = obs.get("files_changed") or []

    if read_only:
        success = exit_ok and not files_changed
        observed = (
            f"dev_agent read-only run exit_code={result.get('exit_code')} "
            f"files_changed={files_changed}"
        )
    else:
        success = exit_ok and sufficient_for_future_validation(obs, claim)
        observed = (
            f"dev_agent run exit_code={result.get('exit_code')} files_changed={files_changed} "
            f"git_diff_stat={'present' if obs.get('git_diff_stat') else 'absent'} "
            f"tests={obs.get('tests')}"
        )

    return Observation(
        observed=observed,
        success=success,
        details={**obs, "source": "dev_agent_run", "read_only": read_only, "reviews": []},
    )


def _wing_for(intent: str, *, host: str | None, device_id: str | None) -> str:
    if intent.startswith("vps.") or host == "vps":
        return "vps"
    if intent.startswith("pi.") or host == "pi":
        return "pi-salon"
    if intent in ("core.cursor", "device.app_launch"):
        return "pc-windows" if device_id else "device"
    if intent == "home.control":
        return "foyer"
    if intent.startswith("core.mission"):
        return "jarvis-os"
    return "jarvis-os"
