/** Promotion enrichie de l'idiome `layout/ContentBlocks.tsx::TerminalPane` — pas un vrai shell. */
import { motion } from 'motion/react';
import { GlassPanel } from '../../../visual/glass';
import { tokens } from '../../../ui/tokens';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export interface TerminalProps {
  title?: string;
  lines: string[];
  cursor?: boolean;
}

export function Terminal({ title, lines, cursor = true }: TerminalProps) {
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
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          fontFamily: tokens.font.mono,
          fontSize: 12,
          color: theme.text,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        {lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
        {cursor ? (
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity }}
            style={{ display: 'inline-block', width: 7, height: 14, background: theme.text }}
          />
        ) : null}
      </div>
    </GlassPanel>
  );
}

export default Terminal;
