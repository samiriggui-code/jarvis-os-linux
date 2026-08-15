/**
 * Fond secondaire vendorisé — PAS le fond spatial principal du HUD
 * (`app/components/Background.tsx`, 100% JARVIS, à ne jamais remplacer par ça).
 * Réservé aux contextes secondaires/simulation qui en auraient besoin plus
 * tard ; aucun appelant aujourd'hui — voir hud/vendor/metronic/README.md.
 */
import { useSpatialTheme } from '../spatial/theme/SpatialTheme';

import bg1 from '../../vendor/metronic/backgrounds/bg-1.png';
import bg1Dark from '../../vendor/metronic/backgrounds/bg-1-dark.png';

export interface BackdropProps {
  opacity?: number;
  className?: string;
}

export function Backdrop({ opacity = 1, className }: BackdropProps) {
  const { mode } = useSpatialTheme();
  const src = mode === 'light' ? bg1 : bg1Dark;
  return (
    <div
      className={className}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `url(${src})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
}

export default Backdrop;
