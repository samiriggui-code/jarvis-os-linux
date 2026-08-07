import React from 'react';
import { Orb } from './orb';
import { OrbLite } from './orb/OrbLite';
import { useOrbHud } from './orb/useOrbHud';
import { getDevicePolicy } from '../../ui/core/devicePolicy';

const display = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };

/** Centre HUD — orbe pleine taille, wake « Jarvis » uniquement (pas de clic). */
export function AICore() {
  const { orbState, meta, volume, playbackVolume } = useOrbHud();
  const lite = getDevicePolicy().persona === 'kiosk';

  return (
    <div className="flex flex-col items-center justify-center gap-2 select-none w-full h-full min-h-0">
      <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-visible">
        {lite ? (
          <OrbLite state={orbState} size={220} />
        ) : (
          <Orb
            state={orbState}
            volume={volume}
            playbackVolume={playbackVolume}
          />
        )}
      </div>

      <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pb-1">
        <span
          style={{
            ...display,
            color: meta.color,
            fontSize: 13,
            letterSpacing: '0.28em',
            fontWeight: 600,
            opacity: 0.95,
          }}
        >
          {meta.label}
        </span>
        <span style={{ ...mono, color: 'rgba(255,255,255,0.28)', fontSize: 9, letterSpacing: '0.08em' }}>
          {meta.sub}
        </span>
      </div>
    </div>
  );
}
