/** Richer promotion of `layout/ContentBlocks.tsx::TerminalPane`'s idiom — décorrélé de tout cadre "shell". */
import { GlassPanel } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';
import { tokens } from '../../../ui/tokens';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export interface LogLine {
  level?: LogLevel;
  text: string;
}

const LEVEL_RGB: Record<LogLevel, string> = {
  info: '10, 132, 255',
  warn: '255, 159, 10',
  error: '255, 59, 48',
  debug: '150, 150, 158',
};

export interface LogViewerProps {
  title?: string;
  lines: LogLine[];
}

export function LogViewer({ title, lines }: LogViewerProps) {
  const theme = useSpatialTheme();
  return (
    <GlassPanel
      material="thin"
      elevation="surface"
      radius="lg"
      padding="md"
      style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}
    >
      {title ? (
        <p style={{ margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: theme.textMuted }}>
          {title}
        </p>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, fontFamily: tokens.font.mono, fontSize: 11 }}>
            <span style={{ color: `rgb(${LEVEL_RGB[l.level ?? 'info']})`, flexShrink: 0 }}>●</span>
            <span style={{ color: theme.text, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{l.text}</span>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

export default LogViewer;
