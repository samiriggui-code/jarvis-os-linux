import { GlassPanel } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface TextBlockProps {
  title?: string;
  text: string;
}

/** Généralise `layout/ContentBlocks.tsx::BodyText` (qui reste, chemin décoratif). */
export function TextBlock({ title, text }: TextBlockProps) {
  const theme = useSpatialTheme();
  return (
    <GlassPanel material="ultraThin" elevation="surface" radius="lg" padding="md" style={{ height: '100%', boxSizing: 'border-box', overflow: 'auto' }}>
      {title ? <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: theme.text }}>{title}</p> : null}
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: theme.textMuted, whiteSpace: 'pre-wrap' }}>{text}</p>
    </GlassPanel>
  );
}

export default TextBlock;
