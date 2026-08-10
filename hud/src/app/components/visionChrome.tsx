/**
 * Chrome Vision partagé pour panneaux produit HUD.
 * Remplace les plaques rgba(0,8,20) + titres cyan glow.
 */
import type { CSSProperties, ReactNode } from 'react';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { tokens } from '../../ui/tokens';

export const visionTitle: CSSProperties = {
  fontFamily: tokens.font.display,
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: tokens.color.text,
  margin: 0,
};

export const visionCaption: CSSProperties = {
  fontFamily: tokens.font.body,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.02em',
  color: tokens.color.textMuted,
  margin: 0,
};

export const visionBody: CSSProperties = {
  fontFamily: tokens.font.body,
  fontSize: 13,
  lineHeight: 1.45,
  color: tokens.color.textMuted,
  margin: 0,
};

export const visionMono: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 12,
  color: tokens.color.text,
};

export function VisionChrome({
  title,
  eyebrow,
  trailing,
  children,
  level = 'regular',
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
    <GlassPanel level={level} radius="lg" padding="md" fill={fill} style={{ height: fill ? '100%' : undefined }}>
      {(title || eyebrow || trailing) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            {eyebrow ? <p style={{ ...visionCaption, marginBottom: 4 }}>{eyebrow}</p> : null}
            {title ? <p style={visionTitle}>{title}</p> : null}
          </div>
          {trailing}
        </div>
      )}
      {children}
    </GlassPanel>
  );
}
