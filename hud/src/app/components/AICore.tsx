import React from 'react';
import { Orb } from './orb';
import { OrbLite } from './orb/OrbLite';
import { useOrbHud } from './orb/useOrbHud';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';
import { getDevicePolicy } from '../../ui/core/devicePolicy';
import { tokens } from '../../ui/tokens';

const display = { fontFamily: tokens.font.display };
const body = { fontFamily: tokens.font.body };

function sentenceCase(label: string) {
  return label
    .toLocaleLowerCase('fr-FR')
    .replace(/^./, character => character.toLocaleUpperCase('fr-FR'));
}

/** Centre HUD — orbe P6 + libellé. */
export function AICore() {
  const { orbState, meta, volume, playbackVolume } = useOrbHud();
  const { mode } = useSpatialTheme();
  const lite = getDevicePolicy().persona === 'kiosk';

  return (
    <div className="flex flex-col items-center justify-center gap-2 select-none w-full h-full min-h-0">
      <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-visible relative">
        <div
          style={{
            width: 'min(100%, 360px)',
            height: 'min(100%, 360px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {lite ? (
            <OrbLite state={orbState} size={200} />
          ) : (
            <Orb
              state={orbState}
              volume={volume}
              playbackVolume={playbackVolume}
              lightMode={mode === 'light'}
              simVoice
            />
          )}
        </div>
      </div>

      <div className="relative z-[3] flex flex-col items-center gap-0.5 flex-shrink-0 pb-1">
        <span
          style={{
            ...display,
            color: meta.color,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            opacity: 0.95,
          }}
        >
          {sentenceCase(meta.label)}
        </span>
        <span
          style={{
            ...body,
            color: tokens.color.textMuted,
            fontSize: 11,
            letterSpacing: '-0.01em',
          }}
        >
          {sentenceCase(meta.sub)}
        </span>
      </div>
    </div>
  );
}
