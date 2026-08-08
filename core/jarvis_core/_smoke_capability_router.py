"""Smoke Capability Router — Phase 5 (offline)."""
from __future__ import annotations

from jarvis_core.capability_router import CapabilityRouter, RouteContext
from jarvis_core.devices import DeviceRegistry, PI_SALON_SEED, _default_nuc_id, apply_seed


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    if not cond:
        raise SystemExit(1)


def main() -> int:
    print("PHASE5 capability router")
    reg = DeviceRegistry(ttl_s=120)
    reg.register_local_core()
    apply_seed(reg, PI_SALON_SEED)

    reg.register(
        "tablet-zahra",
        type="pc_client",
        runtime_kind="browser",
        device_mode="personal",
        bound_user_id="uid-zahra",
    )
    reg.update_capabilities(
        "tablet-zahra",
        [{"name": "camera", "capability_id": "camera.capture", "value": True}],
    )

    router = CapabilityRouter(reg)

    # Origine pi-salon → elle-même pour camera.capture
    ctx_pi = RouteContext(origin_device_id="pi-salon", device_mode="shared")
    host_pi = router.resolve_host_device(ctx_pi, "camera.capture")
    check("origin pi-salon camera", host_pi.device_id == "pi-salon", host_pi.reason)

    # Tablette perso liée → origine locale
    ctx_tab = RouteContext(
        origin_device_id="tablet-zahra",
        device_mode="personal",
        bound_user_id="uid-zahra",
        session_user_id="uid-zahra",
    )
    host_tab = router.resolve_host_device(ctx_tab, "camera.capture")
    check("personal tablet camera", host_tab.device_id == "tablet-zahra")

    # Mismatch user perso → rejet output
    ctx_bad = RouteContext(
        origin_device_id="tablet-zahra",
        device_mode="personal",
        bound_user_id="uid-zahra",
        session_user_id="other-user",
    )
    out_bad = router.resolve_output_device(ctx_bad)
    check("personal mismatch rejected", out_bad.rejected)

    # Browser HUD → pas de push salon speaker
    out_browser = router.resolve_output_device(
        RouteContext(origin_device_id="tablet-zahra", device_mode="personal")
    )
    check("browser local TTS", out_browser.device_id is None)

    # Pi ear a speaker → route audio vers pi
    out_pi = router.resolve_output_device(ctx_pi)
    check("pi-salon speaker route", out_pi.device_id == "pi-salon")

    # Hermes tool → NUC
    tool = router.resolve_tool_device(ctx_pi, owner="hermes")
    check("hermes -> nuc", tool.device_id == _default_nuc_id())

    print("\nPHASE5 capability router : PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
