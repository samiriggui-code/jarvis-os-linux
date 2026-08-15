import { GlassPanel } from '../../../visual/glass';
import { tokens } from '../../../ui/tokens';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const theme = useSpatialTheme();
  return (
    <GlassPanel
      material="thin"
      elevation="surface"
      radius="lg"
      padding="md"
      style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      {language ? (
        <span style={{ fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
          {language}
        </span>
      ) : null}
      <pre style={{ margin: 0, flex: 1, minHeight: 0, overflow: 'auto', fontFamily: tokens.font.mono, fontSize: 12, color: theme.text, whiteSpace: 'pre' }}>
        {code}
      </pre>
    </GlassPanel>
  );
}

export default CodeBlock;
