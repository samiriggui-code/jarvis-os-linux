/**
 * Fond HUD produit = SpatialBackdrop (ambiance Vision Pro neutre ).
 */
import React from 'react';
import { SpatialBackdrop } from '../../spatial/SpatialBackdrop/SpatialBackdrop';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';

export function Background() {
  const theme = useSpatialTheme();
  return <SpatialBackdrop mode={theme.mode} />;
}

export default Background;
