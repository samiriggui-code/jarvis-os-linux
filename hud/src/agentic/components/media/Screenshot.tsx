import { MediaFrame } from './MediaFrame';
import { Icon } from '../../../visual/Icon';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface ScreenshotProps {
  src?: string;
  alt?: string;
  caption?: string;
  windowTitle?: string;
}

export function Screenshot({ src, alt, caption, windowTitle }: ScreenshotProps) {
  const theme = useSpatialTheme();
  return (
    <MediaFrame titlebar={windowTitle ?? 'Capture'} caption={caption} aspectRatio={16 / 9}>
      {src ? (
        <img src={src} alt={alt ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Icon name="image" size={32} color={theme.textMuted} />
      )}
    </MediaFrame>
  );
}

export default Screenshot;
