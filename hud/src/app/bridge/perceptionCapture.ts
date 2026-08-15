/**
 * Snapshot perception objet — contrat `type:perception` (≠ holomat face_frame).
 *
 * Le HUD capte une image ponctuelle quand le Core le demande via
 * `hud_command` / `capture_perception`. Aucune analyse locale.
 */
import { acquireCamera, getCameraStream, releaseCamera } from './mediaDevices';
import { getCoreClient } from './coreClient';

let grabCanvas: HTMLCanvasElement | null = null;

async function jpegFromStream(
  stream: MediaStream,
  quality = 0.72,
  maxWidth = 960,
): Promise<string | null> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    return null;
  }
  await new Promise<void>((resolve) => {
    if (video.readyState >= 2) resolve();
    else video.onloadeddata = () => resolve();
  });

  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;

  const scale = w > maxWidth ? maxWidth / w : 1;
  grabCanvas = grabCanvas || document.createElement('canvas');
  grabCanvas.width = Math.max(1, Math.round(w * scale));
  grabCanvas.height = Math.max(1, Math.round(h * scale));
  const ctx = grabCanvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, grabCanvas.width, grabCanvas.height);
  const dataUrl = grabCanvas.toDataURL('image/jpeg', quality);
  return dataUrl.replace(/^data:image\/jpeg;base64,/, '');
}

export async function captureAndSendPerception(requestId: string): Promise<void> {
  const client = getCoreClient();
  const stream = (await acquireCamera('perception')) || getCameraStream();
  if (!stream) {
    client.send({
      type: 'perception',
      action: 'snapshot',
      request_id: requestId,
      ok: false,
      error: 'camera_refused',
    });
    return;
  }

  try {
    const jpeg_b64 = await jpegFromStream(stream);
    if (!jpeg_b64) {
      client.send({
        type: 'perception',
        action: 'snapshot',
        request_id: requestId,
        ok: false,
        error: 'frame_empty',
      });
      return;
    }
    client.send({
      type: 'perception',
      action: 'snapshot',
      request_id: requestId,
      jpeg_b64,
    });
  } finally {
    releaseCamera('perception');
  }
}
