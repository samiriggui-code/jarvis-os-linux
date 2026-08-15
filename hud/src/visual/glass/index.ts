/**
 * API publique du Glass System JARVIS — 5 surfaces + GlassButton (6e export
 * conservé pour compat `vision.tsx::VisionButton`). `internal/compute.ts`
 * n'est jamais réexporté ici : les composants consomment la matière, jamais
 * sa mécanique de calcul.
 */
export { GlassSurface, default as GlassSurfaceDefault } from './GlassSurface';
export type { GlassSurfaceProps, GlassIntensity, GlassLighting } from './GlassSurface';

export { GlassPanel, default as GlassPanelDefault } from './GlassPanel';

export { GlassCard, default as GlassCardDefault } from './GlassCard';
export type { GlassCardProps } from './GlassCard';

export { GlassOverlay, default as GlassOverlayDefault } from './GlassOverlay';
export type { GlassOverlayProps } from './GlassOverlay';

export { GlassHeader, default as GlassHeaderDefault, GLASS_HEADER_HEIGHT } from './GlassHeader';
export type { GlassHeaderProps } from './GlassHeader';

export { GlassButton, default as GlassButtonDefault } from './GlassButton';
export type { GlassButtonProps } from './GlassButton';

export { glassMaterialTokens, glassTokens } from './tokens';
export type { GlassMaterial, SpatialElevation, MaterialSpec } from './tokens';
