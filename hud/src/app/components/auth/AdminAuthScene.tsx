/**
 * AdminAuthScene — élévation Dashboard Admin.
 * Voix (phrase) ou code — plus de face.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ShieldCheck, X, Mic, KeyRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Orb } from '../orb';
import { speakDev, initTtsDev, stopDev } from '../../bridge/ttsDev';
import { authElevate } from '../../bridge/authClient';
import { isCoreOnline } from '../CoreBridge';
import { runVoiceVerifyLive, VOICE_CHALLENGE } from '../../bridge/voiceAuthLive';
import { ensureMic, getMediaState } from '../../bridge/mediaDevices';
import { startAudioBus } from '../../bridge/audioBus';
import { AuthVoiceWave } from './AuthVoiceWave';
import { GlassModal, GlassButton } from '../../../components/glass';
import { tokens } from '../../../ui/tokens';
import { visionTitle, visionBody, visionCaption } from '../visionChrome';

const orbF = { fontFamily: tokens.font.display, fontWeight: 600, letterSpacing: '-0.02em' };
const ACCENT = tokens.color.accent;

const displayStatus = (value: string) =>
  value
    .toLocaleLowerCase('fr-FR')
    .replace(/_/g, ' ')
    .replace(/(^|[\s·-])([\p{L}])/gu, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('fr-FR')}`);

type AdminMode = 'choice' | 'voice' | 'code' | 'success';

export function AdminAuthScene() {
  const { adminGateOpen, closeAdminGate, grantAdminAccess } = useApp();

  const [mode, setMode] = useState<AdminMode>('choice');
  const [hudText, setHudText] = useState('AUTORISATION NIVEAU ADMIN');
  const [hudSub, setHudSub] = useState('Authentification élevée requise');
  const [orbState, setOrbState] = useState<'idle' | 'thinking' | 'processing' | 'responding' | 'listening'>('thinking');
  const [codeInput, setCodeInput] = useState('');
  const [codeDenied, setCodeDenied] = useState(false);
  const [error, setError] = useState('');
  const [micOk, setMicOk] = useState(false);

  const aliveRef = useRef(true);
  const ttsEnabled = import.meta.env.VITE_TTS_STUB === 'true';

  useEffect(() => {
    if (!adminGateOpen) {
      setMode('choice');
      setHudText('AUTORISATION NIVEAU ADMIN');
      setHudSub('Authentification élevée requise');
      setOrbState('thinking');
      setCodeInput('');
      setError('');
      setMicOk(false);
      stopDev();
      return;
    }
    initTtsDev();
    aliveRef.current = true;
    if (ttsEnabled) {
      void speakDev('Accès Dashboard restreint. Authentification élevée requise.');
    }
    return () => { aliveRef.current = false; };
  }, [adminGateOpen, ttsEnabled]);

  const runVoice = useCallback(async () => {
    setMode('voice');
    setHudText('VOICE AUTH ADMIN');
    setHudSub(`Dites : « ${VOICE_CHALLENGE} »`);
    setOrbState('listening');
    setError('');

    try {
      const stream = await ensureMic();
      if (!stream || getMediaState().mic !== 'granted') {
        setError('Micro requis');
        setMode('choice');
        return;
      }
      setMicOk(true);
      void startAudioBus();

      if (!isCoreOnline()) {
        setError('Core hors ligne');
        setMode('choice');
        return;
      }

      const result = await runVoiceVerifyLive({
        isAlive: () => aliveRef.current,
        patchHud: (ht, hs) => {
          setHudText(ht);
          setHudSub(hs);
          setOrbState('processing');
        },
      });

      if (!aliveRef.current) return;
      if (!result.ok) {
        setError(result.hudSubtext || 'Voix non reconnue');
        setMode('choice');
        setOrbState('idle');
        return;
      }

      const elev = await authElevate('voice');
      if (!elev.ok) {
        setError(elev.error || 'Élévation refusée');
        setMode('choice');
        return;
      }

      setMode('success');
      setHudText('ACCÈS ADMIN ACCORDÉ');
      setHudSub('Droits élevés activés');
      setOrbState('responding');
      grantAdminAccess({ method: 'voice' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec');
      setMode('choice');
    }
  }, [grantAdminAccess]);

  const submitCode = useCallback(async () => {
    setCodeDenied(false);
    const elev = await authElevate('code');
    if (!elev.ok) {
      setCodeDenied(true);
      setError(elev.error || 'Code invalide');
      return;
    }
    setMode('success');
    grantAdminAccess({ method: 'code' });
  }, [grantAdminAccess]);

  if (!adminGateOpen) return null;

  return (
    <GlassModal open={adminGateOpen} onClose={closeAdminGate} width={380}>
      <div className="relative flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => closeAdminGate()}
          className="absolute -top-2 -right-2 p-1 cursor-pointer"
          style={{ color: tokens.color.textMuted }}
        >
          <X className="w-4 h-4" />
        </button>

        <ShieldCheck className="w-6 h-6" style={{ color: ACCENT }} />
        <p style={{ ...visionTitle, color: ACCENT, fontSize: 13 }}>{displayStatus(hudText)}</p>
        <p style={{ ...visionBody, fontSize: 11, textAlign: 'center' }}>
          {displayStatus(hudSub)}
        </p>

        <div style={{ width: 120, height: 120 }}>
          <Orb state={orbState} volume={mode === 'voice' && micOk ? 0.5 : 0.15} playbackVolume={0} />
        </div>

        {mode === 'voice' && micOk && <AuthVoiceWave mode="listening" />}

        {mode === 'choice' && (
          <div className="flex flex-col gap-2 w-full">
            <GlassButton
              active
              icon={<Mic className="w-4 h-4" />}
              onClick={() => void runVoice()}
              style={{ ...orbF, justifyContent: 'center' }}
            >
              Authentification vocale
            </GlassButton>
            <GlassButton
              tone="neutral"
              icon={<KeyRound className="w-4 h-4" />}
              onClick={() => setMode('code')}
              style={{ ...orbF, justifyContent: 'center' }}
            >
              Code administrateur
            </GlassButton>
          </div>
        )}

        {mode === 'code' && (
          <div className="flex flex-col gap-2 w-full">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submitCode(); }}
              type="password"
              placeholder="Code"
              className="w-full rounded-xl px-3 py-2 outline-none"
              style={{
                ...orbF,
                background: tokens.color.surfaceRaised,
                border: `1px solid ${codeDenied ? tokens.color.danger : tokens.color.borderActive}`,
                color: tokens.color.text,
                fontSize: 14,
              }}
            />
            <GlassButton
              active
              onClick={() => void submitCode()}
              style={{ ...orbF, justifyContent: 'center', color: ACCENT, borderColor: `${ACCENT}66` }}
            >
              Valider
            </GlassButton>
          </div>
        )}

        {error && (
          <p style={{ ...visionCaption, color: tokens.color.danger, fontSize: 10, textAlign: 'center' }}>{error}</p>
        )}
      </div>
    </GlassModal>
  );
}
