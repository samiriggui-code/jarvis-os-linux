"""Smoke — SceneStore + VISION_OBJECT_* (sans caméra, sans YOLO, sans Hermes)."""
from __future__ import annotations

import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def main() -> int:
    from jarvis_core.bus import Bus
    from jarvis_core.vision_objects import (
        SceneStore,
        VisionObjectRouter,
        ingest_perception_frame,
        normalize_object,
        signals_from_worker,
    )

    # Normalisation
    assert normalize_object({"object_id": "1", "label": "Cup", "bbox": {"x": 10, "y": 20, "width": 5, "height": 8}})["label"] == "cup"
    assert normalize_object({"id": "x"}) is None
    assert signals_from_worker({"objects": [{"object_id": "a", "label": "book", "confidence": 0.9, "bbox": {"x": 1, "y": 2, "w": 3, "h": 4}}]})

    clock = {"t": 1000.0}

    def now() -> float:
        return clock["t"]

    scene = SceneStore()
    bus = Bus()
    sub = bus.subscribe(name="test", maxsize=64)
    router = VisionObjectRouter(bus, scene)

    def publish(kind: str, payload: dict) -> None:
        bus.publish(kind, payload, source="test")

    # Frame 1 — nouveau
    snap = ingest_perception_frame(
        scene,
        publish,
        {
            "source": "mock",
            "objects": [
                {
                    "object_id": "t1",
                    "label": "bottle",
                    "confidence": 0.91,
                    "bbox": {"x": 10, "y": 20, "width": 15, "height": 40},
                }
            ],
        },
    )
    assert snap["count"] == 1
    kinds = []
    while True:
        ev = sub.get_nowait()
        if ev is None:
            break
        kinds.append(ev.kind)
        router.route(ev)
    assert "VISION_OBJECT_DETECTED" in kinds, kinds
    assert "VISION_SCENE" in kinds, kinds
    assert router.detected == 1

    # Frame 2 — même id, bbox bouge → UPDATED
    clock["t"] = 1000.5
    ingest_perception_frame(
        scene,
        publish,
        {
            "source": "mock",
            "objects": [
                {
                    "object_id": "t1",
                    "label": "bottle",
                    "confidence": 0.88,
                    "bbox": {"x": 12, "y": 20, "width": 15, "height": 40},
                }
            ],
        },
    )
    kinds2 = []
    while True:
        ev = sub.get_nowait()
        if ev is None:
            break
        kinds2.append(ev.kind)
        router.route(ev)
    assert "VISION_OBJECT_UPDATED" in kinds2, kinds2
    assert router.updated >= 1

    # Frame 3 — disparu → LOST
    ingest_perception_frame(scene, publish, {"source": "mock", "objects": []})
    kinds3 = []
    while True:
        ev = sub.get_nowait()
        if ev is None:
            break
        kinds3.append(ev.kind)
        router.route(ev)
    assert "VISION_OBJECT_LOST" in kinds3, kinds3
    assert scene.snapshot()["count"] == 0
    assert "Aucun objet" in scene.summary_text()

    # apply_tracks direct (horloge injectée)
    events = scene.apply_tracks(
        [
            {
                "object_id": "z",
                "label": "remote",
                "confidence": 0.7,
                "bbox": {"x": 50, "y": 50, "width": 10, "height": 10},
            }
        ],
        now=now(),
    )
    assert events[0][0] == "VISION_OBJECT_DETECTED"

    print("OK - vision objects smoke passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"ÉCHEC — {exc}", file=sys.stderr)
        raise SystemExit(1)
