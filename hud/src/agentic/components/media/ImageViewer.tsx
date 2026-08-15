import { MediaFrame } from './MediaFrame';
import { Icon } from '../../../visual/Icon';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface ImageViewerProps {
  src?: string;
  alt?: string;
  caption?: string;
}

export function ImageViewer({ src, alt, caption }: ImageViewerProps) {
  const theme = useSpatialTheme();
  return (
    <MediaFrame caption={caption} aspectRatio={4 / 3}>
      {src ? (
        <img src={src} alt={alt ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Icon name="image" size={32} color={theme.textMuted} />
      )}
    </MediaFrame>
  );
}

export default ImageViewer;
