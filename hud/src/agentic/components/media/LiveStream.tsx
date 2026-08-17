/**
 * LiveStream — lecteur A/V distant (caméra salon Pi).
 *
 * Source fournie par le Core (URL fMP4 / HLS). Jamais getUserMedia :
 * ce n'est pas la webcam du HUD (`CameraPreview`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MediaFrame } from './MediaFrame';
import { Icon } from '../../../visual/Icon';
import { GlassButton } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface LiveStreamProps {
  src?: string;
  caption?: string;
  titlebar?: string;
  muted?: boolean;
}

export function LiveStream({ src, caption, titlebar, muted = false }: LiveStreamProps) {
  const theme = useSpatialTheme();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [blocked, setBlocked] = useState(false);

  const tryPlay = useCallback(async (withSound: boolean) => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !withSound;
    try {
      await el.play();
      setBlocked(false);
    } catch {
      setBlocked(true);
    }
  }, []);

  useEffect(() => {
    if (!src) return;
    void tryPlay(!muted);
  }, [src, muted, tryPlay]);

  return (
    <MediaFrame caption={caption} titlebar={titlebar} aspectRatio={16 / 9}>
      {src ? (
        <>
          <video
            ref={videoRef}
            src={src}
            autoPlay
            playsInline
            muted={muted}
            controls
            style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
          />
          {blocked ? (
            <GlassButton
              tone="accent"
              icon={<Icon name="volume" size={16} />}
              onClick={() => void tryPlay(true)}
              style={{ position: 'absolute', inset: 0, margin: 'auto', width: 'min(220px, 80%)', height: 40 }}
            >
              Activer le son
            </GlassButton>
          ) : null}
        </>
      ) : (
        <Icon name="camera" size={32} color={theme.textMuted} />
      )}
    </MediaFrame>
  );
}

export default LiveStream;
