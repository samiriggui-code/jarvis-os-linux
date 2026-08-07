/**
 * Kiosk salon — micro prêt (wake) dès le déverrouillage.
 * Caméra volontairement froide hors auth/lock : sur Celeron 2 cœurs le
 * VideoCapture + GPU Chromium mangeaient 70–90 % CPU en continu.
 */
import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { getDevicePolicy } from '../../ui/core/devicePolicy';
import { forceReleaseCamera, ensureMic } from '../bridge/mediaDevices';
import { startAudioBus } from '../bridge/audioBus';

export function KioskMediaWarmup() {
  const { sessionUnlocked } = useApp();

  useEffect(() => {
    const policy = getDevicePolicy();
    if (policy.persona !== 'kiosk') return;
    if (!sessionUnlocked) return;

    let alive = true;

    void (async () => {
      // Coupe un éventuel warmup caméra d'une ancienne build.
      forceReleaseCamera();
      if (policy.micAlwaysReady && alive) {
        await ensureMic().catch(() => null);
        await startAudioBus().catch(() => false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [sessionUnlocked]);

  return null;
}
