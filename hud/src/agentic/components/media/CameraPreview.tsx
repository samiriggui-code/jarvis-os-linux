/**
 * Preset décoratif de MediaFrame — AUCUN `getUserMedia`. Le composant réel
 * qui accède à la caméra reste `app/components/CameraPreview.tsx`
 * (registry-bound, production, non touché).
 */
import { MediaFrame } from './MediaFrame';
import { Icon } from '../../../visual/Icon';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface CameraPreviewProps {
  caption?: string;
  mirrored?: boolean;
}

export function CameraPreview({ caption, mirrored }: CameraPreviewProps) {
  const theme = useSpatialTheme();
  return (
    <MediaFrame titlebar="Caméra" caption={caption} aspectRatio={16 / 9}>
      <div style={{ transform: mirrored ? 'scaleX(-1)' : undefined }}>
        <Icon name="camera" size={32} color={theme.textMuted} />
      </div>
    </MediaFrame>
  );
}

export default CameraPreview;
