/**
 * Voice Filter — post-traitement Web Audio à la lecture (WAV bruts).
 * Preset produit : **sec** (anti-écho micro). Hologramme reste dispo en lab.
 * L’agent / le Core ne génèrent pas de filtre ; le HUD applique la chaîne.
 */

export type VoiceFilterPresetId = 'sec' | 'hologramme';

/** Params lab (sliders) — hologramme figé 2026-08-11. */
export type VoiceFilterParams = {
  hp: number;
  body: number;
  eq: number;
  air: number;
  comp: number;
  wet: number;
  decay: number;
  pre: number;
  damp: number;
  echo: number;
  echoMs: number;
  echoFb: number;
  dbl: number;
  delay: number;
  detune: number;
  voice2: boolean;
  chorus: number;
  chRate: number;
  width: number;
  trem: number;
  tremRate: number;
  ring: number;
  ringHz: number;
  grit: number;
  crush: number;
  noise: number;
  shim: number;
};

export const HOLOGRAMME: VoiceFilterParams = {
  hp: 95,
  body: 0.5,
  eq: 4.5,
  air: 3,
  comp: -23,
  wet: 18,
  decay: 1.0,
  pre: 16,
  damp: 9000,
  echo: 6,
  echoMs: 110,
  echoFb: 18,
  dbl: 32,
  delay: 20,
  detune: 4.5,
  voice2: true,
  chorus: 24,
  chRate: 0.35,
  width: 70,
  trem: 10,
  tremRate: 3.5,
  ring: 10,
  ringHz: 72,
  grit: 0,
  crush: 0,
  noise: 4,
  shim: 14,
};

/** Sec = pas d’effet (référence). */
export const SEC: VoiceFilterParams = {
  hp: 0,
  body: 0,
  eq: 0,
  air: 0,
  comp: 0,
  wet: 0,
  decay: 0.9,
  pre: 0,
  damp: 16000,
  echo: 0,
  echoMs: 120,
  echoFb: 25,
  dbl: 0,
  delay: 20,
  detune: 0,
  voice2: false,
  chorus: 0,
  chRate: 0.4,
  width: 0,
  trem: 0,
  tremRate: 4,
  ring: 0,
  ringHz: 80,
  grit: 0,
  crush: 0,
  noise: 0,
  shim: 0,
};

let activePreset: VoiceFilterPresetId = 'sec';
let ctx: AudioContext | null = null;
let activeNodes: AudioNode[] = [];
let activeSources: AudioBufferSourceNode[] = [];
let activeOsc: Array<OscillatorNode | ConstantSourceNode> = [];

export function getVoiceFilterPreset(): VoiceFilterPresetId {
  return activePreset;
}

export function setVoiceFilterPreset(id: VoiceFilterPresetId): void {
  activePreset = id;
}

export function paramsForPreset(id: VoiceFilterPresetId = activePreset): VoiceFilterParams {
  return id === 'sec' ? SEC : HOLOGRAMME;
}

function getCtx(): AudioContext {
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) throw new Error('AudioContext indisponible');
    ctx = new AC();
  }
  return ctx;
}

export async function resumeVoiceFilterCtx(): Promise<void> {
  const c = getCtx();
  if (c.state === 'suspended') await c.resume();
}

export async function setVoiceFilterSink(deviceId: string | null): Promise<void> {
  const c = getCtx() as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (!deviceId || typeof c.setSinkId !== 'function') return;
  try {
    await c.setSinkId(deviceId);
  } catch (err) {
    console.debug('[voice-filter] setSinkId refusé', err);
  }
}

export function stopVoiceFilter(): void {
  for (const s of activeSources) {
    try {
      s.onended = null;
      s.stop();
    } catch {
      /* already stopped */
    }
  }
  for (const o of activeOsc) {
    try {
      o.stop();
    } catch {
      /* */
    }
  }
  activeSources = [];
  activeOsc = [];
  activeNodes = [];
}

function track<T extends AudioNode>(node: T): T {
  activeNodes.push(node);
  return node;
}

function makeIR(c: AudioContext, seconds: number): AudioBuffer {
  const rate = c.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
  }
  return buf;
}

function doublingLine(
  c: AudioContext,
  source: AudioNode,
  mix: AudioNode,
  p: VoiceFilterParams,
  opts: { rate: number; phase: number; pan: number; delayMs: number },
) {
  const dl = track(c.createDelay(0.25));
  dl.delayTime.value = opts.delayMs / 1000;
  const lfo = track(c.createOscillator());
  activeOsc.push(lfo);
  lfo.frequency.value = opts.rate;
  const amt = track(c.createGain());
  amt.gain.value = opts.phase * (p.detune / 12) * 0.005;
  lfo.connect(amt);
  amt.connect(dl.delayTime);
  lfo.start();
  const g = track(c.createGain());
  g.gain.value = (p.dbl / 100) * (p.voice2 ? 0.62 : 1);
  const panner = track(c.createStereoPanner());
  panner.pan.value = opts.pan * (p.width / 100);
  source.connect(dl);
  dl.connect(g);
  g.connect(panner);
  panner.connect(mix);
}

function chorusLine(
  c: AudioContext,
  source: AudioNode,
  mix: AudioNode,
  p: VoiceFilterParams,
  opts: { rate: number; baseMs: number; pan: number },
) {
  const dl = track(c.createDelay(0.08));
  dl.delayTime.value = opts.baseMs / 1000;
  const lfo = track(c.createOscillator());
  activeOsc.push(lfo);
  lfo.frequency.value = opts.rate;
  const amt = track(c.createGain());
  amt.gain.value = 0.0035;
  lfo.connect(amt);
  amt.connect(dl.delayTime);
  lfo.start();
  const g = track(c.createGain());
  g.gain.value = (p.chorus / 100) * 0.55;
  const panner = track(c.createStereoPanner());
  panner.pan.value = opts.pan * (p.width / 100);
  source.connect(dl);
  dl.connect(g);
  g.connect(panner);
  panner.connect(mix);
}

function buildChain(
  c: AudioContext,
  buffer: AudioBuffer,
  p: VoiceFilterParams,
): { src: AudioBufferSourceNode; shimBus: GainNode; shimAmount: number } {
  stopVoiceFilter();

  const src = track(c.createBufferSource());
  src.buffer = buffer;
  activeSources.push(src);

  const hp = track(c.createBiquadFilter());
  hp.type = 'highpass';
  hp.frequency.value = Math.max(1, p.hp);
  const body = track(c.createBiquadFilter());
  body.type = 'lowshelf';
  body.frequency.value = 180;
  body.gain.value = p.body;
  const eq = track(c.createBiquadFilter());
  eq.type = 'peaking';
  eq.frequency.value = 3000;
  eq.Q.value = 0.9;
  eq.gain.value = p.eq;
  const air = track(c.createBiquadFilter());
  air.type = 'highshelf';
  air.frequency.value = 8000;
  air.gain.value = p.air;
  const comp = track(c.createDynamicsCompressor());
  comp.threshold.value = p.comp;
  comp.ratio.value = 3;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  src.connect(hp);
  hp.connect(body);
  body.connect(eq);
  eq.connect(air);
  air.connect(comp);

  let tone: AudioNode = comp;
  if (p.trem > 0) {
    const tremGain = track(c.createGain());
    tremGain.gain.value = 1;
    const lfo = track(c.createOscillator());
    activeOsc.push(lfo);
    lfo.frequency.value = p.tremRate;
    const depth = track(c.createGain());
    depth.gain.value = (p.trem / 100) * 0.45;
    const offset = track(c.createConstantSource());
    activeOsc.push(offset);
    offset.offset.value = 1 - (p.trem / 100) * 0.22;
    offset.start();
    lfo.connect(depth);
    depth.connect(tremGain.gain);
    offset.connect(tremGain.gain);
    lfo.start();
    tone.connect(tremGain);
    tone = tremGain;
  }

  const mix = track(c.createGain());
  const dry = track(c.createGain());
  dry.gain.value = 1 - (p.wet / 100) * 0.45 - (p.echo / 100) * 0.15;
  const dryPan = track(c.createStereoPanner());
  dryPan.pan.value = -(p.width / 100) * 0.2;
  tone.connect(dry);
  dry.connect(dryPan);
  dryPan.connect(mix);

  if (p.wet > 0) {
    const pre = track(c.createDelay(0.2));
    pre.delayTime.value = p.pre / 1000;
    const conv = track(c.createConvolver());
    conv.buffer = makeIR(c, p.decay);
    const damp = track(c.createBiquadFilter());
    damp.type = 'lowpass';
    damp.frequency.value = p.damp;
    const wet = track(c.createGain());
    wet.gain.value = p.wet / 100;
    tone.connect(pre);
    pre.connect(conv);
    conv.connect(damp);
    damp.connect(wet);
    wet.connect(mix);
  }

  if (p.echo > 0) {
    const dl = track(c.createDelay(1.0));
    dl.delayTime.value = p.echoMs / 1000;
    const fb = track(c.createGain());
    fb.gain.value = p.echoFb / 100;
    const eg = track(c.createGain());
    eg.gain.value = p.echo / 100;
    const lp = track(c.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.value = 5500;
    tone.connect(dl);
    dl.connect(fb);
    fb.connect(dl);
    dl.connect(lp);
    lp.connect(eg);
    eg.connect(mix);
  }

  if (p.dbl > 0) {
    doublingLine(c, tone, mix, p, { rate: 0.28, phase: 1, pan: 0.55, delayMs: p.delay });
    if (p.voice2) {
      doublingLine(c, tone, mix, p, {
        rate: 0.19,
        phase: -1,
        pan: -0.55,
        delayMs: p.delay * 1.55,
      });
    }
  }

  if (p.chorus > 0) {
    chorusLine(c, tone, mix, p, { rate: p.chRate, baseMs: 12, pan: 0.7 });
    chorusLine(c, tone, mix, p, { rate: p.chRate * 0.73, baseMs: 18, pan: -0.65 });
  }

  if (p.ring > 0) {
    const carrier = track(c.createOscillator());
    activeOsc.push(carrier);
    carrier.frequency.value = p.ringHz;
    const depth = track(c.createGain());
    depth.gain.value = (p.ring / 100) * 0.55;
    const ringGain = track(c.createGain());
    ringGain.gain.value = 0;
    carrier.connect(depth);
    depth.connect(ringGain.gain);
    const outG = track(c.createGain());
    outG.gain.value = (p.ring / 100) * 0.35;
    tone.connect(ringGain);
    ringGain.connect(outG);
    outG.connect(mix);
    carrier.start();
  }

  const shimBus = track(c.createGain());
  shimBus.gain.value = (p.shim / 100) * 0.35;
  if (p.shim > 0) {
    const hpS = track(c.createBiquadFilter());
    hpS.type = 'highpass';
    hpS.frequency.value = 1200;
    shimBus.connect(hpS);
    hpS.connect(mix);
  }

  if (p.noise > 0) {
    const seconds = Math.max(buffer.duration || 2, 1.2);
    const len = Math.floor(c.sampleRate * seconds);
    const nbuf = c.createBuffer(1, len, c.sampleRate);
    const data = nbuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const ns = track(c.createBufferSource());
    ns.buffer = nbuf;
    activeSources.push(ns);
    const bp = track(c.createBiquadFilter());
    bp.type = 'bandpass';
    bp.frequency.value = 2800;
    bp.Q.value = 0.7;
    const ng = track(c.createGain());
    ng.gain.value = (p.noise / 100) * 0.08;
    ns.connect(bp);
    bp.connect(ng);
    ng.connect(mix);
    ns.start();
  }

  const master = track(c.createGain());
  master.gain.value = 0.95;
  mix.connect(master);
  master.connect(c.destination);

  return { src, shimBus, shimAmount: p.shim };
}

/**
 * Joue un ArrayBuffer WAV/MP3 via la chaîne active.
 * `onEnded` = fin réelle (barge-in / synchro orbe).
 */
export async function playFilteredAudio(
  arrayBuffer: ArrayBuffer,
  onEnded: () => void,
  opts?: { sinkId?: string | null; preset?: VoiceFilterPresetId },
): Promise<void> {
  const c = getCtx();
  await resumeVoiceFilterCtx();
  if (opts?.sinkId !== undefined) await setVoiceFilterSink(opts.sinkId ?? null);

  const buffer = await c.decodeAudioData(arrayBuffer.slice(0));
  const p = paramsForPreset(opts?.preset ?? activePreset);

  // Preset sec : lecture directe sans chaîne lourde.
  if ((opts?.preset ?? activePreset) === 'sec') {
    stopVoiceFilter();
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(c.destination);
    activeSources = [src];
    src.onended = () => {
      if (activeSources[0] === src) activeSources = [];
      onEnded();
    };
    src.start();
    return;
  }

  const { src, shimBus, shimAmount } = buildChain(c, buffer, p);
  src.onended = () => {
    if (!activeSources.includes(src)) return;
    stopVoiceFilter();
    onEnded();
  };
  src.start();
  if (shimAmount > 0) {
    const shim = track(c.createBufferSource());
    shim.buffer = buffer;
    shim.playbackRate.value = 2.0;
    activeSources.push(shim);
    shim.connect(shimBus);
    shim.start();
  }
}
