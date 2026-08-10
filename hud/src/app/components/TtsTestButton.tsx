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

import { ACCENT, monoFont } from './hudTheme';
import { tokens } from '../../ui/tokens';

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
          // Le panneau s'ouvre VERS LE HAUT depuis `bottom-4` : une hauteur
          // fixe (56 = 224 px) coupait la liste des le 4e vocal et, sur un
          // ecran bas, sortait par le haut de la fenetre. Plafond relatif au
          // viewport + `overscroll-contain` pour ne pas faire defiler le HUD
          // derriere une fois en bout de liste.
          className="rounded-xl p-3 flex flex-col gap-2 overflow-y-auto overscroll-contain"
          style={{
            maxHeight: 'min(24rem, 50vh)',
            background: tokens.color.surfaceRaised,
            border: `1px solid ${tokens.color.borderActive}`,
            backdropFilter: tokens.glass,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <p style={{ ...monoFont, color: tokens.color.textMuted, fontSize: 8, letterSpacing: '0.02em' }}>
            Voix Windows FR — clique pour choisir
          </p>
          {voices.length === 0 && (
            <p style={{ ...monoFont, color: '#f59e0b', fontSize: 9 }}>
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
                  background: active ? tokens.color.accentSoft : tokens.color.surface,
                  border: `1px solid ${active ? tokens.color.borderActive : tokens.color.border}`,
                }}
              >
                <span style={{ ...monoFont, color: active ? ACCENT : tokens.color.text, fontSize: 9 }}>
                  {v.name}
                </span>
                <span style={{ ...monoFont, color: tokens.color.textMuted, fontSize: 8, marginLeft: 6 }}>
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
            background: tokens.color.surfaceRaised,
            border: `1px solid ${tokens.color.borderActive}`,
            backdropFilter: tokens.glass,
          }}
          title="Activer caméra + micro Windows"
        >
          <Camera className="w-3.5 h-3.5" style={{ color: statusColor(media.camera) }} />
          <Mic className="w-3.5 h-3.5" style={{ color: statusColor(media.mic) }} />
          <span style={{ ...monoFont, color: ACCENT, fontSize: 9, letterSpacing: '0.02em' }}>
            Cam / Mic
          </span>
        </button>

        <button
          type="button"
          onClick={() => void onTest()}
          disabled={busy}
          className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer"
          style={{
            background: tokens.color.surfaceRaised,
            border: `1px solid ${tokens.color.borderActive}`,
            backdropFilter: tokens.glass,
          }}
        >
          <Volume2 className="w-4 h-4" style={{ color: ACCENT }} />
          <span style={{ ...monoFont, color: ACCENT, fontSize: 10, letterSpacing: '0.02em' }}>
            {busy ? '…' : 'Voix'}
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
          style={{ background: tokens.color.surfaceRaised, border: `1px solid ${tokens.color.border}`, backdropFilter: tokens.glass }}
        >
          {open
            ? <ChevronDown className="w-4 h-4" style={{ color: ACCENT }} />
            : <ChevronUp className="w-4 h-4" style={{ color: ACCENT }} />}
        </button>
      </div>
      {msg && (
        <p style={{ ...monoFont, color: tokens.color.textMuted, fontSize: 8 }}>{msg}</p>
      )}
    </div>
  );
}
