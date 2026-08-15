/**
 * Layout Engine — intentions (région/taille/rôle) → grille CSS.
 * Pas de position:absolute comme système principal.
 * Hauteur intrinsèque (auto) ; largeur par span de grille.
 */

import type { Region, Size, SurfaceComponent } from '../protocol/surface';
import { LAYOUT_SPACING, type LayoutRole, spanForRole, type InfoDensity } from './tokens';

const REGION_ORDER: Record<Region, number> = {
  backdrop: 0,
  top: 1,
  left: 2,
  center: 3,
  right: 4,
  bottom: 5,
  overlay: 6,
};

/** Rôle dérivé du catalogue + taille intention — l’agent ne fixe pas les px. */
export function roleOf(name: string, size: Size): LayoutRole {
  if (
    name === 'SectionHeader' ||
    name === 'StatusBadge' ||
    name === 'AvatarChip' ||
    name === 'ToastStack'
  ) {
    return 'chrome';
  }
  if (name === 'StatCard' || name === 'MetricChart') return 'metric';
  if (name === 'VerificationCard' || name === 'ServiceHub' || name === 'DataTable') {
    return size === 'wide' || size === 'fill' ? 'detail' : 'panel';
  }
  if (size === 'fill') return 'fill';
  if (size === 'compact') return 'metric';
  if (size === 'wide') return 'detail';
  return 'panel';
}

export interface PlacedNode {
  id: string;
  node: SurfaceComponent;
  role: LayoutRole;
  style: React.CSSProperties;
}

export interface PlaceOptions {
  density?: InfoDensity;
  sectionExpanded?: boolean;
}

/** Style du canevas surface (sans scroll). */
export const surfaceCanvasStyle = (): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
  gap: LAYOUT_SPACING.md,
  alignContent: 'start',
  alignItems: 'start',
  width: '100%',
  height: '100%',
  minHeight: 0,
  overflow: 'hidden',
  padding: LAYOUT_SPACING.sm,
  boxSizing: 'border-box',
});

/**
 * Place les racines dans une grille 12 colonnes.
 * Contenu → span ; hauteur = auto (intrinsic).
 */
export const place = (
  roots: readonly string[],
  components: Record<string, SurfaceComponent>,
  options: PlaceOptions = {},
): PlacedNode[] => {
  const density = options.density ?? 'standard';
  const sectionExpanded = options.sectionExpanded ?? false;

  const entries = roots
    .map((id, index) => ({ id, node: components[id], index }))
    .filter((e): e is { id: string; node: SurfaceComponent; index: number } => Boolean(e.node));

  entries.sort((a, b) => {
    const ra = REGION_ORDER[a.node.region] ?? REGION_ORDER.center;
    const rb = REGION_ORDER[b.node.region] ?? REGION_ORDER.center;
    return ra !== rb ? ra - rb : a.index - b.index;
  });

  return entries.map(({ id, node }) => {
    const role = roleOf(node.name, node.size);
    const isOverlay = node.region === 'overlay';
    const isBackdrop = node.region === 'backdrop';

    if (isOverlay) {
      return {
        id,
        node,
        role,
        style: {
          position: 'absolute',
          inset: LAYOUT_SPACING.md,
          zIndex: 2,
          pointerEvents: 'none',
          width: 'auto',
          height: 'auto',
          maxWidth: '40%',
          justifySelf: 'end',
          alignSelf: 'start',
        },
      };
    }

    if (isBackdrop) {
      return {
        id,
        node,
        role,
        style: { position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' },
      };
    }

    if (role === 'chrome') {
      return {
        id,
        node,
        role,
        style: {
          gridColumn: '1 / -1',
          width: 'fit-content',
          maxWidth: '100%',
          height: 'auto',
          minHeight: 0,
        },
      };
    }

    const span = spanForRole(role, density, sectionExpanded);
    return {
      id,
      node,
      role,
      style: {
        gridColumn: `span ${span}`,
        width: '100%',
        height: 'auto',
        minHeight: 0,
        minWidth: 0,
        alignSelf: 'start',
      },
    };
  });
};
