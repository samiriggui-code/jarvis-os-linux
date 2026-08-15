# Vision Worker — local dev

Process **isolé** du Core et du Windows Agent. Publie des tracks objets
via WebSocket `type:perception` / `action:detections`.

## Règles

- Pas d'inference YOLO dans `windows_agent.py`
- Pas de toucher FaceEngine / holomat / `face_frame`
- Core décide (SceneStore + bus `VISION_OBJECT_*`) ; le Worker capte seulement

## Démarrage (mock, zéro YOLO)

```powershell
cd deploy\vision-worker
pip install -r requirements.txt
python worker.py --print-only          # dump JSON
python worker.py --ws ws://127.0.0.1:8765/ws --mock-once
python worker.py --mode mock --interval 0.5
```

## YOLO optionnel

```powershell
pip install ultralytics opencv-python-headless
$env:JARVIS_VISION_MODE = "yolo"
python worker.py --mode yolo
```

Sans Ultralytics, le Worker retombe automatiquement sur le mock.

## Contrat WS

```json
{
  "type": "perception",
  "action": "detections",
  "source": "vision-worker",
  "objects": [
    {
      "object_id": "mock-bottle",
      "label": "bottle",
      "confidence": 0.92,
      "bbox": { "x": 10, "y": 25, "width": 12, "height": 35 }
    }
  ]
}
```

`bbox` en **pourcent** (0–100), compatible `ObjectDetectionOverlay` HUD (Phase 5).
