/**
 * Calculs de matière Glass — INTERNE, non exporté du barrel `visual/glass`.
 * Relocalisé depuis `spatial/materials/compute.ts`, repointé sur
 * `../tokens` (ex `spatial/tokens/materials.ts`).
 */
import { glassMaterialTokens, type GlassMaterial, type MaterialSpec, type SpatialElevation } from '../tokens';
import type { SpatialMode } from '../../../spatial/theme/SpatialTheme';

export function materialSpec(material: GlassMaterial = 'regular', mode: SpatialMode = 'night'): MaterialSpec {
  const base = glassMaterialTokens.material[material];
  if (mode === 'night') return base;

  /* Light = verre blanc plus dense (Acrylic clair) pour rester lisible sur wallpaper clair */
  const boost: Record<GlassMaterial, number> = {
    ultraThin: 3.2,
    thin: 3.0,
    regular: 2.8,
    thick: 2.5,
  };
  const b = boost[material];
  return {
    ...base,
    blurPx: base.blurPx + 8,
    saturate: Math.min(240, base.saturate + 10),
    fillTop: Math.min(0.72, base.fillTop * b),
    fillMid: Math.min(0.58, base.fillMid * b),
    fillBottom: Math.min(0.45, base.fillBottom * b),
    borderOpacity: Math.min(0.55, base.borderOpacity * 1.6),
    highlightOpacity: Math.min(0.7, base.highlightOpacity * 1.4),
    shadowStrength: base.shadowStrength * 0.55,
  };
}

export function glassBackdrop(spec: MaterialSpec): string {
  return `blur(${spec.blurPx}px) saturate(${spec.saturate}%) brightness(${spec.brightness}) contrast(${spec.contrast})`;
}

export function glassFill(spec: MaterialSpec, paperRgb: string): string {
  return `linear-gradient(165deg, rgba(${paperRgb}, ${spec.fillTop}) 0%, rgba(${paperRgb}, ${spec.fillMid}) 48%, rgba(${paperRgb}, ${spec.fillBottom}) 100%)`;
}

export function glassBorder(spec: MaterialSpec, paperRgb: string): string {
  return `1px solid rgba(${paperRgb}, ${spec.borderOpacity})`;
}

export function glassShadows(
  spec: MaterialSpec,
  elevation: SpatialElevation = 'surface',
  opts?: { glow?: boolean; focused?: boolean; paperRgb?: string; accentRgb?: string; mode?: SpatialMode },
): string {
  const mul = glassMaterialTokens.elevation[elevation].shadowMul * spec.shadowStrength;
  const paper = opts?.paperRgb ?? glassMaterialTokens.color.paper;
  const accent = opts?.accentRgb ?? glassMaterialTokens.color.accent;
  const night = (opts?.mode ?? 'night') === 'night';
  const shadowA = night ? 0.35 : 0.12;
  const shadowB = night ? 0.55 : 0.18;
  const shadowC = night ? 0.65 : 0.22;
  const layers = [
    `0 1px 2px rgba(0,0,0,${shadowA * mul})`,
    `0 12px 40px -12px rgba(0,0,0,${shadowB * mul})`,
    `0 28px 64px -24px rgba(0,0,0,${shadowC * mul})`,
    `inset 0 1px 0 rgba(${paper}, ${spec.highlightOpacity})`,
    `inset 0 -1px 0 rgba(0,0,0,${(night ? 0.25 : 0.06) * mul})`,
    `inset 0 0 0 1px rgba(${paper}, ${0.06 + spec.borderOpacity * 0.2})`,
  ];
  if (opts?.glow || opts?.focused) {
    layers.push(`0 0 40px -8px rgba(${accent}, ${opts?.focused ? 0.35 : 0.18})`);
  }
  return layers.join(', ');
}

export function elevationTransform(elevation: SpatialElevation): string {
  const e = glassMaterialTokens.elevation[elevation];
  return `translateZ(${e.translateZ}px) scale(${e.scale})`;
}
