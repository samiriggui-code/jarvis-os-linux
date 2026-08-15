/**
 * GlassHeader — matière plus légère, réservée aux bandeaux titre (ex. le
 * titre de `Dashboard`). PAS utilisé par `SectionHeader` (agentic), qui reste
 * délibérément typo-only sans glass.
 */
import React, { type ReactNode } from 'react';
import { GlassSurface } from './GlassSurface';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';

/** Hauteur fixe — `Dashboard` s'en sert pour retrancher l'espace disponible du Workspace en dessous. */
export const GLASS_HEADER_HEIGHT = 56;

export interface GlassHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function GlassHeader({ title, subtitle, actions }: GlassHeaderProps) {
  const theme = useSpatialTheme();
  return (
    <GlassSurface
      material="ultraThin"
      elevation="surface"
      radius="md"
      padding="sm"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        height: GLASS_HEADER_HEIGHT,
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ minWidth: 0, overflow: 'hidden' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {actions ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{actions}</div> : null}
    </GlassSurface>
  );
}

export default GlassHeader;
