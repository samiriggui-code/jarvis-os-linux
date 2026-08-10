/**
 * Spatialize le HUD produit (auth, boot, idle) — même light|night que le lab.
 */
import React, { useEffect, useState, type ReactNode } from 'react';
import {
  SpatialThemeProvider,
  applySpatialCssVars,
  persistSpatialMode,
  readSpatialMode,
  spatialThemeColors,
  type SpatialMode,
} from '../spatial/theme/SpatialTheme';

export function HudSpatialRoot({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<SpatialMode>(() => readSpatialMode());

  useEffect(() => {
    applySpatialCssVars(spatialThemeColors(mode));
    persistSpatialMode(mode);
  }, [mode]);

  useEffect(() => {
    const onSet = (e: Event) => {
      const m = (e as CustomEvent<SpatialMode>).detail;
      if (m !== 'light' && m !== 'night') return;
      setMode(m);
      const url = new URL(window.location.href);
      url.searchParams.set('theme', m);
      window.history.replaceState({}, '', url);
    };
    window.addEventListener('spatial-lab-set-mode', onSet as EventListener);
    return () => window.removeEventListener('spatial-lab-set-mode', onSet as EventListener);
  }, []);

  return <SpatialThemeProvider mode={mode}>{children}</SpatialThemeProvider>;
}
