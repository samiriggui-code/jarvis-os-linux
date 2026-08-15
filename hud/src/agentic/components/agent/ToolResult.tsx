import { GlassCard } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';
import { StatusIndicator } from '../metrics/StatusIndicator';
import { tokens } from '../../../ui/tokens';

export interface ToolResultProps {
  tool: string;
  status: string;
  output?: string;
}

/** Distinct de SummaryCard : ceci est le résultat d'UN outil, pas un résumé de réponse. */
export function ToolResult({ tool, status, output }: ToolResultProps) {
  const theme = useSpatialTheme();
  return (
    <GlassCard
      material="thin"
      elevation="elevated"
      radius="lg"
      padding="md"
      style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, fontFamily: tokens.font.mono }}>{tool}</span>
        <StatusIndicator status={status} />
      </div>
      {output ? (
        <pre style={{ margin: 0, fontFamily: tokens.font.mono, fontSize: 11, color: theme.textMuted, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'auto' }}>
          {output}
        </pre>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: theme.textMuted }}>En attente de résultat — aucune donnée inventée.</p>
      )}
    </GlassCard>
  );
}

export default ToolResult;
