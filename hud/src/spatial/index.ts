export { spatialTokens } from './tokens/materials';
export type { GlassMaterial, SpatialElevation, MaterialSpec } from './tokens/materials';

export {
  materialSpec,
  glassBackdrop,
  glassFill,
  glassBorder,
  glassShadows,
  elevationTransform,
} from './materials/compute';

export { spatialSprings, appearVariants } from './motion/springs';

export { GlassSurface } from './GlassSurface/GlassSurface';
export type { GlassSurfaceProps } from './GlassSurface/GlassSurface';

export { SpatialWindow } from './SpatialWindow/SpatialWindow';
export type { SpatialWindowProps } from './SpatialWindow/SpatialWindow';

export { GlassPanel } from './GlassPanel/GlassPanel';
export { GlassCard } from './GlassCard/GlassCard';
export type { GlassCardProps } from './GlassCard/GlassCard';
export { GlassButton } from './GlassButton/GlassButton';
export type { GlassButtonProps } from './GlassButton/GlassButton';

export { SpatialBackdrop } from './SpatialBackdrop/SpatialBackdrop';
export {
  SpatialThemeProvider,
  useSpatialTheme,
  applySpatialCssVars,
  readSpatialMode,
  persistSpatialMode,
  spatialThemeColors,
} from './theme/SpatialTheme';
export type { SpatialMode } from './theme/SpatialTheme';

export { VisionOSMaterialLab } from './VisionOSMaterialLab';
