/**
 * Branche un AnalyserNode réel sur le micro pour faire pulser l'orbe à la voix.
 * Sans ça, Orb.jsx simule un spectre depuis un `volume` plat → l'orbe ne réagit pas.
 */
import { useEffect, useState } from 'react';
import { ensureMic, getMicStream } from '../../bridge/mediaDevices';
import { startAudioBus, subscribeAudioLevel } from '../../bridge/audioBus';

export function useMicOrbAnalyser(micGranted: boolean): {
  micAnalyser: AnalyserNode | null;
  micLevel: number;
} {
  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
  const [micLevel, setMicLevel] = useState(0);

  useEffect(() => {
    if (!micGranted) {
      setMicLevel(0);
      setMicAnalyser(null);
      return;
    }
    void startAudioBus();
    let disposed = false;
    let ctx: AudioContext | null = null;
    let raf = 0;

    const arm = async () => {
      const stream = getMicStream() || (await ensureMic());
      if (!stream || disposed) return;
      ctx = new AudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      an.smoothingTimeConstant = 0.45;
      src.connect(an);
      if (disposed) {
        void ctx.close();
        return;
      }
      setMicAnalyser(an);

      const data = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        if (disposed) return;
        an.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        // Courbe douce : assez pour l'EQ / volume HUD, sans saturer l'orbe.
        setMicLevel(Math.min(1, Math.pow(avg, 0.55) * 1.35));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    void arm();

    const off = subscribeAudioLevel((lvl) => {
      setMicLevel((prev) => {
        const next = Math.min(1, Math.pow(Math.max(0, lvl), 0.6) * 1.25);
        return Math.max(prev * 0.55, next);
      });
    });

    return () => {
      disposed = true;
      off();
      if (raf) cancelAnimationFrame(raf);
      setMicAnalyser(null);
      if (ctx) void ctx.close();
    };
  }, [micGranted]);

  return { micAnalyser, micLevel };
}
