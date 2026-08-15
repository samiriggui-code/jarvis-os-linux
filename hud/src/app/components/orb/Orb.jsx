import React, { useMemo, useRef } from "react";
import OrbView from "./JarvisOrb";

/**
 * Adaptateur HUD → OrbView.
 * AICore fournit state/volume/playbackVolume ; on synthétise un
 * pseudo-AnalyserNode (même interface que Web Audio) pour piloter
 * OrbView sans micro. Un vrai AnalyserNode (TTS / micro) peut être
 * passé via la prop `analyser` et prend alors la priorité.
 *
 * `simVoice` : enveloppe type parole (syllabes + pauses) pour preview
 * des vibrations / éjections sans micro ni TTS.
 */
function speechEnvelope(t) {
  // Phrases ~2.4s, syllabes ~8–12 Hz, pauses irrégulières
  const phrase = 0.55 + 0.45 * Math.sin(t * 2.35);
  const syl = Math.pow(Math.max(0, Math.sin(t * 10.8)), 2.4);
  const syl2 = Math.pow(Math.max(0, Math.sin(t * 7.1 + 1.7)), 2.1) * 0.65;
  const burst = Math.max(syl, syl2);
  const gate = Math.sin(t * 0.42) > -0.55 ? 1 : 0.12;
  const flutter = 0.85 + 0.15 * Math.sin(t * 27);
  return Math.min(0.92, (0.22 + 0.62 * burst * phrase) * gate * flutter);
}

export default function Orb({
  state = "idle",
  volume = 0,
  playbackVolume = 0,
  onClick,
  analyser = null,
  tempo = 0.5,
  size = null,
  /** 1 = défaut JarvisOrb. Au-delà de ~1.8 l'orbe éclate — plafonné côté shader. */
  sensitivity = 1,
  /** true = HUD light — contraste shader (limbe / creux). */
  lightMode = false,
  /** Simule une voix pour voir les vibrations (preview). */
  simVoice = false,
}) {
  const hudRef = useRef({ state, volume, playbackVolume, simVoice });
  hudRef.current = { state, volume, playbackVolume, simVoice };

  const hudAnalyser = useMemo(
    () => ({
      frequencyBinCount: 128,
      getByteFrequencyData(data) {
        const { state: s, volume: v, playbackVolume: pv, simVoice: sim } =
          hudRef.current;
        const t = performance.now() / 1000;
        let level;
        let profile = "flat"; // flat | speak | listen

        if (s === "speaking" && pv > 0.04) {
          level = pv;
          profile = "speak";
        } else if (s === "listening" && v > 0.04) {
          level = v;
          profile = "listen";
        } else if (sim || s === "speaking" || s === "responding") {
          // Preview voix (ou speaking sans volume réel)
          level = speechEnvelope(t);
          profile = "speak";
        } else if (s === "thinking" || s === "processing") {
          level = 0.25 + 0.2 * Math.abs(Math.sin(t * 2.4));
          profile = "flat";
        } else {
          level = 0.06 + 0.05 * Math.abs(Math.sin(t * 0.9));
          profile = "flat";
        }

        for (let i = 0; i < data.length; i++) {
          const band = i / data.length;
          const w =
            profile === "listen"
              ? 0.3 + band * 0.7
              : profile === "speak"
                ? 1 - band * 0.55
                : 1 - band * 0.35;
          const jitter = 0.78 + 0.22 * Math.sin(t * 14 + i * 1.7);
          // Micro-transitoires type attaque de syllabe
          const attack =
            profile === "speak"
              ? 0.9 + 0.1 * Math.max(0, Math.sin(t * 10.8 + i * 0.05))
              : 1;
          data[i] = Math.max(
            0,
            Math.min(255, Math.round(level * w * jitter * attack * 255))
          );
        }
      },
    }),
    []
  );

  return (
    <div
      onClick={onClick}
      style={{
        width: "100%",
        height: "100%",
        cursor: onClick ? "pointer" : "default",
        overflow: "visible",
      }}
    >
      <OrbView
        analyser={analyser || hudAnalyser}
        tempo={tempo}
        background="transparent"
        size={size}
        sensitivity={simVoice ? Math.max(sensitivity, 1.15) : sensitivity}
        lightMode={lightMode ? 1 : 0}
      />
    </div>
  );
}
