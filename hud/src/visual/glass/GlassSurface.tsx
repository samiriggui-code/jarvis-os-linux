/**
 * GlassSurface — la matière Glass JARVIS. Base de TOUT le reste du Glass
 * System (`GlassPanel`/`GlassCard`/`GlassOverlay`/`GlassHeader` ne sont que
 * des habillages sémantiques par-dessus). Aucun composant Agentic ne doit
 * réinventer son propre `backdrop-filter`/blur/ombre/lumière — il consomme
 * cette matière, jamais sa mécanique interne.
 *
 * Relocalisé depuis `spatial/GlassSurface/GlassSurface.tsx` (le foyer déjà
 * live sous SectionFrame/MetricTile/vision.tsx) — même corps, tokens
 * repointés sur `./tokens`. Deux props sucre ajoutées (`intensity` en enum,
 * `lighting`) au-dessus de l'API numérique/booléenne existante, sans la
 * casser : un appelant qui passe déjà `dynamicLight`/`glow`/`intensity`
 * (nombre) explicitement garde exactement le même rendu.
 */
import React, {
  useCallback,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { motion } from 'motion/react';
import { glassMaterialTokens, type GlassMaterial, type SpatialElevation } from './tokens';
import { glassBackdrop, glassBorder, glassFill, glassShadows, materialSpec } from './internal/compute';
import { spatialMotionTokens } from '../../spatial/tokens/spatial';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';

export type GlassIntensity = 'subtle' | 'standard' | 'strong';
export type GlassLighting = 'ambient' | 'directional' | 'none';

const INTENSITY_SCALE: Record<GlassIntensity, number> = {
  subtle: 0.6,
  standard: 1,
  strong: 1.6,
};

export type GlassSurfaceProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  material?: GlassMaterial;
  elevation?: SpatialElevation;
  /** Nombre brut (rétro-compat) ou enum sucre — les deux pilotent le même calcul. */
  intensity?: number | GlassIntensity;
  interactive?: boolean;
  dynamicLight?: boolean;
  focused?: boolean;
  glow?: boolean;
  /** Sucre au-dessus de `dynamicLight`/`glow` : 'none' → aucun des deux ; 'ambient' → glow statique seul ; 'directional' → les deux (suivi pointeur, comportement historique). Ignoré si `dynamicLight`/`glow` sont passés explicitement. */
  lighting?: GlassLighting;
  radius?: keyof typeof glassMaterialTokens.radius;
  padding?: keyof typeof glassMaterialTokens.space | 0 | number;
  children?: ReactNode;
};

export function GlassSurface({
  material = 'regular',
  elevation = 'surface',
  intensity = 'standard',
  interactive = false,
  dynamicLight,
  focused = false,
  glow,
  lighting,
  radius = 'lg',
  padding = 'md',
  style,
  children,
  onMouseMove,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  className,
  ...rest
}: GlassSurfaceProps) {
  const theme = useSpatialTheme();
  const ref = useRef<HTMLDivElement | null>(null);
  const spec = materialSpec(material, theme.mode);
  const paper = theme.paper;

  const resolvedDynamicLight = dynamicLight ?? lighting === 'directional';
  const resolvedGlow = glow ?? (lighting === 'ambient' || lighting === 'directional');
  const numericIntensity = typeof intensity === 'number' ? intensity : INTENSITY_SCALE[intensity];

  const pad =
    padding === 0
      ? 0
      : typeof padding === 'number'
        ? padding
        : glassMaterialTokens.space[padding];

  const trackLight = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((resolvedDynamicLight || interactive) && ref.current) {
        const r = ref.current.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 100;
        const y = ((e.clientY - r.top) / r.height) * 100;
        ref.current.style.setProperty('--light-x', `${x}%`);
        ref.current.style.setProperty('--light-y', `${y}%`);
      }
      onMouseMove?.(e);
    },
    [resolvedDynamicLight, interactive, onMouseMove],
  );

  const base: CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: glassMaterialTokens.radius[radius],
    padding: pad,
    background: glassFill(spec, paper),
    border: glassBorder(spec, paper),
    backdropFilter: glassBackdrop(spec),
    WebkitBackdropFilter: glassBackdrop(spec),
    boxShadow: glassShadows(spec, elevation, {
      glow: resolvedGlow || focused,
      focused,
      paperRgb: paper,
      accentRgb: theme.accent,
      mode: theme.mode,
    }),
    color: theme.text,
    transition: 'box-shadow 0.35s ease, border-color 0.35s ease, background 0.35s ease, color 0.25s ease',
    ...style,
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      style={base}
      data-spatial-material={material}
      data-spatial-elevation={elevation}
      data-spatial-mode={theme.mode}
      onMouseMove={trackLight}
      onPointerDown={(e) => {
        if (interactive) e.currentTarget.style.setProperty('--press', '1');
        onPointerDown?.(e as unknown as React.PointerEvent<HTMLDivElement>);
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.setProperty('--press', '0');
        onPointerUp?.(e as unknown as React.PointerEvent<HTMLDivElement>);
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.setProperty('--press', '0');
        onPointerLeave?.(e as unknown as React.PointerEvent<HTMLDivElement>);
      }}
      whileHover={interactive ? { opacity: 1, transition: spatialMotionTokens.spring.focus } : undefined}
      {...(rest as Record<string, unknown>)}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          pointerEvents: 'none',
          background: `radial-gradient(circle ${glassMaterialTokens.light.radiusPx}px at var(--light-x, 50%) var(--light-y, 28%), rgba(${paper}, ${glassMaterialTokens.light.intensity * numericIntensity}), transparent 70%)`,
          mixBlendMode: theme.mode === 'light' ? 'soft-light' : 'overlay',
          opacity: resolvedDynamicLight || interactive ? 1 : 0.55,
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: '42%',
          borderRadius: 'inherit',
          pointerEvents: 'none',
          background: `linear-gradient(180deg, rgba(${paper}, ${spec.highlightOpacity * 0.55}) 0%, transparent 100%)`,
          opacity: 0.7,
        }}
      />
      {/* `style` (via `base`) peut demander `display:flex` sur le motion.div
          externe pour que les enfants puissent faire `flex:1` (ex.
          `ChartCard` → recharts `ResponsiveContainer`, qui a besoin d'une
          hauteur définie de bout en bout). Sans ce wrapper qui répercute la
          même disposition, la chaîne flex casse ici et les enfants qui
          comptent sur `flex:1;minHeight:0` s'effondrent à 0px — observé en
          pratique (chart invisible, `ResponsiveContainer` mesuré à 0×0).
          `display:flex;flexDirection:column;align-items:stretch` sur un
          wrapper à enfants block-level ordinaires reste visuellement
          identique au flux normal — safe par défaut, pas juste pour les cas
          qui en ont besoin. */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
        }}
      >
        {children}
      </div>
    </motion.div>
  );
}

export default GlassSurface;
