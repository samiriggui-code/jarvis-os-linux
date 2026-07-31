/**
 * Bus audio partagé HUD — un seul micro, niveau RMS pour orbe + VoiceBar.
 * Wake word « Jarvis » via Web Speech API (navigateur) quand dispo.
 */
import { createMicLevelMeter, ensureMic, getMicStream } from './mediaDevices';

type Listener = (level: number) => void;
type WakeListener = () => void;

let meter: ReturnType<typeof createMicLevelMeter> | null = null;
let raf = 0;
let level = 0;
let started = false;
const listeners = new Set<Listener>();
const wakeListeners = new Set<WakeListener>();

let recognition: SpeechRecognition | null = null;
let wakeArmed = true;
let wakeEnabled = true;

function emit() {
  listeners.forEach(fn => fn(level));
}

function tick() {
  level = meter?.getLevel() ?? 0;
  emit();
  raf = requestAnimationFrame(tick);
}

async function ensureMeter(): Promise<boolean> {
  const stream = (await ensureMic()) || getMicStream();
  if (!stream) return false;
  if (!meter) meter = createMicLevelMeter(stream);
  return true;
}

/** Pause wake pendant STT commande (une seule SpeechRecognition). */
export function pauseWakeWord() {
  wakeEnabled = false;
  try { recognition?.stop(); } catch { /* */ }
}

export function resumeWakeWord() {
  wakeEnabled = true;
  if (started && !recognition) startWakeRecognition();
  else if (recognition && wakeEnabled) {
    try { recognition.start(); } catch { /* */ }
  }
}

function startWakeRecognition() {
  if (typeof window === 'undefined' || !wakeEnabled) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || recognition) return;

  const rec = new SR();
  recognition = rec;
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'fr-FR';

  rec.onresult = (ev: SpeechRecognitionEvent) => {
    if (!wakeArmed || !wakeEnabled) return;
    let text = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      text += ev.results[i][0]?.transcript ?? '';
    }
    const t = text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    if (/\b(jarvis|j.a.r.v.i.s|hey jarvis|ok jarvis)\b/.test(t)) {
      wakeArmed = false;
      wakeListeners.forEach(fn => fn());
      setTimeout(() => { wakeArmed = true; }, 4000);
    }
  };

  rec.onerror = () => { /* */ };

  rec.onend = () => {
    if (started && wakeEnabled && recognition === rec) {
      try { rec.start(); } catch { /* */ }
    }
  };

  try { rec.start(); } catch { /* */ }
}

/** Démarre micro + boucle niveau (idempotent). */
export async function startAudioBus(): Promise<boolean> {
  if (started) return !!meter;
  const ok = await ensureMeter();
  if (!ok) return false;
  started = true;
  if (!raf) raf = requestAnimationFrame(tick);
  startWakeRecognition();
  return true;
}

export function stopAudioBus() {
  started = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  meter?.dispose();
  meter = null;
  level = 0;
  emit();
  try { recognition?.stop(); } catch { /* */ }
  recognition = null;
}

export function getAudioLevel(): number {
  return level;
}

export function subscribeAudioLevel(fn: Listener): () => void {
  listeners.add(fn);
  fn(level);
  return () => { listeners.delete(fn); };
}

export function subscribeWakeWord(fn: WakeListener): () => void {
  wakeListeners.add(fn);
  return () => { wakeListeners.delete(fn); };
}

declare global {
  interface Window {
    SpeechRecognition?: typeof SpeechRecognition;
    webkitSpeechRecognition?: typeof SpeechRecognition;
  }
}
