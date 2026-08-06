/**
 * Preview caméra live (auth / Holomat).
 * Un seul MediaStream partagé — ne coupe jamais les tracks au unmount.
 */
import React, { useEffect, useRef, useState } from 'react';
import { acquireCamera, getCameraStream, releaseCamera, subscribeMedia } from '../bridge/mediaDevices';

interface CameraPreviewProps {
  active?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Opacité du flux (hologramme par-dessus) */
  opacity?: number;
  mirrored?: boolean;
}

export function CameraPreview({
  active = true,
  className = '',
  style,
  opacity = 1,
  mirrored = true,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!active) {
      setOk(false);
      return;
    }
    let cancelled = false;

    const bind = async (stream: MediaStream) => {
      const el = videoRef.current;
      if (!el || cancelled) return;
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      try {
        if (el.readyState < 2) {
          await new Promise<void>((resolve, reject) => {
            const onReady = () => {
              el.removeEventListener('loadeddata', onReady);
              el.removeEventListener('error', onErr);
              resolve();
            };
            const onErr = () => {
              el.removeEventListener('loadeddata', onReady);
              el.removeEventListener('error', onErr);
              reject(new Error('flux vidéo invalide'));
            };
            el.addEventListener('loadeddata', onReady);
            el.addEventListener('error', onErr);
          });
        }
        await el.play();
        if (!cancelled) {
          setOk(true);
          setErr('');
        }
      } catch (e) {
        if (!cancelled) {
          setOk(false);
          setErr(e instanceof Error ? e.message : 'play failed');
        }
      }
    };

    // Un aperçu VISIBLE justifie de filmer ; un aperçu démonté, non. Le
    // relâchement est dans le nettoyage ci-dessous, symétrique de cette prise.
    let held = false;

    const attach = async () => {
      held = true;
      const stream = await acquireCamera('preview');
      if (cancelled) return;
      if (!stream) {
        setOk(false);
        setErr('indisponible');
        return;
      }
      await bind(stream);
    };

    void attach();
    const unsub = subscribeMedia(s => {
      if (s.camera === 'denied' || s.camera === 'error') {
        setOk(false);
        setErr(s.cameraError || 'refusée');
        return;
      }
      if (s.camera === 'granted') {
        const stream = getCameraStream();
        if (stream) void bind(stream);
      }
    });

    return () => {
      cancelled = true;
      unsub();
      // Ne PAS nullifier srcObject : Holomat réutilise le même stream
      if (held) {
        held = false;
        releaseCamera('preview');
      }
    };
  }, [active]);

  if (!active) {
    return (
      <div className={`relative overflow-hidden ${className}`} style={{ ...style, background: '#000' }} />
    );
  }

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ width: '100%', height: '100%', background: '#000', ...style }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity: ok ? opacity : 0,
          transform: mirrored ? 'scaleX(-1)' : undefined,
        }}
      />
      {!ok && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        >
          <span
            style={{
              fontFamily: 'Share Tech Mono, monospace',
              fontSize: 8,
              letterSpacing: '0.14em',
              color: err ? '#f59e0b' : 'rgba(232,168,56,0.65)',
              textAlign: 'center',
              padding: 8,
            }}
          >
            {err ? `CAMÉRA : ${err.slice(0, 48)}` : 'OPTICAL SENSOR…'}
          </span>
        </div>
      )}
    </div>
  );
}
