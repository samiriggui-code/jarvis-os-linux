/** Preset décoratif de MediaFrame — poster uniquement, aucune lecture réelle. */
import { MediaFrame } from './MediaFrame';
import { Icon } from '../../../visual/Icon';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface VideoPreviewProps {
  caption?: string;
  poster?: string;
}

export function VideoPreview({ caption, poster }: VideoPreviewProps) {
  const theme = useSpatialTheme();
  return (
    <MediaFrame caption={caption} aspectRatio={16 / 9}>
      {poster ? (
        <img src={poster} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : null}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex' }}>
        <Icon name="play" size={36} color={theme.text} />
      </div>
    </MediaFrame>
  );
}

export default VideoPreview;
