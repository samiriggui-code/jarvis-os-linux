import React from 'react';
import { motion } from 'motion/react';
import { Radio } from 'lucide-react';
import { Orb } from './orb';
import { OrbLite } from './orb/OrbLite';
import { useOrbHud } from './orb/useOrbHud';
import { useApp } from '../context/AppContext';
import { getDevicePolicy } from '../../ui/core/devicePolicy';
import { GlassPanel } from '../../components/glass';
import { tokens } from '../../ui/tokens';

const orbFont = { fontFamily: tokens.font.display };

export type MiniOrbPosition = 'left' | 'right' | 'bottom-center';

const POSITION_STYLE: Record<MiniOrbPosition, React.CSSProperties> = {
  left: { left: 12 },
  right: { right: 12 },
  // `left: 50%` + décalage figé (pas de translateX : framer-motion possède déjà
  // le `transform` inline pour l'animation d'entrée/sortie, un second transform
  // CSS via className serait écrasé).
  'bottom-center': { left: 'calc(50% - 70px)' },
};

/**
 * Orbe réduite et flottante — relais de JARVIS Voice quand une fenêtre,
 * une surface plein écran ou le Dashboard occupe la scène. Entre en scène
 * depuis le centre, comme si l'orbe centrale se retirait d'elle-même.
 */
export function MiniOrb({ position = 'right' }: { position?: MiniOrbPosition }) {
  const { orbState, meta, volume, playbackVolume } = useOrbHud();
  const { inputMode } = useApp();
  const sign = position === 'left' ? 1 : position === 'right' ? -1 : 0;
  const canDrag = inputMode === 'recovery' && position !== 'bottom-center';
  const lite = getDevicePolicy().persona === 'kiosk';

  return (
    <motion.div
      drag={canDrag}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 2.1, x: sign * 160, y: -140 }}
      animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, scale: 1.6, x: sign * 120, y: -100 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
      className="absolute bottom-3 flex flex-col items-center select-none overflow-visible"
      style={{ zIndex: 90, width: 140, cursor: canDrag ? 'grab' : 'default', ...POSITION_STYLE[position] }}
      title="JARVIS — dis « Jarvis » pour commander"
    >
      <div
        className="overflow-visible"
        style={{ width: 112, height: 112, filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.35))' }}
      >
        {lite ? (
          <OrbLite state={orbState} size={112} />
        ) : (
          <Orb
            state={orbState}
            volume={volume}
            playbackVolume={playbackVolume}
            size={112}
          />
        )}
      </div>
      <GlassPanel
        level="regular"
        radius="pill"
        padding="xs"
        className="flex items-center gap-1.5 -mt-2"
      >
        <Radio className="w-2.5 h-2.5" style={{ color: meta.color }} />
        <span style={{ ...orbFont, color: tokens.color.text, fontSize: 9 }}>{meta.label}</span>
      </GlassPanel>
    </motion.div>
  );
}
