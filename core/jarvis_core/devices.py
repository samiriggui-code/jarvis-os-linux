"""Device Capability Discovery — Phase 0/1 (lecture seule).

Jarvis sait quels devices existent, s'ils sont online, et quelles capacités
physiques ils annoncent. Pas d'exécution, pas de Tool Router, pas de Policy.

Couches (Tool Bus) :

    IntentCapability (produit, capabilities.py)  — inchangé
            ↓  (résolution future, hors Phase 0/1)
    HostCapability (physique, ce module)
            ↓
    Device (nuc-main, pi-salon, pc-portable…)

Protocole satellite → Core :

    device.register | device.capabilities | device.heartbeat
    GET /v1/devices

Device 1 : le HUD navigateur s'annonce via le même protocole (runtime_kind=browser).

`capability_id` (ex. ``camera.capture``) est l'identifiant stable pour le futur
lien Intent → Host → Device. Phase 0/1 l'enregistre seulement.
"""

from __future__ import annotations

import logging
import os
import socket
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("jarvis.devices")

# TTL sans heartbeat → online=False (secondes).
DEFAULT_TTL_S = float(os.environ.get("JARVIS_DEVICE_TTL_S", "120"))

DEVICE_MODES = frozenset({"personal", "shared", "gateway"})


@dataclass
class HostCapability:
    """Capacité physique d'une machine — pas une intention produit.

    ``name``      : libellé court (camera, microphone…)
    ``capability_id`` : identifiant stable futur routing (camera.capture)
    ``value``     : bool | str | number | object
    ``metadata``  : modèle, bus, notes…
    """

    name: str
    capability_id: str
    value: Any = True
    metadata: dict[str, Any] = field(default_factory=dict)
    last_seen: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "capability_id": self.capability_id,
            "value": self.value,
            "metadata": dict(self.metadata),
            "last_seen": self.last_seen,
        }

    @classmethod
    def from_payload(cls, raw: dict[str, Any]) -> HostCapability:
        cap_id = str(raw.get("capability_id") or raw.get("id") or "").strip()
        name = str(raw.get("name") or "").strip()
        if not name and cap_id:
            # Payload HUD Device 1 : souvent capability_id seul.
            name = cap_id.split(".", 1)[0]
        if not name:
            raise ValueError("capability.name ou capability_id requis")
        if not cap_id:
            # Défaut déterministe : name → name.capture pour capteurs courants
            # sinon name.available — évite un champ vide sans inventer un router.
            if name in ("camera", "microphone", "speaker", "screen", "gpio", "gpu"):
                verb = {
                    "camera": "capture",
                    "microphone": "input",
                    "speaker": "output",
                    "screen": "display",
                    "gpio": "access",
                    "gpu": "compute",
                }[name]
                cap_id = f"{name}.{verb}"
            else:
                cap_id = f"{name}.available"
        meta = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
        return cls(
            name=name,
            capability_id=cap_id,
            value=raw.get("value", True),
            metadata=dict(meta),
            last_seen=time.time(),
        )


@dataclass
class Device:
    """Machine connue du Core (déclarée, pas encore appairée crypto)."""

    device_id: str
    type: str  # nuc | raspberry_pi | pc_client | vps | other
    runtime_kind: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    online: bool = True
    last_seen: float = field(default_factory=time.time)
    capabilities: dict[str, HostCapability] = field(default_factory=dict)
    """Indexés par capability_id."""
    device_mode: str = "shared"
    """personal | shared | gateway — usage produit Phase 3."""
    bound_user_id: str = ""
    """Profil lié si device_mode=personal."""

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_id": self.device_id,
            "type": self.type,
            "runtime_kind": self.runtime_kind,
            "label": str(self.metadata.get("label") or ""),
            "metadata": dict(self.metadata),
            "online": self.online,
            "last_seen": self.last_seen,
            "capabilities": [c.to_dict() for c in self.capabilities.values()],
            "device_mode": self.device_mode,
            "bound_user_id": self.bound_user_id,
        }


def _default_nuc_id() -> str:
    return (os.environ.get("JARVIS_DEVICE_ID") or os.environ.get("JARVIS_HOST_ID") or "nuc-main").strip()


def _default_nuc_type() -> str:
    role = (os.environ.get("JARVIS_HOST_ROLE") or "core").strip().lower()
    if role in ("nuc", "core"):
        return "nuc"
    return role or "nuc"


class DeviceRegistry:
    """Registre mémoire — discovery only.

    Toute la logique device vit ici. L'Orchestrator ne fait qu'instancier,
    auto-enregistrer le NUC, et déléguer HTTP/WS.
    """

    def __init__(self, *, ttl_s: float = DEFAULT_TTL_S) -> None:
        self._ttl_s = ttl_s
        self._devices: dict[str, Device] = {}

    # ── API registry ─────────────────────────────────────────────────────────

    def register(
        self,
        device_id: str,
        *,
        type: str,
        runtime_kind: str = "",
        label: str = "",
        metadata: dict[str, Any] | None = None,
        device_mode: str = "",
        bound_user_id: str = "",
    ) -> Device:
        device_id = str(device_id or "").strip()
        if not device_id:
            raise ValueError("device_id requis")
        type_s = str(type or "other").strip() or "other"
        now = time.time()
        meta = dict(metadata or {})
        if label:
            meta["label"] = str(label).strip()
        mode_raw = str(
            device_mode or meta.get("device_mode") or ""
        ).strip().lower()
        if not mode_raw:
            mode_raw = "shared"
        if mode_raw not in DEVICE_MODES:
            mode_raw = "shared"
        bound = str(bound_user_id or meta.get("bound_user_id") or "").strip()
        existing = self._devices.get(device_id)
        if existing is None:
            dev = Device(
                device_id=device_id,
                type=type_s,
                runtime_kind=str(runtime_kind or ""),
                metadata=meta,
                online=True,
                last_seen=now,
                device_mode=mode_raw,
                bound_user_id=bound,
            )
            self._devices[device_id] = dev
            logger.info(
                "device register · %s type=%s mode=%s label=%s",
                device_id,
                type_s,
                mode_raw,
                meta.get("label") or "",
            )
            return dev
        existing.type = type_s
        if runtime_kind:
            existing.runtime_kind = str(runtime_kind)
        if meta:
            existing.metadata.update(meta)
        existing.device_mode = mode_raw
        if bound:
            existing.bound_user_id = bound
        existing.online = True
        existing.last_seen = now
        logger.debug("device re-register · %s", device_id)
        return existing

    def update_capabilities(
        self,
        device_id: str,
        capabilities: list[dict[str, Any]] | list[HostCapability],
    ) -> Device:
        device_id = str(device_id or "").strip()
        if not device_id:
            raise ValueError("device_id requis")
        dev = self._devices.get(device_id)
        if dev is None:
            # Register minimal then attach caps (Pi peut envoyer capabilities
            # juste après register, ou les deux dans le même flux).
            dev = self.register(device_id, type="other", runtime_kind="unknown")
        now = time.time()
        prev_ids = set(dev.capabilities.keys())
        inv_added: list[str] = []
        inv_removed: list[str] = []
        new_software: list[str] = []

        for raw in capabilities:
            if isinstance(raw, HostCapability):
                cap = raw
                cap.last_seen = now
            else:
                cap = HostCapability.from_payload(dict(raw))

            cap_id = cap.capability_id
            if cap_id == "system.inventory":
                meta = cap.metadata if isinstance(cap.metadata, dict) else {}
                added_raw = meta.get("added")
                removed_raw = meta.get("removed")
                if isinstance(added_raw, list):
                    inv_added = [str(x) for x in added_raw if str(x).strip()]
                if isinstance(removed_raw, list):
                    inv_removed = [str(x) for x in removed_raw if str(x).strip()]
            elif cap_id.startswith("app.software.") and cap_id not in prev_ids:
                new_software.append(cap_id)

            dev.capabilities[cap_id] = cap

        dev.online = True
        dev.last_seen = now

        if inv_added:
            logger.info(
                "device inventory +%d · %s · %s",
                len(inv_added),
                device_id,
                ", ".join(inv_added[:8]),
            )
        if inv_removed:
            logger.info(
                "device inventory -%d · %s · %s",
                len(inv_removed),
                device_id,
                ", ".join(inv_removed[:8]),
            )
        if new_software and not inv_added:
            logger.info(
                "device software caps +%d · %s",
                len(new_software),
                device_id,
            )

        logger.info(
            "device capabilities · %s · %d caps",
            device_id,
            len(dev.capabilities),
        )
        return dev

    def heartbeat(self, device_id: str, *, timestamp: float | None = None) -> Device:
        device_id = str(device_id or "").strip()
        if not device_id:
            raise ValueError("device_id requis")
        dev = self._devices.get(device_id)
        if dev is None:
            raise KeyError(f"device inconnu : {device_id}")
        ts = float(timestamp) if timestamp is not None else time.time()
        # timestamp client farfelu : on garde l'horloge Core.
        if abs(ts - time.time()) > 3600:
            ts = time.time()
        dev.last_seen = ts
        dev.online = True
        return dev

    def list_devices(self) -> list[dict[str, Any]]:
        self._refresh_online()
        return [d.to_dict() for d in sorted(self._devices.values(), key=lambda d: d.device_id)]

    def get_capabilities(self, device_id: str) -> list[dict[str, Any]]:
        self._refresh_online()
        dev = self._devices.get(str(device_id or "").strip())
        if dev is None:
            return []
        return [c.to_dict() for c in dev.capabilities.values()]

    def get_device(self, device_id: str) -> Device | None:
        self._refresh_online()
        return self._devices.get(str(device_id or "").strip())

    def iter_online(self) -> list[Device]:
        self._refresh_online()
        return [d for d in self._devices.values() if d.online]

    def _refresh_online(self) -> None:
        now = time.time()
        for dev in self._devices.values():
            if now - dev.last_seen > self._ttl_s:
                if dev.online:
                    logger.info("device offline (ttl) · %s", dev.device_id)
                dev.online = False

    # ── Auto-register machine Core (NUC) ─────────────────────────────────────

    def register_local_core(self) -> Device:
        """Au boot Orchestrator — le NUC s'annonce sans agent externe."""
        device_id = _default_nuc_id()
        host = socket.gethostname().lower()
        role = (os.environ.get("JARVIS_HOST_ROLE") or "core").strip()
        dev = self.register(
            device_id,
            type=_default_nuc_type(),
            runtime_kind="jarvis-core",
            metadata={
                "host": host,
                "role": role,
                "source": "local_boot",
            },
        )
        # Capacités physiques typiques du NUC serveur (pas de caméra kiosk).
        self.update_capabilities(
            device_id,
            [
                {
                    "name": "microphone",
                    "capability_id": "microphone.input",
                    "value": True,
                    "metadata": {"note": "disponible via clients / salon"},
                },
                {
                    "name": "speaker",
                    "capability_id": "speaker.output",
                    "value": True,
                    "metadata": {"note": "sortie locale ou salon_speaker"},
                },
                {
                    "name": "screen",
                    "capability_id": "screen.display",
                    "value": True,
                    "metadata": {"note": "HUD servi nginx, kiosk optionnel"},
                },
                {
                    "name": "gpu",
                    "capability_id": "gpu.compute",
                    "value": False,
                    "metadata": {},
                },
                {
                    "name": "camera",
                    "capability_id": "camera.capture",
                    "value": False,
                    "metadata": {"note": "caméra = clients / pi-salon, pas le Core"},
                },
            ],
        )
        return dev

    # ── Messages WS / HTTP ───────────────────────────────────────────────────

    def handle_message(self, data: dict[str, Any]) -> dict[str, Any]:
        """Traite ``type=device`` + ``action`` ou ``type=device.register`` etc."""
        action = str(data.get("action") or "").strip()
        kind = str(data.get("type") or "")
        if not action and kind.startswith("device."):
            action = kind.split(".", 1)[1]
        if action in ("register", "device.register"):
            return self._msg_register(data)
        if action in ("capabilities", "device.capabilities"):
            return self._msg_capabilities(data)
        if action in ("heartbeat", "device.heartbeat"):
            return self._msg_heartbeat(data)
        if action in ("list", "devices", ""):
            return {"ok": True, "type": "device_list", "devices": self.list_devices()}
        return {"ok": False, "type": "device_error", "error": f"action inconnue : {action}"}

    def handle_http(self, method: str, path: str, body: dict[str, Any] | None) -> dict[str, Any]:
        """Routage HTTP sous ``/v1/devices``."""
        path = path.rstrip("/") or "/v1/devices"
        method = method.upper()
        body = body or {}

        if method == "GET" and path in ("/v1/devices", "/v1/devices/list"):
            return {"ok": True, "devices": self.list_devices()}

        if method == "GET" and path.startswith("/v1/devices/"):
            rest = path[len("/v1/devices/") :]
            if rest.endswith("/capabilities"):
                device_id = rest[: -len("/capabilities")].rstrip("/")
                return {
                    "ok": True,
                    "device_id": device_id,
                    "capabilities": self.get_capabilities(device_id),
                }
            device_id = rest
            dev = self.get_device(device_id)
            if dev is None:
                return {"ok": False, "error": "not found"}
            return {"ok": True, "device": dev.to_dict()}

        if method == "POST" and path in (
            "/v1/devices/register",
            "/v1/devices/register.json",
        ):
            return self._msg_register(body)

        if method == "POST" and path in (
            "/v1/devices/capabilities",
            "/v1/devices/capabilities.json",
        ):
            return self._msg_capabilities(body)

        if method == "POST" and path in (
            "/v1/devices/heartbeat",
            "/v1/devices/heartbeat.json",
        ):
            return self._msg_heartbeat(body)

        return {"ok": False, "error": "not found"}

    @staticmethod
    def _device_type_from(data: dict[str, Any]) -> str:
        """Classe machine — `device_type` prioritaire.

        Sur WS, ``type`` est l'enveloppe (`device`) et ne doit pas devenir
        ``Device.type``. HTTP / seeds continuent d'envoyer ``type=raspberry_pi``.
        """
        for key in ("device_type", "host_type"):
            raw = data.get(key)
            if raw is not None and str(raw).strip():
                return str(raw).strip()
        t = str(data.get("type") or "other").strip() or "other"
        if t in ("device", "device.register", "device.capabilities", "device.heartbeat"):
            return "other"
        return t

    def _msg_register(self, data: dict[str, Any]) -> dict[str, Any]:
        try:
            meta = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
            # `label` top-level (HUD Device 1) → metadata décoratif.
            label = str(data.get("label") or meta.get("label") or "")
            dev = self.register(
                str(data.get("device_id") or ""),
                type=self._device_type_from(data),
                runtime_kind=str(data.get("runtime_kind") or ""),
                label=label,
                metadata=dict(meta),
                device_mode=str(data.get("device_mode") or meta.get("device_mode") or ""),
                bound_user_id=str(data.get("bound_user_id") or meta.get("bound_user_id") or ""),
            )
        except ValueError as exc:
            return {"ok": False, "type": "device_error", "error": str(exc)}
        return {"ok": True, "type": "device_registered", "device": dev.to_dict()}

    def _msg_capabilities(self, data: dict[str, Any]) -> dict[str, Any]:
        caps = data.get("capabilities")
        if not isinstance(caps, list):
            return {"ok": False, "type": "device_error", "error": "capabilities[] requis"}
        try:
            # Si type fourni sans register préalable
            device_id = str(data.get("device_id") or "")
            if device_id and device_id not in self._devices and (
                data.get("device_type") or data.get("type")
            ):
                self.register(
                    device_id,
                    type=self._device_type_from(data),
                    runtime_kind=str(data.get("runtime_kind") or ""),
                    metadata=data.get("metadata") if isinstance(data.get("metadata"), dict) else {},
                )
            dev = self.update_capabilities(device_id, caps)
        except ValueError as exc:
            return {"ok": False, "type": "device_error", "error": str(exc)}
        return {"ok": True, "type": "device_capabilities_ack", "device": dev.to_dict()}

    def _msg_heartbeat(self, data: dict[str, Any]) -> dict[str, Any]:
        try:
            ts = data.get("timestamp")
            dev = self.heartbeat(
                str(data.get("device_id") or ""),
                timestamp=float(ts) if ts is not None else None,
            )
        except (ValueError, KeyError) as exc:
            return {"ok": False, "type": "device_error", "error": str(exc)}
        return {
            "ok": True,
            "type": "device_heartbeat_ack",
            "device_id": dev.device_id,
            "online": dev.online,
            "last_seen": dev.last_seen,
        }


# Exemple Pi salon — utilisé / seed de test uniquement (pas le runtime Pi).
PI_SALON_SEED: dict[str, Any] = {
    "device_id": "pi-salon",
    "type": "raspberry_pi",
    "runtime_kind": "jarvis-ear",
    "metadata": {"role": "salon", "source": "seed"},
    "capabilities": [
        {
            "name": "camera",
            "capability_id": "camera.capture",
            "value": True,
            "metadata": {"model": "LG_USB"},
        },
        {
            "name": "speaker",
            "capability_id": "speaker.output",
            "value": True,
            "metadata": {"via": "jack"},
        },
        {
            "name": "gpio",
            "capability_id": "gpio.access",
            "value": True,
            "metadata": {},
        },
        {
            "name": "microphone",
            "capability_id": "microphone.input",
            "value": True,
            "metadata": {"via": "jarvis-ear", "wake": "hey_jarvis"},
        },
    ],
}


def apply_seed(registry: DeviceRegistry, seed: dict[str, Any] | None = None) -> Device:
    """Outil de test — le Pi réel doit POST device.register / capabilities."""
    payload = dict(seed or PI_SALON_SEED)
    caps = payload.pop("capabilities", [])
    device_id = str(payload.get("device_id") or "")
    registry.register(
        device_id,
        type=str(payload.get("type") or "other"),
        runtime_kind=str(payload.get("runtime_kind") or ""),
        metadata=payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {},
    )
    return registry.update_capabilities(device_id, caps if isinstance(caps, list) else [])
