/**
 * Kiosk salon — micro + caméra prêts dès le déverrouillage.
 *
 * Sur laptop / remote, la caméra dort hors besoin (privacy diode).
 * Sur TV kiosk, présence + gestes + auth face nécessitent un flux chaud
 * sans invite Chromium (flags --use-fake-ui-for-media-stream).
 */
import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { getDevicePolicy } from '../../ui/core/devicePolicy';
import { acquireCamera, releaseCamera, ensureMic } from '../bridge/mediaDevices';
import { startAudioBus } from '../bridge/audioBus';

export function KioskMediaWarmup() {
  const { sessionUnlocked } = useApp();

  useEffect(() => {
    const policy = getDevicePolicy();
    if (policy.persona !== 'kiosk') return;
    if (!sessionUnlocked) return;
    if (policy.cameraSleepByDefault && !policy.micAlwaysReady) return;

    let alive = true;

    void (async () => {
      if (policy.micAlwaysReady) {
        await ensureMic().catch(() => null);
        await startAudioBus().catch(() => false);
      }
      if (!policy.cameraSleepByDefault && alive) {
        await acquireCamera('kiosk');
      }
    })();

    return () => {
      alive = false;
      if (!getDevicePolicy().cameraSleepByDefault) {
        releaseCamera('kiosk');
      }
    };
  }, [sessionUnlocked]);

  return null;
}
