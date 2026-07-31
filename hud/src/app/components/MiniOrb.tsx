import React from 'react';
import { motion } from 'motion/react';
import { Radio } from 'lucide-react';
import { Orb } from './orb';
import { useOrbHud } from './orb/useOrbHud';
import { useApp } from '../context/AppContext';

const orbFont = { fontFamily: 'Orbitron, sans-serif' };

/**
 * Orbe réduite et flottante — relais de JARVIS Voice quand une fenêtre
 * ou le Dashboard occupe la scène. Entre en scène depuis le centre,
 * comme si l'orbe centrale se retirait d'elle-même vers son coin.
 */
export function MiniOrb({ corner = 'right' }: { corner?: 'left' | 'right' }) {
  const { orbState, meta, volume, playbackVolume } = useOrbHud();
  const { inputMode } = useApp();
  const sign = corner === 'left' ? 1 : -1;
  const canDrag = inputMode === 'recovery';

  return (
    <motion.div
      drag={canDrag}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 2.1, x: sign * 160, y: -140 }}
      animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, scale: 1.6, x: sign * 120, y: -100 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
      className={`absolute bottom-2 ${corner === 'left' ? 'left-2' : 'right-2'} flex flex-col items-center select-none`}
      style={{ zIndex: 90, width: 130, cursor: canDrag ? 'grab' : 'default' }}
      title="JARVIS — dis « Jarvis » pour commander"
    >
      <div style={{ width: 120, height: 120, filter: `drop-shadow(0 0 18px ${meta.color}50)` }}>
        <Orb
          state={orbState}
          volume={volume}
          playbackVolume={playbackVolume}
          size="sm"
        />
      </div>
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full -mt-2"
        style={{ background: 'rgba(0,8,22,0.85)', border: `1px solid ${meta.color}35`, backdropFilter: 'blur(8px)' }}
      >
        <Radio className="w-2.5 h-2.5" style={{ color: meta.color }} />
        <span style={{ ...orbFont, color: meta.color, fontSize: 8, letterSpacing: '0.2em' }}>{meta.label}</span>
      </div>
    </motion.div>
  );
}
