/**
 * VisionChrome — panneau produit. Contient son contenu (objet spatial),
 * pas un scroll du parent qui fait déborder le Glass.
 */
import type { CSSProperties, ReactNode } from 'react';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { tokens, vibrancy } from '../../ui/tokens';

export const visionTitle: CSSProperties = {
  fontFamily: tokens.font.display,
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: vibrancy.primary,
  margin: 0,
};

export const visionCaption: CSSProperties = {
  fontFamily: tokens.font.body,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.02em',
  color: vibrancy.secondary,
  margin: 0,
};

export const visionBody: CSSProperties = {
  fontFamily: tokens.font.body,
  fontSize: 13,
  lineHeight: 1.45,
  color: vibrancy.secondary,
  margin: 0,
};

export const visionMono: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 12,
  color: vibrancy.primary,
};

export function VisionChrome({
  title,
  eyebrow,
  trailing,
  children,
  level = 'subtle',
  fill,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  level?: 'subtle' | 'regular' | 'strong' | 'floating';
  fill?: boolean;
}) {
  return (
    <GlassPanel
      level={level}
      radius="lg"
      padding="md"
      fill={fill}
      style={{
        borderRadius: 26,
        height: fill ? '100%' : undefined,
        minHeight: fill ? 0 : undefined,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {(title || eyebrow || trailing) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 12,
            flexShrink: 0,
          }}
        >
          <div>
            {eyebrow ? <p style={{ ...visionCaption, marginBottom: 4 }}>{eyebrow}</p> : null}
            {title ? <p style={visionTitle}>{title}</p> : null}
          </div>
          {trailing}
        </div>
      )}
      <div
        style={{
          flex: fill ? 1 : undefined,
          minHeight: fill ? 0 : undefined,
          overflow: fill ? 'hidden' : undefined,
          display: fill ? 'flex' : undefined,
          flexDirection: fill ? 'column' : undefined,
        }}
      >
        {children}
      </div>
    </GlassPanel>
  );
}
