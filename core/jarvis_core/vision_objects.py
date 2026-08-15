"""Vision objets — scène courante + routage bus (≠ face / holomat).

Le Vision Worker (process isolé) envoie des tracks via ``type:perception``.
Le Core **décide** du contexte : diff → ``VISION_OBJECT_*``, stockage scène.
Aucune action OS depuis un objet détecté — Policy obligatoire plus tard.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from .bus import Bus, Event

logger = logging.getLogger("jarvis.vision_objects")

WATCHED: tuple[str, ...] = (
    "VISION_OBJECT_DETECTED",
    "VISION_OBJECT_UPDATED",
    "VISION_OBJECT_LOST",
)


def _unit(raw: Any) -> float | None:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if value != value:
        return None
    return min(max(value, 0.0), 1.0)


def _bbox(raw: Any) -> dict[str, float] | None:
    """Boîte en % (0–100) — contrat HUD ObjectDetectionOverlay."""
    if not isinstance(raw, dict):
        return None
    try:
        x = float(raw.get("x", 0))
        y = float(raw.get("y", 0))
        w = float(raw.get("width", raw.get("w", 0)))
        h = float(raw.get("height", raw.get("h", 0)))
    except (TypeError, ValueError):
        return None
    return {
        "x": min(max(x, 0.0), 100.0),
        "y": min(max(y, 0.0), 100.0),
        "width": min(max(w, 0.0), 100.0),
        "height": min(max(h, 0.0), 100.0),
    }


def normalize_object(raw: Any) -> dict[str, Any] | None:
    """Track Worker → dict canonique, ou None si illisible."""
    if not isinstance(raw, dict):
        return None
    object_id = str(raw.get("object_id") or raw.get("id") or "").strip()
    label = str(raw.get("label") or raw.get("class") or "").strip().lower()
    if not object_id or not label:
        return None
    conf = _unit(raw.get("confidence", raw.get("score", 1.0)))
    if conf is None:
        conf = 1.0
    box = _bbox(raw.get("bbox") or raw.get("box") or raw)
    if box is None:
        return None
    out: dict[str, Any] = {
        "object_id": object_id,
        "label": label,
        "confidence": conf,
        "bbox": box,
    }
    if raw.get("track_id") is not None:
        out["track_id"] = raw.get("track_id")
    return out


def signals_from_worker(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Message ``type:perception`` action detections/scene → tracks normalisés."""
    raw_list = data.get("objects") or data.get("detections") or []
    if not isinstance(raw_list, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw_list:
        obj = normalize_object(item)
        if obj is not None:
            out.append(obj)
    return out


@dataclass
class SceneObject:
    object_id: str
    label: str
    confidence: float
    bbox: dict[str, float]
    first_seen: float
    last_seen: float
    track_id: Any = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "object_id": self.object_id,
            "label": self.label,
            "confidence": self.confidence,
            "bbox": dict(self.bbox),
            "first_seen": self.first_seen,
            "last_seen": self.last_seen,
        }
        if self.track_id is not None:
            d["track_id"] = self.track_id
        return d


@dataclass
class SceneStore:
    """Scène courante — diff tracks Worker → événements bus."""

    source: str = "vision-worker"
    objects: dict[str, SceneObject] = field(default_factory=dict)
    updated_at: float = 0.0
    frames: int = 0

    def apply_tracks(
        self,
        tracks: list[dict[str, Any]],
        *,
        source: str | None = None,
        now: float | None = None,
    ) -> list[tuple[str, dict[str, Any]]]:
        """Applique une frame de tracks. Retourne ``(kind, payload)`` à publier."""
        ts = now if now is not None else time.time()
        if source:
            self.source = source
        self.frames += 1
        self.updated_at = ts

        incoming: dict[str, dict[str, Any]] = {}
        for t in tracks:
            oid = str(t["object_id"])
            incoming[oid] = t

        events: list[tuple[str, dict[str, Any]]] = []

        for oid, track in incoming.items():
            prev = self.objects.get(oid)
            if prev is None:
                obj = SceneObject(
                    object_id=oid,
                    label=str(track["label"]),
                    confidence=float(track["confidence"]),
                    bbox=dict(track["bbox"]),
                    first_seen=ts,
                    last_seen=ts,
                    track_id=track.get("track_id"),
                )
                self.objects[oid] = obj
                events.append(("VISION_OBJECT_DETECTED", obj.to_dict()))
            else:
                moved = prev.bbox != track["bbox"] or prev.label != track["label"]
                prev.label = str(track["label"])
                prev.confidence = float(track["confidence"])
                prev.bbox = dict(track["bbox"])
                prev.last_seen = ts
                if track.get("track_id") is not None:
                    prev.track_id = track.get("track_id")
                if moved:
                    events.append(("VISION_OBJECT_UPDATED", prev.to_dict()))

        lost_ids = [oid for oid in self.objects if oid not in incoming]
        for oid in lost_ids:
            lost = self.objects.pop(oid)
            payload = lost.to_dict()
            payload["lost_at"] = ts
            events.append(("VISION_OBJECT_LOST", payload))

        return events

    def clear(self) -> list[tuple[str, dict[str, Any]]]:
        events = [
            ("VISION_OBJECT_LOST", {**obj.to_dict(), "lost_at": time.time()})
            for obj in self.objects.values()
        ]
        self.objects.clear()
        self.updated_at = time.time()
        return events

    def snapshot(self) -> dict[str, Any]:
        objs = [o.to_dict() for o in self.objects.values()]
        return {
            "source": self.source,
            "updated_at": self.updated_at,
            "frames": self.frames,
            "count": len(objs),
            "objects": objs,
        }

    def summary_text(self, *, limit: int = 8) -> str:
        objs = sorted(
            self.objects.values(),
            key=lambda o: o.confidence,
            reverse=True,
        )[:limit]
        if not objs:
            return "Aucun objet suivi dans la scène courante."
        parts = [f"{o.label} ({o.confidence:.0%})" for o in objs]
        return "Scène : " + ", ".join(parts) + "."


class VisionObjectRouter:
    """Abonné bus — contexte seulement (pas d'action OS).

    Aujourd'hui : compteurs + log. Point d'extension pour modes / Policy.
    """

    def __init__(self, bus: Bus, scene: SceneStore) -> None:
        self.bus = bus
        self.scene = scene
        self.detected = 0
        self.updated = 0
        self.lost = 0

    def route(self, event: Event) -> None:
        if event.kind == "VISION_OBJECT_DETECTED":
            self.detected += 1
        elif event.kind == "VISION_OBJECT_UPDATED":
            self.updated += 1
        elif event.kind == "VISION_OBJECT_LOST":
            self.lost += 1

    async def run(self) -> None:
        sub = self.bus.subscribe(WATCHED, name="vision-objects", maxsize=64)
        logger.info("routeur vision objets armé sur %s", ", ".join(WATCHED))
        while True:
            event = await sub.get()
            try:
                self.route(event)
            except Exception as exc:  # noqa: BLE001
                logger.warning("routage vision (%s) : %s", event.kind, exc)

    def stats(self) -> dict[str, Any]:
        return {
            "detected": self.detected,
            "updated": self.updated,
            "lost": self.lost,
            "scene_count": len(self.scene.objects),
        }


def ingest_perception_frame(
    scene: SceneStore,
    publish: Callable[[str, dict[str, Any]], Any],
    data: dict[str, Any],
) -> dict[str, Any]:
    """Normalise + diff + publie. Retourne le snapshot scène."""
    tracks = signals_from_worker(data)
    source = str(data.get("source") or "vision-worker").strip() or "vision-worker"
    events = scene.apply_tracks(tracks, source=source)
    for kind, payload in events:
        publish(kind, payload)
    snap = scene.snapshot()
    publish("VISION_SCENE", snap)
    return snap
