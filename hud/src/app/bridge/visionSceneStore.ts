/**
 * Consommateur HUD de `VISION_SCENE` (SceneStore Core → bus → WS).
 * Boîtes en % — contrat ObjectDetectionOverlay.
 */
import { useEffect, useState } from 'react';
import { getCoreClient } from './coreClient';
import type { DetectionBox } from '../../agentic/components/media/ObjectDetectionOverlay';

type Listener = (boxes: DetectionBox[]) => void;

let boxes: DetectionBox[] = [];
const listeners = new Set<Listener>();
let booted = false;

function emit() {
  listeners.forEach((fn) => fn(boxes));
}

function boxFromObject(raw: unknown): DetectionBox | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const bbox = (o.bbox && typeof o.bbox === 'object') ? o.bbox as Record<string, unknown> : o;
  const label = String(o.label || '').trim();
  if (!label) return null;
  const x = Number(bbox.x);
  const y = Number(bbox.y);
  const width = Number(bbox.width ?? bbox.w);
  const height = Number(bbox.height ?? bbox.h);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  const conf = o.confidence;
  return {
    label,
    x,
    y,
    width,
    height,
    confidence: typeof conf === 'number' ? conf : undefined,
  };
}

export function getVisionBoxes(): DetectionBox[] {
  return boxes;
}

export function subscribeVisionScene(fn: Listener): () => void {
  listeners.add(fn);
  fn(boxes);
  return () => { listeners.delete(fn); };
}

export function bootVisionSceneStore(): void {
  if (booted) return;
  booted = true;
  getCoreClient().subscribe((data) => {
    if (data.type !== 'VISION_SCENE') return;
    const list = Array.isArray(data.objects) ? data.objects : [];
    boxes = list.map(boxFromObject).filter((b): b is DetectionBox => b !== null);
    emit();
  });
}

export function useVisionBoxes(): DetectionBox[] {
  const [list, setList] = useState<DetectionBox[]>(boxes);
  useEffect(() => subscribeVisionScene(setList), []);
  return list;
}
