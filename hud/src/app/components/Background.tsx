/**
 * Fond HUD produit = SpatialBackdrop (dégradés colorés light|night).
 * Plus de grille `vision-bg` plate — même atmosphère que le lab Vision.
 */
import React from 'react';
import { SpatialBackdrop } from '../../spatial/SpatialBackdrop/SpatialBackdrop';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';

export function Background() {
  const theme = useSpatialTheme();
  return <SpatialBackdrop mode={theme.mode} />;
}

export default Background;
