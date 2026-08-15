/** Bulle de message générique — pas de réutilisation de CommandConsole.tsx (couplé Core/contexte). */
import { GlassCard } from '../../../visual/glass';
import { Avatar } from '../../../visual/Avatar';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface MessageCardProps {
  author: string;
  identity?: string;
  text: string;
  timestamp?: string;
}

export function MessageCard({ author, identity, text, timestamp }: MessageCardProps) {
  const theme = useSpatialTheme();
  return (
    <GlassCard
      material="thin"
      elevation="elevated"
      radius="lg"
      padding="md"
      style={{ height: '100%', boxSizing: 'border-box', display: 'flex', gap: 10, overflow: 'auto' }}
    >
      <Avatar identity={identity ?? author} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{author}</span>
          {timestamp ? <span style={{ fontSize: 10, color: theme.textMuted, flexShrink: 0 }}>{timestamp}</span> : null}
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: theme.textMuted, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{text}</p>
      </div>
    </GlassCard>
  );
}

export default MessageCard;
