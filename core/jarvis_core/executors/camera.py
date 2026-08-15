"""Core executors — caméra satellite (LG AN-VC500 @ pi-salon, via jarvis_cam.py).

Une seule source vidéo dans tout l'écosystème : le flux MJPEG déjà exposé par
`jarvis_cam.py` sur le Pi salon (`:8768`). Ce module ne crée pas de second
serveur vidéo — il donne à Core (et via Core, au HUD et à Vision) un chemin
explicite vers cette source précise, avec `device_id` et `source` déclarés
sans ambiguïté (jamais la webcam locale du HUD).

Surface unique : ces deux exécuteurs publient directement une surface
"salon-camera" (composant `ImageViewer`, déjà existant côté HUD — jamais
dupliqué). Ils ne sont PAS dans `surface_decision.INTENT_SURFACE_APP` : ça
déclencherait aussi le mécanisme générique `_maybe_publish_surface_decision`
(pensé pour les résultats d'outils Hermes), qui écraserait cette surface avec
un `ResultPanel` vide — bug constaté et corrigé.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
from dataclasses import replace
from typing import Any
from urllib import error, request

logger = logging.getLogger("jarvis.core")

CAMERA_DEVICE_ID = "pi-salon"
CAMERA_SOURCE = "LG AN-VC500"
CAMERA_SURFACE_ID = "salon-camera"

_CAM_HOST = os.environ.get("JARVIS_SALON_CAM_HOST", "192.168.1.27")
_CAM_PORT = os.environ.get("JARVIS_SALON_CAM_PORT", "8768")
_CAM_BASE = f"http://{_CAM_HOST}:{_CAM_PORT}"
_CAM_TIMEOUT_S = 12.0

# Prod/distant : base publique tunnelée (NUC nginx + auth_request), non définie
# en dev local. Dev local (défaut) : le HUD (navigateur, même LAN que le Pi)
# résout l'URL directe du Pi salon — pas de proxy local, testé et accepté
# (chantier caméra, audit réseau : accès LAN direct déjà vérifié).
_CAMERA_PUBLIC_BASE = os.environ.get("JARVIS_CAMERA_PUBLIC_BASE", "").rstrip("/")


class CameraUnavailable(RuntimeError):
    """La caméra pi-salon ne répond pas — jamais silencieux."""


def _fetch_snapshot_bytes() -> bytes:
    req = request.Request(f"{_CAM_BASE}/snapshot.jpg", method="GET")
    try:
        with request.urlopen(req, timeout=_CAM_TIMEOUT_S) as resp:
            return resp.read()
    except error.HTTPError as exc:
        raise CameraUnavailable(f"HTTP {exc.code} depuis jarvis_cam (pi-salon)") from exc
    except Exception as exc:  # noqa: BLE001
        raise CameraUnavailable(f"caméra pi-salon injoignable : {exc}") from exc


def _stream_url(token: str | None = None) -> str:
    if _CAMERA_PUBLIC_BASE:
        q = f"?device_id={CAMERA_DEVICE_ID}" + (f"&t={token}" if token else "")
        return f"{_CAMERA_PUBLIC_BASE}/v1/salon/camera/stream.mjpg{q}"
    # Dev local : direct vers le Pi, aucun proxy local n'existe pour ce chemin
    # (constaté : le chemin relatif nginx ne résout à rien sur Vite :5173).
    return f"{_CAM_BASE}/stream.mjpg"


async def _publish_camera_surface(orch: Any, *, src: str, caption: str) -> None:
    """Publie LA surface caméra dédiée (ImageViewer) — jamais un ResultPanel.

    Même mécanique d'admission que `surfaces.publisher.publish_result_surface`
    (catalogue, permissions, contexte) mais ciblant `ImageViewer`, pas
    `ResultPanel` — composant HUD déjà existant (`agentic/components/media/
    ImageViewer.tsx`), pas de duplication.
    """
    from ..surfaces.admission import SurfaceRejected, validate_document

    document = {
        "surfaces": {
            CAMERA_SURFACE_ID: {
                "root": ["camera-main"],
                "components": {
                    "camera-main": {
                        "name": "ImageViewer",
                        "props": {"src": src, "alt": "Caméra salon", "caption": caption},
                        "state": "idle",
                    }
                },
            }
        }
    }
    try:
        permissions, context = orch._surface_guards()
        document = validate_document(
            document, orch.surfaces.catalog, permissions=permissions,
            context=context, bindings=orch.bindings,
        )
    except SurfaceRejected as exc:
        logger.warning("surface caméra refusée · %s", exc)
        return
    except Exception as exc:  # noqa: BLE001
        logger.warning("surface caméra impossible · %s", exc)
        return

    event = orch.surfaces.snapshot(document)
    await orch.broadcast({"type": "hud_command", "action": "open_space", "app": CAMERA_SURFACE_ID})
    await asyncio.sleep(0.25)
    await orch.broadcast(event)


class CameraExecutorsMixin:

    async def _execute_home_camera_list(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Caméras connues — aujourd'hui une seule, déclarée explicitement."""
        cameras = [
            {
                "device_id": CAMERA_DEVICE_ID,
                "label": "Salon",
                "source": CAMERA_SOURCE,
                "capabilities": ["live", "snapshot"],
            }
        ]
        devices = getattr(self, "devices", None)
        online = None
        if devices is not None:
            dev = devices.get_device(CAMERA_DEVICE_ID)
            online = bool(dev and getattr(dev, "online", False))
        if online is not None:
            cameras[0]["online"] = online
        return {"ok": True, "cameras": cameras}

    async def _execute_home_camera_view(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Ouvre le flux LIVE pi-salon côté HUD — jamais la webcam locale."""
        from ..camera_access import mint_camera_token

        uid = self._session_user_id() or "local"
        token = mint_camera_token(CAMERA_DEVICE_ID) if _CAMERA_PUBLIC_BASE else None
        stream_url = _stream_url(token)

        await _publish_camera_surface(self, src=stream_url, caption="Salon — LG AN-VC500 (live)")
        await self.say(
            "camera_live_opened",
            bindings={"room": "salon"},
            fallback_text="Voici la caméra du salon.",
            user_id=uid,
        )
        return {
            "ok": True,
            "device_id": CAMERA_DEVICE_ID,
            "source": CAMERA_SOURCE,
            "stream_url": stream_url,
        }

    async def _execute_home_camera_snapshot(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Une image pi-salon — jamais un snapshot fabriqué ni la webcam HUD."""
        from ..capabilities import Owner, for_intent
        from ..hermes.bridge import HermesRefused, HermesUnavailable, strip_hermes_display_text

        uid = self._session_user_id() or "local"
        role = self._session_role()

        try:
            raw = await asyncio.to_thread(_fetch_snapshot_bytes)
        except CameraUnavailable as exc:
            await self.say(
                "device_unreachable",
                bindings={"device": "caméra du salon"},
                fallback_text=str(exc),
                user_id=uid,
            )
            return {"ok": False, "reason": str(exc), "device_id": CAMERA_DEVICE_ID}

        jpeg_b64 = base64.b64encode(raw).decode("ascii")

        await _publish_camera_surface(
            self,
            src=f"data:image/jpeg;base64,{jpeg_b64}",
            caption="Salon — LG AN-VC500 (snapshot)",
        )

        analyze = bool(payload.get("analyze"))
        if not analyze:
            return {
                "ok": True,
                "device_id": CAMERA_DEVICE_ID,
                "source": CAMERA_SOURCE,
                "jpeg_b64": jpeg_b64,
                "analyzed": False,
            }

        cap = for_intent("vision.analyze")
        if cap is None:
            return {
                "ok": True,
                "device_id": CAMERA_DEVICE_ID,
                "source": CAMERA_SOURCE,
                "jpeg_b64": jpeg_b64,
                "analyzed": False,
                "reason": "capability vision.analyze absente",
            }
        prompt = str(payload.get("prompt") or "").strip() or (
            "Décris brièvement en français ce que montre cette image du salon."
        )
        decision = self.policy.evaluate(action=cap.intent, text=prompt, risk=cap.risk)
        if not decision.allowed:
            return {
                "ok": True,
                "device_id": CAMERA_DEVICE_ID,
                "jpeg_b64": jpeg_b64,
                "analyzed": False,
                "reason": decision.reason or "refusé par la Policy",
            }

        hermes_cap = replace(cap, owner=Owner.HERMES, toolset="vision")
        try:
            reply = await self.hermes.ask(
                hermes_cap, prompt, role=role, decision=decision, image_b64=jpeg_b64,
            )
        except (HermesUnavailable, HermesRefused) as exc:
            return {
                "ok": True,
                "device_id": CAMERA_DEVICE_ID,
                "jpeg_b64": jpeg_b64,
                "analyzed": False,
                "reason": str(exc),
            }

        text = strip_hermes_display_text(reply.text or "")
        if text:
            ev = await self.speak_hermes(text, user_id=uid)
            await self.broadcast(ev)
            await self.handoff_speaker_jarvis()
        return {
            "ok": True,
            "device_id": CAMERA_DEVICE_ID,
            "source": CAMERA_SOURCE,
            "jpeg_b64": jpeg_b64,
            "analyzed": bool(text),
            "text": text,
        }
