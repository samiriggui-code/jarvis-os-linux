import React from 'react';
import { GlassSurface, type GlassSurfaceProps } from './GlassSurface';

/** Panneau glass — alias sémantique de GlassSurface (elevation surface). */
export function GlassPanel(props: GlassSurfaceProps) {
  return <GlassSurface material={props.material ?? 'thin'} elevation={props.elevation ?? 'surface'} {...props} />;
}

export default GlassPanel;
