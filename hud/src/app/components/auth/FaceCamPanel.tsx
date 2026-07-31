/**
 * FaceCamPanel — caméra seule + Holomat (scan / enroll / verify).
 * Pas d’hologramme, pas de WebGL.
 *
 * Important : ne pas remettre face_enroll_begin à chaque render parent
 * (sinon buffer Core = 1 sample → bloqué à 12.5 %).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getCoreClient } from '../../bridge/coreClient';
import { ensureCamera, getCameraStream } from '../../bridge/mediaDevices';

const FRAME_MS = 280;
const JPEG_Q = 0.7;

type Mode = 'enroll' | 'verify';

type FaceBox = { x: number; y: number; w: number; h: number };

interface Props {
  mode?: Mode;
  username?: string;
  /** Lance l’envoi de frames Holomat */
  active?: boolean;
  onProgress?: (p: number) => void;
  onHud?: (text: string) => void;
  onComplete?: (ev: Record<string, unknown>) => void;
  onFailed?: (reason: string) => void;
}

export function FaceCamPanel({
  mode = 'enroll',
  username = 'user',
  active = true,
  onProgress,
  onHud,
  onComplete,
  onFailed,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const onProgressRef = useRef(onProgress);
  const onHudRef = useRef(onHud);
  const onCompleteRef = useRef(onComplete);
  const onFailedRef = useRef(onFailed);
  onProgressRef.current = onProgress;
  onHudRef.current = onHud;
  onCompleteRef.current = onComplete;
  onFailedRef.current = onFailed;

  const [camLive, setCamLive] = useState(false);
  const [camError, setCamError] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Ouverture caméra…');
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null);
  const [retry, setRetry] = useState(0);

  const pushProgress = useCallback((p: number, msg?: string) => {
    setProgress(p);
    onProgressRef.current?.(p);
    if (msg) {
      setStatus(msg);
      onHudRef.current?.(msg);
    }
  }, []);

  /* ── Caméra ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    setCamError('');
    setCamLive(false);
    setStatus('Demande accès caméra…');

    (async () => {
      try {
        let stream = getCameraStream();
        const live = stream?.getVideoTracks().some(t => t.readyState === 'live');
        if (!live) stream = (await ensureCamera()) || null;
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (cancelled || !stream) return;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        v.muted = true;
        await v.play();
        for (let i = 0; i < 40 && v.videoWidth < 16; i++) {
          await new Promise(r => setTimeout(r, 50));
        }
        if (v.videoWidth < 16) {
          setCamError('pas d’image');
          setStatus('Caméra sans image');
          return;
        }
        setCamLive(true);
        setStatus(active ? 'Placez votre visage dans le cadre' : 'Caméra prête');
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'refusée';
        setCamError(msg);
        setStatus(`Caméra : ${msg}`);
        onHudRef.current?.('Autorisez la caméra dans le navigateur');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [retry, active]);

  const grabJpeg = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    let c = canvasRef.current;
    if (!c) {
      c = document.createElement('canvas');
      canvasRef.current = c;
    }
    const w = 480;
    const h = Math.max(1, Math.round((v.videoHeight / v.videoWidth) * w));
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    return c.toDataURL('image/jpeg', JPEG_Q).replace(/^data:image\/jpeg;base64,/, '');
  }, []);

  /* ── Holomat — deps stables uniquement (pas de callbacks / status) ─────── */
  useEffect(() => {
    if (!active || !camLive) return undefined;
    doneRef.current = false;
    busyRef.current = false;
    setProgress(0);

    const client = getCoreClient();
    if (!client.connected) {
      setStatus('Core hors ligne');
      onHudRef.current?.('Core hors ligne — python -m jarvis_core');
      return undefined;
    }

    let cancelled = false;

    const begin = async () => {
      if (mode !== 'enroll') return true;
      try {
        const res = await client.request(
          { type: 'holomat', action: 'face_enroll_begin', username },
          d => d.type === 'FACE_PROGRESS' || d.type === 'holomat_error',
          8000,
        );
        if (res.type === 'holomat_error') {
          setStatus(String(res.error || 'holomat_error'));
          onFailedRef.current?.(String(res.error || 'holomat_error'));
          return false;
        }
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'timeout';
        setStatus(msg);
        onFailedRef.current?.(msg);
        return false;
      }
    };

    const tick = async () => {
      if (cancelled || doneRef.current || busyRef.current) return;
      busyRef.current = true;
      try {
        const jpeg = grabJpeg();
        if (!jpeg) return;
        const ev = await client.request(
          {
            type: 'holomat',
            action: 'face_frame',
            mode,
            username,
            jpeg_b64: jpeg,
          },
          d =>
            d.type === 'FACE_PROGRESS' ||
            d.type === 'FACE_SUCCESS' ||
            d.type === 'FACE_FAILED' ||
            d.type === 'holomat_error',
          6000,
        );

        if (cancelled || doneRef.current) return;

        if (ev.box && typeof ev.box === 'object') {
          setFaceBox(ev.box as FaceBox);
        }

        const p = Number(ev.progress ?? 0);
        const msg = String(ev.hudSubtext || ev.hudText || '');
        pushProgress(p, msg || undefined);

        if (ev.type === 'FACE_SUCCESS' || p >= 100) {
          doneRef.current = true;
          pushProgress(100, 'Empreinte OK');
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          onCompleteRef.current?.(ev);
          return;
        }
        if (ev.type === 'FACE_FAILED' || ev.type === 'holomat_error') {
          onFailedRef.current?.(String(ev.error || ev.reason || 'échec'));
        }
      } catch {
        /* retry next tick */
      } finally {
        busyRef.current = false;
      }
    };

    void (async () => {
      const ok = await begin();
      if (!ok || cancelled) return;
      timerRef.current = setInterval(() => {
        void tick();
      }, FRAME_MS);
      void tick();
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active, camLive, mode, username, grabJpeg, pushProgress]);

  return (
    <div
      className="relative overflow-hidden rounded-xl select-none"
      style={{
        width: 'min(92vw, 420px)',
        height: 280,
        background: '#000',
        border: '1px solid rgba(0,229,255,0.35)',
        boxShadow: '0 0 24px rgba(0,229,255,0.12)',
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          transform: 'scaleX(-1)',
          opacity: camLive ? 1 : 0.2,
        }}
      />

      {!camLive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        >
          <span style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 9, letterSpacing: '0.12em', color: '#00e5ff' }}>
            {camError ? `CAMÉRA : ${camError}` : status}
          </span>
          {camError && (
            <button
              type="button"
              onClick={() => setRetry(n => n + 1)}
              style={{
                fontFamily: 'Share Tech Mono, monospace',
                fontSize: 8,
                letterSpacing: '0.14em',
                padding: '6px 12px',
                background: '#00e5ff',
                color: '#000',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              RÉESSAYER
            </button>
          )}
        </div>
      )}

      <div
        className="absolute top-2 left-2 px-1.5 py-0.5 rounded z-10"
        style={{
          fontFamily: 'Share Tech Mono, monospace',
          fontSize: 7,
          letterSpacing: '0.14em',
          color: '#00e5ff',
          background: 'rgba(0,0,0,0.55)',
        }}
      >
        {camLive ? 'HOLOMAT · CAM LIVE' : 'HOLOMAT · CAM'}
      </div>

      {/* Guide ovale */}
      <div
        className="absolute pointer-events-none z-[5]"
        style={{
          left: '18%',
          right: '18%',
          top: '14%',
          bottom: '22%',
          border: '1px dashed rgba(0,229,255,0.35)',
          borderRadius: '50% / 45%',
        }}
      />

      {faceBox && (
        <div
          className="absolute pointer-events-none z-[6]"
          style={{
            left: `${faceBox.x * 100}%`,
            top: `${faceBox.y * 100}%`,
            width: `${faceBox.w * 100}%`,
            height: `${faceBox.h * 100}%`,
            border: '1px solid rgba(0,229,255,0.9)',
            boxShadow: '0 0 12px rgba(0,229,255,0.45)',
            transition: 'left 160ms linear, top 160ms linear, width 160ms linear, height 160ms linear',
          }}
        />
      )}

      <div className="absolute left-2 right-2 bottom-2 z-10">
        <div
          style={{
            fontFamily: 'Share Tech Mono, monospace',
            fontSize: 8,
            letterSpacing: '0.1em',
            color: 'rgba(0,229,255,0.75)',
            marginBottom: 4,
          }}
        >
          {status} · {Math.round(progress)}%
        </div>
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,229,255,0.12)' }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, progress)}%`,
              background: '#00e5ff',
              boxShadow: '0 0 8px #00e5ff',
              transition: 'width 0.15s linear',
            }}
          />
        </div>
      </div>
    </div>
  );
}
