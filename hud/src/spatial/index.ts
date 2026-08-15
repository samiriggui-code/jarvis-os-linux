// Glass (material/elevation/GlassSurface/Panel/Card/Button) a déménagé dans
// `visual/glass/` — voir hud/vendor/metronic/README.md et le plan Agentic
// Component Library + Glass System pour l'historique de la migration.
export { spatialMotionTokens } from './tokens/spatial';

export { spatialSprings, appearVariants } from './motion/springs';

export { SpatialWindow } from './SpatialWindow/SpatialWindow';
export type { SpatialWindowProps } from './SpatialWindow/SpatialWindow';

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
