/**
 * MediaFrame — base UNIQUE pour CameraPreview/ImageViewer/VideoPreview/
 * Screenshot (règle de consolidation : un renderer, des presets).
 */
import type { ReactNode } from 'react';
import { GlassCard } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface MediaFrameProps {
  caption?: string;
  titlebar?: string;
  aspectRatio?: number;
  children?: ReactNode;
}

export function MediaFrame({ caption, titlebar, aspectRatio, children }: MediaFrameProps) {
  const theme = useSpatialTheme();
  return (
    <GlassCard
      material="thin"
      elevation="elevated"
      radius="lg"
      padding={0}
      style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {titlebar ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid rgba(${theme.paper}, 0.08)`, flexShrink: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF5F57' }} />
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FEBC2E' }} />
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#28C840' }} />
          <span style={{ fontSize: 11, color: theme.textMuted, marginLeft: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {titlebar}
          </span>
        </div>
      ) : null}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          aspectRatio: aspectRatio ? String(aspectRatio) : undefined,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `rgba(${theme.paper}, 0.03)`,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
      {caption ? (
        <p style={{ margin: 0, padding: '6px 10px', fontSize: 11, color: theme.textMuted, flexShrink: 0 }}>{caption}</p>
      ) : null}
    </GlassCard>
  );
}

export default MediaFrame;
