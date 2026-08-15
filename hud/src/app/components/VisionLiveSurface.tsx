/**
 * Surface Holomat / vision — CameraPreview produit + overlay SceneStore.
 */
import { CameraPreview } from './CameraPreview';
import { ObjectDetectionOverlay } from '../../agentic/components/media/ObjectDetectionOverlay';
import { useVisionBoxes } from '../bridge/visionSceneStore';
import { visionCaption } from './visionChrome';
import { tokens } from '../../ui/tokens';

export function VisionLiveSurface() {
  const boxes = useVisionBoxes();

  return (
    <div style={{ position: 'relative', height: '100%', minHeight: 0 }}>
      <ObjectDetectionOverlay boxes={boxes}>
        <CameraPreview
          active
          mirrored={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </ObjectDetectionOverlay>
      <p
        style={{
          ...visionCaption,
          position: 'absolute',
          left: 12,
          bottom: 12,
          margin: 0,
          padding: '4px 8px',
          borderRadius: 8,
          background: tokens.color.surfaceRaised,
          zIndex: 2,
        }}
      >
        {boxes.length === 0
          ? 'Scène vide — en attente du Worker (mock accepté).'
          : `${boxes.length} objet${boxes.length > 1 ? 's' : ''} · SceneStore`}
      </p>
    </div>
  );
}
