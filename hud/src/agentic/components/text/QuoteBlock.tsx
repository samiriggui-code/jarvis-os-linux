import { GlassPanel } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface QuoteBlockProps {
  text: string;
  cite?: string;
}

export function QuoteBlock({ text, cite }: QuoteBlockProps) {
  const theme = useSpatialTheme();
  return (
    <GlassPanel
      material="ultraThin"
      elevation="surface"
      radius="lg"
      padding="md"
      style={{ height: '100%', boxSizing: 'border-box', borderLeft: `3px solid rgba(${theme.accent}, 0.5)`, overflow: 'auto' }}
    >
      <p style={{ margin: 0, fontSize: 13, fontStyle: 'italic', color: theme.text, lineHeight: 1.5 }}>{text}</p>
      {cite ? <p style={{ margin: '8px 0 0', fontSize: 11, color: theme.textMuted }}>— {cite}</p> : null}
    </GlassPanel>
  );
}

export default QuoteBlock;
