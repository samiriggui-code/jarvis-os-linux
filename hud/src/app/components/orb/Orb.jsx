import React, { useMemo, useRef } from "react";
import OrbView from "./JarvisOrb";

/**
 * Adaptateur HUD → OrbView.
 * AICore fournit state/volume/playbackVolume ; on synthétise un
 * pseudo-AnalyserNode (même interface que Web Audio) pour piloter
 * OrbView sans micro. Un vrai AnalyserNode (TTS / micro) peut être
 * passé via la prop `analyser` et prend alors la priorité.
 */
export default function Orb({
  state = "idle",
  volume = 0,
  playbackVolume = 0,
  onClick,
  analyser = null,
  tempo = 0.5,
  size = null,
}) {
  const hudRef = useRef({ state, volume, playbackVolume });
  hudRef.current = { state, volume, playbackVolume };

  const hudAnalyser = useMemo(
    () => ({
      frequencyBinCount: 128,
      getByteFrequencyData(data) {
        const { state: s, volume: v, playbackVolume: pv } = hudRef.current;
        const t = performance.now() / 1000;
        let level;
        if (s === "speaking") level = pv;
        else if (s === "listening") level = v;
        else if (s === "thinking") level = 0.25 + 0.2 * Math.abs(Math.sin(t * 2.4));
        else level = 0.06 + 0.05 * Math.abs(Math.sin(t * 0.9));
        for (let i = 0; i < data.length; i++) {
          const band = i / data.length;
          // profil spectral : graves dominants quand JARVIS parle,
          // aigus dominants à l'écoute, plat sinon
          const w =
            s === "listening" ? 0.3 + band * 0.7
            : s === "speaking" ? 1 - band * 0.55
            : 1 - band * 0.35;
          const jitter = 0.8 + 0.2 * Math.sin(t * 13 + i * 1.7);
          data[i] = Math.max(0, Math.min(255, Math.round(level * w * jitter * 255)));
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
      />
    </div>
  );
}
