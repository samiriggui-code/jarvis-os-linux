/**
 * Preview caméra live (auth / Holomat).
 * Un seul MediaStream partagé — ne coupe jamais les tracks au unmount.
 */
import React, { useEffect, useRef, useState } from 'react';
import { acquireCamera, getCameraStream, releaseCamera, subscribeMedia } from '../bridge/mediaDevices';
import { glassLevel, tokens } from '../../ui/tokens';

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
      <div
        className={`relative overflow-hidden ${className}`}
        style={{
          ...style,
          background: tokens.color.void,
          border: glassLevel.subtle.border,
          borderRadius: tokens.radius.md,
        }}
      />
    );
  }

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        width: '100%',
        height: '100%',
        background: tokens.color.void,
        border: glassLevel.subtle.border,
        borderRadius: tokens.radius.md,
        boxShadow: glassLevel.subtle.boxShadow,
        ...style,
      }}
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
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 10,
              color: err ? tokens.color.warning : tokens.color.textMuted,
              textAlign: 'center',
              padding: 8,
            }}
          >
            {err
              ? (err === 'indisponible' ? 'En attente d’autorisation…' : `Caméra : ${err.slice(0, 48)}`)
              : 'Connexion caméra…'}
          </span>
        </div>
      )}
    </div>
  );
}
