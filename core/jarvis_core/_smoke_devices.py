"""Smoke Device Capability Discovery — Phase 0 (sans réseau).

    python -m jarvis_core._smoke_devices
"""
from __future__ import annotations

from .devices import PI_SALON_SEED, DeviceRegistry, HostCapability, apply_seed


def check(label: str, cond: bool) -> None:
    status = "OK" if cond else "FAIL"
    print(f"  [{status}] {label}")
    if not cond:
        raise SystemExit(1)


def main() -> None:
    print("\n1. NUC auto-register")
    reg = DeviceRegistry(ttl_s=120)
    nuc = reg.register_local_core()
    check("device_id set", bool(nuc.device_id))
    check("online", nuc.online is True)
    caps = {c.capability_id: c for c in nuc.capabilities.values()}
    check("microphone.input", "microphone.input" in caps and caps["microphone.input"].value is True)
    check("speaker.output", "speaker.output" in caps)
    check("screen.display", "screen.display" in caps)
    check("camera.capture false on NUC", caps.get("camera.capture") is not None and caps["camera.capture"].value is False)

    print("\n2. Pi salon via register + capabilities (mecanisme normal)")
    reg.handle_message(
        {
            "type": "device",
            "action": "register",
            "device_id": "pi-salon",
            "type": "raspberry_pi",
            "runtime_kind": "jarvis-ear",
            "metadata": {"role": "salon"},
        }
    )
    ack = reg.handle_message(
        {
            "type": "device",
            "action": "capabilities",
            "device_id": "pi-salon",
            "capabilities": PI_SALON_SEED["capabilities"],
        }
    )
    check("capabilities ack", ack.get("ok") is True)
    pi_caps = {c["capability_id"]: c for c in reg.get_capabilities("pi-salon")}
    check("camera.capture", pi_caps.get("camera.capture", {}).get("value") is True)
    check("LG_USB metadata", pi_caps.get("camera.capture", {}).get("metadata", {}).get("model") == "LG_USB")
    check("gpio.access", "gpio.access" in pi_caps)
    check("speaker.output on pi", "speaker.output" in pi_caps)

    print("\n3. heartbeat + list")
    hb = reg.handle_message({"action": "heartbeat", "device_id": "pi-salon", "timestamp": None})
    check("heartbeat ok", hb.get("ok") is True)
    devices = reg.list_devices()
    ids = {d["device_id"] for d in devices}
    check("nuc + pi in list", nuc.device_id in ids and "pi-salon" in ids)

    print("\n4. HTTP handle GET /v1/devices")
    listed = reg.handle_http("GET", "/v1/devices", None)
    check("GET ok", listed.get("ok") is True and len(listed.get("devices") or []) >= 2)

    print("\n5. HostCapability.from_payload default capability_id")
    c = HostCapability.from_payload({"name": "camera", "value": True})
    check("default camera.capture", c.capability_id == "camera.capture")
    c2 = HostCapability.from_payload({"capability_id": "audio.input", "value": True})
    check("id-only audio.input", c2.capability_id == "audio.input" and c2.name == "audio")

    print("\n6. HUD-style register + label (WS envelope)")
    hud_id = "a8f3c91e-test-0000-0000-000000000001"
    ack = reg.handle_message(
        {
            "type": "device",
            "action": "register",
            "device_id": hud_id,
            "device_type": "pc_client",
            "runtime_kind": "web_hud",
            "label": "Portable Samir",
        }
    )
    check("pc register", ack.get("ok") is True)
    pc = reg.get_device(hud_id)
    check("pc type pc_client", pc is not None and pc.type == "pc_client")
    check("pc runtime web_hud", pc is not None and pc.runtime_kind == "web_hud")
    check("pc label", pc is not None and pc.to_dict().get("label") == "Portable Samir")
    # Envelope type=device must not become Device.type
    check("ws type not leaked", pc is not None and pc.type != "device")
    reg.handle_message(
        {
            "type": "device",
            "action": "capabilities",
            "device_id": hud_id,
            "capabilities": [
                {"capability_id": "camera.capture", "value": True},
                {"capability_id": "audio.input", "value": True},
                {"capability_id": "audio.output", "value": True},
                {"capability_id": "display.screen", "value": True},
            ],
        }
    )
    pc_caps = {c["capability_id"]: c for c in (reg.get_capabilities(hud_id) or [])}
    check("pc camera.capture", pc_caps.get("camera.capture", {}).get("value") is True)
    check("pc no touch when omitted", "touch.input" not in pc_caps)

    print("\n7. seed helper (test only)")
    reg2 = DeviceRegistry()
    apply_seed(reg2)
    check("seed pi present", reg2.get_device("pi-salon") is not None)

    print("\nOK — device registry phase 0/1")


if __name__ == "__main__":
    main()
