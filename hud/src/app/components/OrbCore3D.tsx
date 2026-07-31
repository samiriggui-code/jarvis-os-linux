import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { AIState } from '../context/AppContext';

/**
 * Particle orb — contained within the HUD ring radius (MAX_R clamp below),
 * never spills past it regardless of energy/state.
 * Primary drive = AI speaking envelope (responding).
 * Mic drives listening. Idle = soft breathe.
 */
export function OrbCore3D({
  size = 420,
  aiState = 'idle',
  onLevel,
}: {
  size?: number;
  aiState?: AIState;
  onLevel?: (level: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(aiState);
  const onLevelRef = useRef(onLevel);
  stateRef.current = aiState;
  onLevelRef.current = onLevel;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const COUNT = 16000;
    const scene = new THREE.Scene();
    // Tuned so the MAX_R=0.95 particle shell visually fills the decorative
    // HUD ring (the outer Ring in AICore.tsx) instead of floating small
    // inside it with a dead gap.
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
    camera.position.z = 2.55;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    // Allow drawing outside "orb circle" — no CSS clip
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.appendChild(renderer.domElement);

    // Hard cap — no particle, at any energy/explode level, may ever sit
    // farther than this from center. This is what keeps the cloud inside
    // the HUD ring instead of spilling past it.
    const MAX_R = 0.95;

    const positions = new Float32Array(COUNT * 3);
    const base = new Float32Array(COUNT * 3);
    const shells = new Float32Array(COUNT); // rest radial distance, used to clamp in tick()
    const colors = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    const layers = new Float32Array(COUNT); // 0=core shell, 1=soft outer layer

    for (let i = 0; i < COUNT; i++) {
      const u = Math.random();
      const v = Math.random();
      const latBias = Math.pow(Math.abs(v * 2 - 1), 0.4) * Math.sign(v * 2 - 1 || 1);
      const phi = (Math.PI / 2) * latBias;
      const theta = u * Math.PI * 2;
      const cosP = Math.cos(phi);

      // 68% dense core, 32% soft outer layer — both stay within MAX_R
      const isHalo = Math.random() > 0.68;
      layers[i] = isHalo ? 1 : 0;
      const shell = isHalo
        ? MAX_R * (0.82 + Math.random() * 0.13) // just inside the ring, gives a soft edge
        : MAX_R * (0.55 + Math.random() * 0.24);
      shells[i] = shell;

      const x = shell * cosP * Math.cos(theta);
      const y = shell * Math.sin(phi) * 0.9;
      const z = shell * cosP * Math.sin(theta);

      base[i * 3] = x;
      base[i * 3 + 1] = y;
      base[i * 3 + 2] = z;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      seeds[i] = Math.random() * 1000;

      const ty = (y / shell + 1) * 0.5;
      const c = new THREE.Color();
      if (ty > 0.65) c.setHSL(0.55, 0.95, 0.62);
      else if (ty > 0.45) c.setHSL(0.72, 0.9, 0.55);
      else if (ty > 0.28) c.setHSL(0.9, 0.95, 0.55);
      else c.setHSL(0.04, 1.0, 0.55);
      c.multiplyScalar(0.7 + (1 - Math.abs(y / shell)) * 0.55);
      if (isHalo) c.multiplyScalar(0.85);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const texCanvas = document.createElement('canvas');
    texCanvas.width = 64;
    texCanvas.height = 64;
    const ctx = texCanvas.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.2)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const pointTex = new THREE.CanvasTexture(texCanvas);

    const mat = new THREE.PointsMaterial({
      size: 0.05,
      map: pointTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geo, mat);
    const group = new THREE.Group();
    group.add(points);
    scene.add(group);

    // —— Audio: mic (listen) + AI speech envelope (responding) ——
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let freq: Uint8Array | null = null;
    let timeDomain: Uint8Array | null = null;
    let stream: MediaStream | null = null;
    let smooth = 0;
    let bass = 0;
    let mid = 0;
    let treble = 0;

    const ensureCtx = async () => {
      if (!audioCtx) {
        audioCtx = new AudioContext();
      }
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      return audioCtx;
    };

    const attachMic = async () => {
      if (stream) return;
      try {
        const ctx = await ensureCtx();
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
          video: false,
        });
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.4;
        freq = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
        timeDomain = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;
        ctx.createMediaStreamSource(stream).connect(analyser);
      } catch {
        /* mic denied — AI speaking envelope still works */
      }
    };

    const detachMic = () => {
      stream?.getTracks().forEach(t => t.stop());
      stream = null;
      // keep audioCtx for speech synth oscillators
      analyser = null;
      freq = null;
      timeDomain = null;
    };

    const resize = () => {
      const w = host.clientWidth || size;
      const h = host.clientHeight || size;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    const clock = new THREE.Clock();
    let lastState: AIState = stateRef.current;

    /** Speech-like envelope when JARVIS talks (responding) */
    const aiSpeechLevel = (t: number) => {
      // Syllable bursts + formant shimmer
      const syllable = Math.pow(Math.max(0, Math.sin(t * 9.5)), 1.6);
      const formant =
        0.35 * Math.abs(Math.sin(t * 17.3)) +
        0.25 * Math.abs(Math.sin(t * 23.1)) +
        0.15 * Math.abs(Math.sin(t * 31.7));
      const breath = 0.2 + 0.15 * Math.sin(t * 2.2);
      return Math.min(1, breath + syllable * 0.75 + formant * 0.55);
    };

    const readDrive = () => {
      const st = stateRef.current;
      const t = clock.elapsedTime;

      // State transitions for mic
      if (st === 'listening' && lastState !== 'listening') void attachMic();
      if (st !== 'listening' && lastState === 'listening') detachMic();
      lastState = st;

      let instant = 0;

      if (st === 'responding') {
        // ★ Primary: AI speaking
        instant = aiSpeechLevel(t);
        bass = instant * (0.7 + 0.3 * Math.abs(Math.sin(t * 11)));
        mid = instant * (0.5 + 0.5 * Math.abs(Math.sin(t * 19)));
        treble = instant * (0.4 + 0.6 * Math.abs(Math.sin(t * 37)));
      } else if (st === 'processing') {
        instant = 0.45 + 0.4 * Math.abs(Math.sin(t * 8));
        bass = instant * 0.9;
        mid = instant * 0.7;
        treble = instant * 0.5;
      } else if (st === 'listening' && analyser && freq && timeDomain) {
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(timeDomain);
        let sum = 0, peak = 0;
        for (let i = 0; i < timeDomain.length; i++) {
          const v = Math.abs(timeDomain[i] - 128) / 128;
          sum += v;
          if (v > peak) peak = v;
        }
        const rms = sum / timeDomain.length;
        const n = freq.length;
        let b = 0, m = 0, tr = 0;
        const n1 = Math.floor(n * 0.1);
        const n2 = Math.floor(n * 0.4);
        for (let i = 0; i < n; i++) {
          const v = freq[i] / 255;
          if (i < n1) b += v;
          else if (i < n2) m += v;
          else tr += v;
        }
        bass = b / Math.max(n1, 1);
        mid = m / Math.max(n2 - n1, 1);
        treble = tr / Math.max(n - n2, 1);
        instant = Math.min(1, rms * 4.5 + peak * 1.1);
      } else if (st === 'listening') {
        // Mic pending / denied — still show listening energy
        instant = 0.2 + 0.25 * Math.abs(Math.sin(t * 5));
        bass = mid = treble = instant;
      } else {
        instant = 0.06 + 0.05 * Math.abs(Math.sin(t * 1.3));
        bass = mid = treble = instant;
      }

      // Faster attack when AI speaks so it's obvious
      const lerp = st === 'responding' ? 0.45 : 0.22;
      smooth += (instant - smooth) * lerp;
      onLevelRef.current?.(smooth);
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      const st = stateRef.current;
      readDrive();

      const energy = smooth;
      // Energy still drives motion/turbulence, but it can only push particles
      // around WITHIN the MAX_R shell — never past the HUD ring.
      const speakBoost = st === 'responding' ? 1.0 : st === 'listening' ? 0.7 : st === 'processing' ? 0.8 : 0.25;
      const explode = energy * speakBoost;

      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < COUNT; i++) {
        const ix = i * 3;
        const bx = base[ix], by = base[ix + 1], bz = base[ix + 2];
        const s = seeds[i];
        const th = Math.atan2(bz, bx);
        const n1 = Math.sin(t * 3.4 + s + by * 6) * Math.cos(t * 2.6 + bx * 5);
        const n2 = Math.sin(t * 8.2 + s * 1.7 + bz * 8);

        const radial =
          1 +
          n1 * (0.02 + explode * 0.1) +
          n2 * (0.015 + explode * 0.08) +
          bass * 0.15 * (0.4 + (1 - Math.min(1, Math.abs(by)))) +
          mid * 0.07 * Math.sin(th * 5 + t * 7) +
          treble * 0.05 * Math.sin(s + t * 18);

        // Hard clamp: this particle's rest distance is shells[i], so its
        // final distance from center can never exceed MAX_R regardless of
        // how large `radial` gets above.
        const shell = shells[i];
        const clampedRadial = shell > 0 ? Math.min(radial, MAX_R / shell) : radial;

        arr[ix] = bx * clampedRadial;
        arr[ix + 1] = by * clampedRadial;
        arr[ix + 2] = bz * clampedRadial;
      }
      pos.needsUpdate = true;

      const spin =
        st === 'responding' ? 1.2 + energy * 1.8
        : st === 'processing' ? 1.7
        : st === 'listening' ? 0.85 + energy * 1.2
        : 0.25;
      group.rotation.y = t * spin;
      group.rotation.x = Math.sin(t * 0.45) * 0.3 + bass * 0.65;
      group.rotation.z = Math.cos(t * 0.35) * 0.2 + mid * 0.35;
      // Stays <= ~1.0 always — MAX_R already leaves 5% headroom, so this
      // subtle breathing pulse can never push the cloud past the ring.
      group.scale.setScalar(0.97 + energy * 0.03);

      mat.size = 0.035 + energy * 0.07 + treble * 0.04;
      mat.opacity = 0.7 + energy * 0.3;

      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      detachMic();
      void audioCtx?.close();
      geo.dispose();
      mat.dispose();
      pointTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [size]);

  return (
    <div
      ref={hostRef}
      className="pointer-events-none"
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
