/**
 * Bouton flottant — test TTS + choix voix + activation caméra/micro.
 */
import React, { useEffect, useState } from 'react';
import { Volume2, ChevronUp, ChevronDown, Camera, Mic } from 'lucide-react';
import {
  testTtsNow,
  listFrVoices,
  speakDev,
  unlockAudio,
  initTtsDev,
  setPreferredVoiceName,
  getPreferredVoiceName,
} from '../bridge/ttsDev';
import { getCoreClient } from '../bridge/coreClient';
import {
  ensureCameraAndMic,
  subscribeMedia,
  type MediaDevicesState,
} from '../bridge/mediaDevices';

const mono = { fontFamily: 'Share Tech Mono, monospace' };

function statusColor(s: MediaDevicesState['mic']): string {
  if (s === 'granted') return '#22c55e';
  if (s === 'denied' || s === 'error') return '#ef4444';
  if (s === 'requesting') return '#f59e0b';
  return '#64748b';
}

export function TtsTestButton() {
  const [coreOk, setCoreOk] = useState(false);
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selected, setSelected] = useState(getPreferredVoiceName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [media, setMedia] = useState<MediaDevicesState>({ mic: 'idle', camera: 'idle' });

  useEffect(() => {
    initTtsDev();
    setSelected(getPreferredVoiceName());
    const refresh = () => setVoices(listFrVoices());
    refresh();
    window.speechSynthesis?.addEventListener?.('voiceschanged', refresh);
    const unsub = subscribeMedia(setMedia);
    const id = setInterval(() => {
      setCoreOk(getCoreClient().connected);
      refresh();
    }, 1000);
    return () => {
      clearInterval(id);
      unsub();
      window.speechSynthesis?.removeEventListener?.('voiceschanged', refresh);
    };
  }, []);

  const activateDevices = async () => {
    setBusy(true);
    setMsg('Demande permissions Windows…');
    try {
      unlockAudio();
      const s = await ensureCameraAndMic();
      const parts = [
        s.camera === 'granted' ? 'Caméra OK' : `Caméra: ${s.camera}`,
        s.mic === 'granted' ? 'Micro OK' : `Micro: ${s.mic}`,
      ];
      setMsg(parts.join(' · '));
      if (s.camera === 'denied' || s.mic === 'denied') {
        setMsg(
          (s.cameraError || s.micError || 'Permission refusée') +
            ' — Autorise caméra/micro dans Chrome (icône cadenas) + Paramètres Windows Confidentialité.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const pick = async (name: string) => {
    setSelected(name);
    setPreferredVoiceName(name);
    unlockAudio();
    setBusy(true);
    setMsg(`Voix : ${name}`);
    try {
      await speakDev('Identité vocale sélectionnée. JARVIS à votre service.', {
        preferVoiceName: name,
        rate: 0.92,
        pitch: 0.85,
      });
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    setBusy(true);
    try {
      unlockAudio();
      // Forcer Paul depuis .env / sélection
      if (selected) setPreferredVoiceName(selected);
      const names = await testTtsNow();
      setMsg(names.slice(0, 120));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-[500] flex flex-col gap-2 max-w-sm pointer-events-auto">
      {open && (
        <div
          className="rounded-xl p-3 flex flex-col gap-2 max-h-56 overflow-y-auto"
          style={{
            background: 'rgba(0,12,28,0.95)',
            border: '1px solid rgba(0,245,255,0.35)',
            boxShadow: '0 0 20px rgba(0,0,0,0.5)',
          }}
        >
          <p style={{ ...mono, color: 'rgba(0,245,255,0.7)', fontSize: 8, letterSpacing: '0.14em' }}>
            VOIX WINDOWS FR — clique pour choisir
          </p>
          {voices.length === 0 && (
            <p style={{ ...mono, color: '#f59e0b', fontSize: 9 }}>
              Aucune voix FR. Paramètres Windows → Heure et langue → Parole.
            </p>
          )}
          {voices.map(v => {
            const active = selected
              ? v.name.toLowerCase().includes(selected.toLowerCase().replace(/^microsoft\s+/i, '')) ||
                selected.toLowerCase().includes(v.name.toLowerCase())
              : false;
            return (
              <button
                key={v.name + v.lang}
                type="button"
                onClick={() => void pick(v.name)}
                className="text-left px-2 py-1.5 rounded-lg cursor-pointer"
                style={{
                  background: active ? 'rgba(0,245,255,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active ? 'rgba(0,245,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                <span style={{ ...mono, color: active ? '#00f5ff' : 'rgba(255,255,255,0.75)', fontSize: 9 }}>
                  {v.name}
                </span>
                <span style={{ ...mono, color: 'rgba(255,255,255,0.35)', fontSize: 8, marginLeft: 6 }}>
                  {v.lang}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => void activateDevices()}
          disabled={busy}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl cursor-pointer"
          style={{
            background: 'rgba(0,20,40,0.92)',
            border: '1px solid rgba(0,245,255,0.35)',
          }}
          title="Activer caméra + micro Windows"
        >
          <Camera className="w-3.5 h-3.5" style={{ color: statusColor(media.camera) }} />
          <Mic className="w-3.5 h-3.5" style={{ color: statusColor(media.mic) }} />
          <span style={{ ...mono, color: '#00f5ff', fontSize: 9, letterSpacing: '0.08em' }}>
            CAM / MIC
          </span>
        </button>

        <button
          type="button"
          onClick={() => void onTest()}
          disabled={busy}
          className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer"
          style={{
            background: 'rgba(0,20,40,0.92)',
            border: '1px solid rgba(0,245,255,0.45)',
            boxShadow: '0 0 16px rgba(0,245,255,0.2)',
          }}
        >
          <Volume2 className="w-4 h-4" style={{ color: '#00f5ff' }} />
          <span style={{ ...mono, color: '#00f5ff', fontSize: 10, letterSpacing: '0.1em' }}>
            {busy ? '…' : 'VOIX'}
          </span>
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: coreOk ? '#22c55e' : '#ef4444' }}
            title={coreOk ? 'Core OK' : 'Core offline'}
          />
        </button>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="p-2 rounded-xl cursor-pointer"
          style={{ background: 'rgba(0,20,40,0.9)', border: '1px solid rgba(0,245,255,0.3)' }}
        >
          {open
            ? <ChevronDown className="w-4 h-4" style={{ color: '#00f5ff' }} />
            : <ChevronUp className="w-4 h-4" style={{ color: '#00f5ff' }} />}
        </button>
      </div>
      {msg && (
        <p style={{ ...mono, color: 'rgba(255,255,255,0.5)', fontSize: 8 }}>{msg}</p>
      )}
    </div>
  );
}
