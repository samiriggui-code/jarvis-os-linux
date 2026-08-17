"""Architecture Awareness D1 — architecture.snapshot() compilateur read-only.

IN_MEMORY only. Aucun SSH / HA / Ollama HTTP synchrone.
Snapshot = vue compilée, pas un nouveau datastore.
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from .schema import (
    PROVENANCE_CODE,
    PROVENANCE_DOC,
    PROVENANCE_OBSERVED,
    PROVENANCE_UNKNOWN,
    SCHEMA_VERSION,
    TTL_DEVICES_S,
    TTL_PROBE_STORE_S,
    TTL_SUPERVISOR_S,
    enforce_available_or_downgrade,
    redact_tree,
)

DOC_MACHINES: list[dict[str, Any]] = [
    {"id": "nuc", "role": "core_host", "provenance": PROVENANCE_DOC, "services_expected": ["core", "postgres", "nginx"]},
    {"id": "vps", "role": "edge_host", "provenance": PROVENANCE_DOC, "services_expected": ["voicebox", "ollama"]},
    {"id": "pi-salon", "role": "satellite", "provenance": PROVENANCE_DOC, "services_expected": ["ear", "cam", "speaker"]},
    {"id": "pc-windows", "role": "agent_host", "provenance": PROVENANCE_DOC, "services_expected": ["windows_agent"]},
    {"id": "proliant", "role": "media_nas", "provenance": PROVENANCE_DOC, "services_expected": ["plex"]},
]

DOC_CONNECTIONS: list[dict[str, Any]] = [
    {"id": "core-to-pi", "from": "core", "to": "device:pi-salon", "kind": "ws_or_http", "provenance": PROVENANCE_CODE, "status": "UNKNOWN"},
    {"id": "core-to-windows-agent", "from": "core", "to": "agent:windows_agent", "kind": "ws", "provenance": PROVENANCE_CODE, "status": "UNKNOWN"},
    {"id": "pi-to-freebox-adb", "from": "device:pi-salon", "to": "device:freebox-player", "kind": "adb", "provenance": PROVENANCE_DOC, "status": "UNKNOWN"},
    {"id": "core-to-ha", "from": "core", "to": "service:home_assistant", "kind": "http", "provenance": PROVENANCE_CODE, "status": "UNKNOWN"},
]

DOC_DEPENDS_ON: list[dict[str, Any]] = [
    {
        "capability_id": "media.netflix.freebox",
        "chain": ["core", "device:pi-salon", "service:adb", "device:freebox-player", "app:netflix"],
        "provenance": PROVENANCE_DOC,
    },
    {
        "capability_id": "apple_tv.control",
        "chain": ["core", "service:home_assistant", "device:apple_tv"],
        "provenance": PROVENANCE_DOC,
    },
]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iso_from_epoch(ts: float | None) -> str | None:
    if ts is None or ts <= 0 or ts == float("-inf"):
        return None
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
    except (OSError, OverflowError, ValueError):
        return None


def _stale(observed_at_epoch: float | None, stale_after_s: float, now: float) -> bool:
    if observed_at_epoch is None:
        return True
    return (now - observed_at_epoch) > stale_after_s


def _env_configured(name: str) -> bool:
    return bool((os.environ.get(name) or "").strip())


def snapshot(
    *,
    devices_registry: Any | None = None,
    supervisor: Any | None = None,
    probe_store: dict[str, Any] | None = None,
    now: float | None = None,
) -> dict[str, Any]:
    """
    Compile ArchitectureSnapshot schema 1.0.0.

    Read-only, non bloquant. Aucun appel réseau.
    """
    t0 = time.time() if now is None else now
    as_of = _utc_now()
    limitations: list[str] = []
    global_evidence: list[dict[str, Any]] = []

    machines = _compile_machines()
    devices, agents = _compile_devices(devices_registry, t0, limitations)
    services = _compile_services(supervisor, t0, limitations)
    tools = _compile_tools(devices_registry)
    capabilities = _compile_capabilities()
    llms, providers = _compile_llms_providers(limitations)
    # Probe store optionnel (BACKGROUND déjà rempli) — lecture seule
    _merge_probe_store(probe_store, services, llms, t0, limitations)

    freshness = _compute_freshness(devices, agents, services, llms, limitations)

    # Enforce AVAILABLE invariant on all runtime entries
    devices = [enforce_available_or_downgrade(e) for e in devices]
    agents = [enforce_available_or_downgrade(e) for e in agents]
    services = [enforce_available_or_downgrade(e) for e in services]
    capabilities = [enforce_available_or_downgrade(e) for e in capabilities]
    llms = [enforce_available_or_downgrade(e) for e in llms]

    limitations.extend(_coverage_limitations(devices_registry, supervisor, probe_store))

    core = {
        "role": "architecture_authority",
        "device_id_env": (os.environ.get("JARVIS_DEVICE_ID") or os.environ.get("JARVIS_HOST_ID") or "nuc-main"),
        "host_role_env": (os.environ.get("JARVIS_HOST_ROLE") or "core"),
        "provenance": PROVENANCE_CODE,
        "status": "CONFIGURED",
        "note": "Core process compiling this snapshot; not a network probe",
    }

    raw = {
        "schema_version": SCHEMA_VERSION,
        "snapshot_id": str(uuid.uuid4()),
        "timestamp": as_of,
        "as_of": as_of,
        "freshness": freshness,
        "core": core,
        "machines": machines,
        "devices": devices,
        "agents": agents,
        "services": services,
        "tools": tools,
        "llms": llms,
        "providers": providers,
        "capabilities": capabilities,
        "connections": list(DOC_CONNECTIONS),
        "depends_on": list(DOC_DEPENDS_ON),
        "health": {
            "compiler": "ok",
            "elapsed_ms": round((time.time() - t0) * 1000, 3) if now is None else 0.0,
            "sources": {
                "devices_registry": devices_registry is not None,
                "supervisor": supervisor is not None,
                "probe_store": bool(probe_store),
            },
        },
        "limitations": sorted(set(limitations)),
        "evidence": global_evidence,
    }
    return redact_tree(raw)


def _compile_machines() -> list[dict[str, Any]]:
    machines: list[dict[str, Any]] = []
    for m in DOC_MACHINES:
        entry = {
            "id": m["id"],
            "role": m["role"],
            "status": "UNKNOWN",
            "qualifiers": [],
            "stale": False,
            "observed_at": None,
            "ttl_s": None,
            "stale_after_s": None,
            "provenance": PROVENANCE_DOC,
            "evidence": [],
            "services_expected": list(m.get("services_expected") or []),
            "claims": [],
            "conflict": False,
            "resolved_by": None,
        }
        machines.append(entry)
    return machines


def _compile_devices(
    registry: Any | None,
    now: float,
    limitations: list[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    devices: list[dict[str, Any]] = []
    agents: list[dict[str, Any]] = []
    if registry is None:
        limitations.append("devices_registry_absent")
        return devices, agents

    # Lecture seule — refresh online flags already in registry
    try:
        if hasattr(registry, "_refresh_online"):
            registry._refresh_online()  # noqa: SLF001 — lecture état TTL existant
    except Exception:  # noqa: BLE001
        limitations.append("devices_registry_refresh_failed")

    try:
        items = list(getattr(registry, "_devices", {}).values())
    except Exception:  # noqa: BLE001
        limitations.append("devices_registry_unreadable")
        return devices, agents

    ttl = float(getattr(registry, "_ttl_s", TTL_DEVICES_S) or TTL_DEVICES_S)

    for dev in items:
        last_seen = float(getattr(dev, "last_seen", 0) or 0)
        online = bool(getattr(dev, "online", False))
        stale = _stale(last_seen, ttl, now)
        observed_at = _iso_from_epoch(last_seen)
        runtime_kind = str(getattr(dev, "runtime_kind", "") or "")
        device_id = str(getattr(dev, "device_id", "") or "")

        evidence: list[dict[str, Any]] = []
        if last_seen > 0:
            evidence.append(
                {
                    "kind": "device_registry_last_seen",
                    "at": observed_at,
                    "ok": online and not stale,
                    "target": f"device:{device_id}",
                }
            )

        if online and not stale and evidence:
            status = "AVAILABLE"
            provenance = PROVENANCE_OBSERVED
        elif online and stale:
            status = "OFFLINE"
            provenance = PROVENANCE_OBSERVED
        elif last_seen > 0:
            status = "OFFLINE"
            provenance = PROVENANCE_OBSERVED
        else:
            status = "UNKNOWN"
            provenance = PROVENANCE_UNKNOWN

        entry = {
            "id": device_id,
            "type": str(getattr(dev, "type", "") or ""),
            "runtime_kind": runtime_kind,
            "status": status,
            "qualifiers": (["STALE"] if stale and last_seen > 0 else []),
            "stale": stale if last_seen > 0 else False,
            "observed_at": observed_at,
            "ttl_s": ttl,
            "stale_after_s": ttl,
            "provenance": provenance,
            "evidence": evidence,
            "device_mode": str(getattr(dev, "device_mode", "") or ""),
            "online_flag": online,
        }
        entry = enforce_available_or_downgrade(entry)
        devices.append(entry)

        if runtime_kind in ("windows_agent", "fake_agent", "jarvis_satellite", "jarvis-ear"):
            agent = {
                "id": f"agent:{device_id}",
                "device_id": device_id,
                "runtime_kind": runtime_kind,
                "status": entry["status"],
                "qualifiers": list(entry.get("qualifiers") or []),
                "stale": entry["stale"],
                "observed_at": observed_at,
                "ttl_s": ttl,
                "stale_after_s": ttl,
                "provenance": entry["provenance"],
                "evidence": list(evidence),
            }
            agents.append(enforce_available_or_downgrade(agent))

    return devices, agents


def _compile_services(
    supervisor: Any | None,
    now: float,
    limitations: list[str],
) -> list[dict[str, Any]]:
    services: list[dict[str, Any]] = []
    if supervisor is None:
        limitations.append("supervisor_absent")
        # Still emit CONFIGURED/UNKNOWN stubs for known env services
        services.extend(_env_service_stubs())
        return services

    try:
        st = supervisor.status()
        comps = list(st.get("components") or [])
    except Exception:  # noqa: BLE001
        limitations.append("supervisor_unreadable")
        services.extend(_env_service_stubs())
        return services

    ttl = TTL_SUPERVISOR_S
    for comp in comps:
        name = str(comp.get("name") or "")
        state = str(comp.get("state") or "unknown")
        last_ok = comp.get("last_ok")
        last_ok_f = float(last_ok) if last_ok is not None else None
        observed_at = _iso_from_epoch(last_ok_f)
        stale = _stale(last_ok_f, ttl, now) if last_ok_f else True

        evidence: list[dict[str, Any]] = []
        if last_ok_f is not None:
            evidence.append(
                {
                    "kind": "supervisor_last_ok",
                    "at": observed_at,
                    "ok": state == "ready" and not stale,
                    "target": f"service:{name}",
                    "supervisor_state": state,
                }
            )

        if state == "ready" and evidence and not stale:
            status, provenance = "AVAILABLE", PROVENANCE_OBSERVED
        elif state == "degraded":
            status, provenance = "DEGRADED", PROVENANCE_OBSERVED if evidence else PROVENANCE_CODE
        elif state == "loading":
            status, provenance = "UNKNOWN", PROVENANCE_OBSERVED if evidence else PROVENANCE_CODE
        elif evidence:
            status, provenance = "OFFLINE", PROVENANCE_OBSERVED
        else:
            status, provenance = "UNKNOWN", PROVENANCE_UNKNOWN

        entry = {
            "id": f"service:{name}",
            "name": name,
            "status": status,
            "qualifiers": (["STALE"] if stale and last_ok_f else []),
            "stale": bool(stale and last_ok_f),
            "observed_at": observed_at,
            "ttl_s": ttl,
            "stale_after_s": ttl,
            "provenance": provenance,
            "evidence": evidence,
            "supervisor_state": state,
            "critical": bool(comp.get("critical")),
        }
        services.append(enforce_available_or_downgrade(entry))

    # Env stubs for services not in supervisor (HA, etc.) — CONFIGURED only
    known = {s.get("name") for s in services}
    for stub in _env_service_stubs():
        if stub.get("name") not in known and stub.get("id") not in {s.get("id") for s in services}:
            services.append(stub)

    return services


def _env_service_stubs() -> list[dict[str, Any]]:
    """CONFIGURED / UNCONFIGURED from env presence — never AVAILABLE."""
    stubs = [
        ("home_assistant", "JARVIS_HASS_URL", "JARVIS_HASS_TOKEN"),
        ("plex", "JARVIS_PLEX_URL", "JARVIS_PLEX_TOKEN"),
        ("voicebox", "JARVIS_VOICEBOX_URL", None),
        ("ollama", "JARVIS_REMOTE_LLM_URL", None),
    ]
    out: list[dict[str, Any]] = []
    for name, url_env, key_env in stubs:
        url_ok = _env_configured(url_env) if url_env else False
        # Ollama also via OLLAMA_HOST / JARVIS_OLLAMA_URL
        if name == "ollama":
            url_ok = url_ok or _env_configured("OLLAMA_HOST") or _env_configured("JARVIS_OLLAMA_URL")
        key_ok = _env_configured(key_env) if key_env else True
        if url_ok and key_ok:
            status = "CONFIGURED"
        elif url_ok or (key_env and key_ok):
            status = "UNCONFIGURED"
        else:
            status = "UNCONFIGURED"
        out.append(
            {
                "id": f"service:{name}",
                "name": name,
                "status": status,
                "qualifiers": [],
                "stale": False,
                "observed_at": None,
                "ttl_s": None,
                "stale_after_s": None,
                "provenance": PROVENANCE_CODE,
                "evidence": [],
                "configured": url_ok and key_ok,
                "note": "env presence only — not a live health probe (D1)",
            }
        )
    return out


def _compile_tools(registry: Any | None) -> list[dict[str, Any]]:
    tools: list[dict[str, Any]] = []
    if registry is None:
        return tools
    try:
        items = list(getattr(registry, "_devices", {}).values())
    except Exception:  # noqa: BLE001
        return tools
    for dev in items:
        caps = getattr(dev, "capabilities", {}) or {}
        for cap_id, cap in caps.items():
            tools.append(
                {
                    "id": f"hostcap:{getattr(dev, 'device_id', '')}:{cap_id}",
                    "capability_id": str(cap_id),
                    "device_id": str(getattr(dev, "device_id", "")),
                    "status": "DISCOVERED",
                    "qualifiers": [],
                    "stale": False,
                    "observed_at": _iso_from_epoch(getattr(cap, "last_seen", None)),
                    "provenance": PROVENANCE_OBSERVED
                    if getattr(cap, "last_seen", None)
                    else PROVENANCE_CODE,
                    "evidence": (
                        [
                            {
                                "kind": "host_capability_announce",
                                "at": _iso_from_epoch(getattr(cap, "last_seen", None)),
                                "ok": True,
                                "target": str(cap_id),
                            }
                        ]
                        if getattr(cap, "last_seen", None)
                        else []
                    ),
                    "note": "HostCapability announced — not Architecture AVAILABLE unless probed",
                }
            )
    # Host capabilities are DISCOVERED/announced — never auto-AVAILABLE without independent health
    for t in tools:
        if t.get("status") == "AVAILABLE":
            t["status"] = "DISCOVERED"
    return tools


def _compile_capabilities() -> list[dict[str, Any]]:
    """Intent catalog CODE — never map Capability.available → Architecture AVAILABLE."""
    from ..capabilities import CAPABILITIES, Owner

    out: list[dict[str, Any]] = []
    for app_id, cap in CAPABILITIES.items():
        intent = str(getattr(cap, "intent", "") or "")
        owner = getattr(cap, "owner", None)
        # Status from wiring class, NOT .available property
        if owner is Owner.CORE:
            status = "CONFIGURED"
        elif owner is Owner.DEVICE:
            status = "CONFIGURED"  # agent path may exist; live = device layer
        else:
            status = "UNKNOWN"

        # Special PLANNED / DOC-only product visions
        if intent in ("",):
            status = "PLANNED"

        out.append(
            {
                "id": intent or app_id,
                "app_id": app_id,
                "intent": intent,
                "owner": owner.value if owner is not None else "?",
                "toolset": getattr(cap, "toolset", None),
                "status": status,
                "qualifiers": [],
                "stale": False,
                "observed_at": None,
                "ttl_s": None,
                "stale_after_s": None,
                "provenance": PROVENANCE_CODE,
                "evidence": [],
                "provider": None,
                "note": "IntentCapability catalog — Capability.available ignored for Architecture status",
            }
        )

    # Explicit PLANNED / DISCOVERED product gaps
    out.append(
        {
            "id": "apple_tv.control",
            "status": "PLANNED",
            "qualifiers": ["UNPAIRED"],
            "stale": False,
            "observed_at": None,
            "provenance": PROVENANCE_DOC,
            "evidence": [],
            "note": "Documented vision / cahier — no executor in Core",
        }
    )
    out.append(
        {
            "id": "media.netflix.freebox",
            "status": "UNKNOWN",
            "qualifiers": [],
            "stale": False,
            "observed_at": None,
            "provenance": PROVENANCE_DOC,
            "evidence": [],
            "note": "Chain Pi→ADB→Freebox — not observed in D1 sync snapshot",
        }
    )
    return out


def _compile_llms_providers(limitations: list[str]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Env-only CONFIGURED — never AVAILABLE without probe store OBSERVED."""
    limitations.append("llm_live_probe_not_run_in_d1_sync_snapshot")

    providers: list[dict[str, Any]] = []
    llms: list[dict[str, Any]] = []

    or_key = _env_configured("OPENROUTER_API_KEY")
    providers.append(
        {
            "id": "provider:openrouter",
            "status": "CONFIGURED" if or_key else "UNCONFIGURED",
            "qualifiers": [],
            "stale": False,
            "observed_at": None,
            "provenance": PROVENANCE_CODE,
            "evidence": [],
            "note": "API key presence only",
        }
    )
    if or_key:
        llms.append(
            {
                "id": "llm:openrouter",
                "provider": "openrouter",
                "status": "CONFIGURED",
                "qualifiers": [],
                "stale": False,
                "observed_at": None,
                "provenance": PROVENANCE_CODE,
                "evidence": [],
                "model_env": (os.environ.get("JARVIS_OPENROUTER_MODEL") or "").strip() or None,
            }
        )

    ollama = (
        _env_configured("JARVIS_REMOTE_LLM_URL")
        or _env_configured("OLLAMA_HOST")
        or _env_configured("JARVIS_OLLAMA_URL")
    )
    providers.append(
        {
            "id": "provider:ollama",
            "status": "CONFIGURED" if ollama else "UNCONFIGURED",
            "qualifiers": [],
            "stale": False,
            "observed_at": None,
            "provenance": PROVENANCE_CODE,
            "evidence": [],
            "note": "URL presence only — /api/tags not called in snapshot()",
        }
    )
    if ollama:
        llms.append(
            {
                "id": "llm:ollama",
                "provider": "ollama",
                "status": "CONFIGURED",
                "qualifiers": [],
                "stale": False,
                "observed_at": None,
                "provenance": PROVENANCE_CODE,
                "evidence": [],
            }
        )

    return llms, providers


def _merge_probe_store(
    store: dict[str, Any] | None,
    services: list[dict[str, Any]],
    llms: list[dict[str, Any]],
    now: float,
    limitations: list[str],
) -> None:
    """Applique des observations BACKGROUND déjà en cache — ne lance aucun probe."""
    if not store:
        return
    ttl = float(store.get("ttl_s") or TTL_PROBE_STORE_S)
    for item in store.get("services") or []:
        if not isinstance(item, dict):
            continue
        sid = item.get("id") or f"service:{item.get('name')}"
        observed_epoch = item.get("observed_epoch")
        stale = _stale(float(observed_epoch) if observed_epoch else None, ttl, now)
        evidence = list(item.get("evidence") or [])
        status = item.get("status") or "UNKNOWN"
        if status == "AVAILABLE" and (stale or not evidence):
            status = "UNKNOWN"
        entry = {
            "id": sid,
            "name": item.get("name"),
            "status": status,
            "qualifiers": (["STALE"] if stale else []),
            "stale": stale,
            "observed_at": item.get("observed_at") or _iso_from_epoch(observed_epoch),
            "ttl_s": ttl,
            "stale_after_s": ttl,
            "provenance": PROVENANCE_OBSERVED if evidence else PROVENANCE_UNKNOWN,
            "evidence": evidence,
            "source": "probe_store",
        }
        entry = enforce_available_or_downgrade(entry)
        # Replace or append
        found = False
        for i, s in enumerate(services):
            if s.get("id") == sid:
                services[i] = entry
                found = True
                break
        if not found:
            services.append(entry)

    for item in store.get("llms") or []:
        if not isinstance(item, dict):
            continue
        evidence = list(item.get("evidence") or [])
        observed_epoch = item.get("observed_epoch")
        stale = _stale(float(observed_epoch) if observed_epoch else None, ttl, now)
        status = item.get("status") or "UNKNOWN"
        if status == "AVAILABLE" and (stale or not evidence):
            status = "UNKNOWN"
        entry = {
            "id": item.get("id") or "llm:unknown",
            "provider": item.get("provider"),
            "status": status,
            "qualifiers": (["STALE"] if stale else []),
            "stale": stale,
            "observed_at": item.get("observed_at") or _iso_from_epoch(observed_epoch),
            "ttl_s": ttl,
            "stale_after_s": ttl,
            "provenance": PROVENANCE_OBSERVED if evidence else PROVENANCE_UNKNOWN,
            "evidence": evidence,
            "source": "probe_store",
        }
        llms.append(enforce_available_or_downgrade(entry))


def _compute_freshness(
    devices: list[dict[str, Any]],
    agents: list[dict[str, Any]],
    services: list[dict[str, Any]],
    llms: list[dict[str, Any]],
    limitations: list[str],
) -> str:
    if any("absent" in x or "not_run" in x for x in limitations):
        base = "PARTIAL"
    else:
        base = "FRESH"
    entries = devices + agents + services + llms
    if any(e.get("stale") for e in entries):
        return "STALE"
    if base == "PARTIAL":
        return "PARTIAL"
    return "FRESH"


def _coverage_limitations(
    devices_registry: Any | None,
    supervisor: Any | None,
    probe_store: dict[str, Any] | None,
) -> list[str]:
    lim = [
        "d1_sync_snapshot_no_network_probes",
        "background_http_probes_not_executed_here",
        "on_demand_audit_not_executed_here",
        "capability_available_legacy_flag_ignored",
    ]
    if devices_registry is None:
        lim.append("coverage:no_devices_registry")
    if supervisor is None:
        lim.append("coverage:no_supervisor")
    if not probe_store:
        lim.append("coverage:probe_store_empty")
    return lim
