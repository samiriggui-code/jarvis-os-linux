/**
 * Bascule Clair / Nuit — produit (auth + HUD), pas seulement le lab.
 * Émet `spatial-lab-set-mode` → HudSpatialRoot applique CSS vars + backdrop.
 */
import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { GlassButton } from '../../components/glass/GlassButton';
import {
  persistSpatialMode,
  useSpatialTheme,
  type SpatialMode,
} from '../../spatial/theme/SpatialTheme';

function setMode(mode: SpatialMode) {
  persistSpatialMode(mode);
  window.dispatchEvent(new CustomEvent('spatial-lab-set-mode', { detail: mode }));
}

export function ThemeModeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useSpatialTheme();
  const next: SpatialMode = theme.mode === 'night' ? 'light' : 'night';

  return (
    <GlassButton
      type="button"
      tone="neutral"
      title={theme.mode === 'night' ? 'Passer en mode clair' : 'Passer en mode nuit'}
      onClick={() => setMode(next)}
      icon={theme.mode === 'night' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      style={
        compact
          ? { width: 32, height: 32, padding: 0, placeContent: 'center', borderRadius: 12 }
          : undefined
      }
    >
      {compact ? null : theme.mode === 'night' ? 'Clair' : 'Nuit'}
    </GlassButton>
  );
}

export default ThemeModeToggle;
