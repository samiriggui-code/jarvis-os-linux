import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { OrbState } from '../../types';
import { speakDev, stopDev } from '../../bridge/ttsDev';
import { isCoreOnline } from '../CoreBridge';
import {
  getAudioLevel,
  startAudioBus,
  subscribeAudioLevel,
  subscribeWakeWord,
} from '../../bridge/audioBus';

/** Palette unique orbe / VoiceBar */
export const ORB_LABELS: Record<OrbState, { label: string; color: string; sub: string }> = {
  idle: { label: 'VEILLE', color: '#0A84FF', sub: 'DIS « JARVIS … » POUR COMMANDER' },
  listening: { label: 'ÉCOUTE', color: '#22c55e', sub: 'COMMANDES = JARVIS + …' },
  thinking: { label: 'RÉFLEXION', color: '#f59e0b', sub: 'MICRO EN PAUSE' },
  speaking: { label: 'PAROLE', color: '#0A84FF', sub: 'PUIS RETOUR VEILLE' },
};

export function mapAiToOrb(ai: 'idle' | 'listening' | 'processing' | 'responding'): OrbState {
  if (ai === 'processing') return 'thinking';
  if (ai === 'responding') return 'speaking';
  return ai;
}

export function mapOrbToAi(s: OrbState): 'idle' | 'listening' | 'processing' | 'responding' {
  if (s === 'thinking') return 'processing';
  if (s === 'speaking') return 'responding';
  return s;
}

/**
 * Orbe branchée sur le bus micro réel.
 * - idle : pulse doux + énergie voix ambiante
 * - listening : pulse fort = RMS micro
 * - speaking : enveloppe parole (TTS)
 * Wake « Jarvis » → listening
 */
export function useOrbHud() {
  const { aiState, setAiState, messages, addNotification, micTestActive } = useApp();
  const orbState = micTestActive ? 'listening' : mapAiToOrb(aiState);
  const meta = micTestActive
    ? { label: 'TEST MIC', color: '#0A84FF', sub: 'NIVEAU SEUL — PAS DE STT' }
    : ORB_LABELS[orbState];
  const [volume, setVolume] = useState(0);
  const [playbackVolume, setPlaybackVolume] = useState(0);
  const [micOk, setMicOk] = useState(false);

  // Micro toujours actif pour pulse + wake word
  useEffect(() => {
    let alive = true;
    void startAudioBus().then(ok => {
      if (alive) setMicOk(ok);
      if (alive && !ok) {
        addNotification({
          type: 'warning',
          title: 'Micro',
          message: 'Autorise le micro pour que l\'orbe pulse avec ta voix.',
        });
      }
    });
    return () => { alive = false; };
  }, [addNotification]);

  useEffect(() => {
    return subscribeWakeWord(() => {
      if (micTestActive) return; // test micro = niveau seul
      if (aiState === 'idle' || aiState === 'responding') {
        setAiState('listening');
        addNotification({
          type: 'success',
          title: 'JARVIS',
          message: 'Réveil — pose ta question (une pause après « Jarvis » est OK).',
        });
      }
    });
  }, [aiState, setAiState, addNotification, micTestActive]);

  // Niveaux orbe depuis micro / état
  useEffect(() => {
    const unsub = subscribeAudioLevel(micLevel => {
      const t = Date.now() / 1000;
      if (orbState === 'listening') {
        setVolume(Math.min(1, 0.18 + micLevel * 1.35));
        setPlaybackVolume(0);
      } else if (orbState === 'speaking') {
        setPlaybackVolume(0.35 + Math.abs(Math.sin(t * 9)) * 0.45);
        setVolume(0);
      } else if (orbState === 'thinking') {
        setVolume(0.12 + 0.18 * Math.abs(Math.sin(t * 2.2)));
        setPlaybackVolume(0.08);
      } else {
        // veille : respiration + réaction voix ambiante
        const breath = 0.05 + 0.04 * Math.abs(Math.sin(t * 0.85));
        setVolume(Math.min(0.85, breath + micLevel * 0.9));
        setPlaybackVolume(0);
      }
    });
    // kick si pas encore de frame audio
    const id = setInterval(() => {
      if (orbState === 'speaking') {
        const t = Date.now() / 1000;
        setPlaybackVolume(0.35 + Math.abs(Math.sin(t * 9)) * 0.45);
      } else if (!micOk) {
        const t = Date.now() / 1000;
        setVolume(0.06 + 0.05 * Math.abs(Math.sin(t * 0.9)));
      } else {
        const lvl = getAudioLevel();
        if (orbState === 'listening') setVolume(Math.min(1, 0.18 + lvl * 1.35));
        else if (orbState === 'idle') {
          const t = Date.now() / 1000;
          setVolume(Math.min(0.85, 0.05 + 0.04 * Math.abs(Math.sin(t * 0.85)) + lvl * 0.9));
        }
      }
    }, 50);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [orbState, micOk]);

  useEffect(() => {
    if (aiState !== 'responding') {
      stopDev();
      return;
    }
    if (isCoreOnline()) return;
    const lastAi = [...messages].reverse().find(m => m.type === 'ai');
    const text = lastAi?.text || 'Jarvis en ligne.';
    const voice = import.meta.env.VITE_TTS_VOICE_NAME || undefined;
    void speakDev(text, { preferVoiceName: voice, rate: 0.92, pitch: 0.85 });
    return () => stopDev();
  }, [aiState, messages]);

  // Pas de clic orbe : écoute = wake « Jarvis » uniquement (§6.5.1 — souris = recovery)
  return { orbState, meta, volume, playbackVolume, micOk };
}
