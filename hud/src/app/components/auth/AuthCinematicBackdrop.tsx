/**
 * Fond auth / enrôlement / boot / lock — même atmosphère que le HUD idle.
 * Source unique : SpatialBackdrop (bleu → magenta / bokeh).
 */
import React from 'react';
import { SpatialBackdrop } from '../../../spatial/SpatialBackdrop/SpatialBackdrop';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export function AuthCinematicBackdrop() {
  const { mode } = useSpatialTheme();
  return <SpatialBackdrop mode={mode} />;
}

export default AuthCinematicBackdrop;
