import React, { type CSSProperties, type ReactNode } from 'react';
import { tokens } from '../../ui/tokens';
import { GlassPanel, type GlassPanelProps } from './GlassPanel';

/**
 * GlassPanel + en-tête optionnel (eyebrow/title/subtitle). C'est la forme
 * que prennent la plupart des cartes de contenu (StatCard, InfoCard,
 * device tiles de Mission Home) — pas un nouveau système, un habillage
 * au-dessus de GlassPanel.
 */

export interface GlassCardProps extends Omit<GlassPanelProps, 'children' | 'title'> {
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}

export function GlassCard({ eyebrow, title, subtitle, action, children, ...panelProps }: GlassCardProps) {
  const hasHeader = eyebrow || title || subtitle || action;
  const eyebrowStyle: CSSProperties = {
    fontFamily: tokens.font.body,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.02em',
    color: tokens.color.textMuted,
    margin: 0,
  };
  const titleStyle: CSSProperties = {
    fontFamily: tokens.font.display,
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: '-0.02em',
    color: tokens.color.text,
    margin: '2px 0 0',
  };
  const subtitleStyle: CSSProperties = {
    fontFamily: tokens.font.body,
    fontSize: 12,
    color: tokens.color.textMuted,
    margin: '4px 0 0',
  };
  return (
    <GlassPanel {...panelProps}>
      {hasHeader ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: tokens.space.sm }}>
          <div>
            {eyebrow ? <p style={eyebrowStyle}>{eyebrow}</p> : null}
            {title ? <p style={titleStyle}>{title}</p> : null}
            {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
          </div>
          {action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}
        </div>
      ) : null}
      {children ? <div style={{ marginTop: hasHeader ? tokens.space.sm : 0 }}>{children}</div> : null}
    </GlassPanel>
  );
}

export default GlassCard;
