/**
 * ChartCard — base UNIQUE pour Line/Area/Bar/Donut (recharts, déjà une
 * dépendance du projet, déjà utilisé dans app/components/SystemMonitor.tsx).
 * Un seul renderer, switché par `type` ; LineChart/AreaChart/BarChart/
 * DonutChart ne sont que des presets fins par-dessus — voir la règle de
 * consolidation du plan (70 composants ≠ 70 design systems).
 */
import { Area, AreaChart, Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { GlassCard } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';
import type { SeriesPoint } from '../shared/dataShapes';

export type ChartType = 'line' | 'area' | 'bar' | 'donut';
export type ChartTone = 'cyan' | 'violet' | 'amber' | 'green';

const TONE_RGB: Record<ChartTone, string> = {
  cyan: '10, 132, 255',
  violet: '94, 92, 230',
  amber: '255, 159, 10',
  green: '52, 199, 89',
};

// Mêmes valeurs que `CAPABILITIES_BY_KIND` (Core) — un seul endroit où ces
// ratios sont choisis, dupliqué ici uniquement parce que ce fichier ne peut
// pas dépendre du Core. Si l'un change, l'autre doit suivre.
const DEFAULT_ASPECT: Record<ChartType, number> = { line: 1.8, area: 1.8, bar: 1.6, donut: 1 };

export interface ChartCardProps {
  type: ChartType;
  label?: string;
  data: SeriesPoint[];
  tone?: ChartTone;
  aspectRatio?: number;
}

export function ChartCard({ type, label, data, tone = 'cyan', aspectRatio }: ChartCardProps) {
  const theme = useSpatialTheme();
  const rgb = TONE_RGB[tone];
  const color = `rgb(${rgb})`;
  const gradId = `chartcard-grad-${label ?? 'x'}`;

  return (
    <GlassCard
      material="thin"
      elevation="elevated"
      radius="lg"
      padding="md"
      style={{ boxSizing: 'border-box' }}
    >
      {label ? (
        <p style={{ margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: theme.textMuted }}>
          {label}
        </p>
      ) : null}
      {/*
        `SectionFrame` garde son corps en `height:auto` (indispensable à
        l'animation collapse/expand) — donc AUCUN ancêtre ne donne jamais de
        hauteur définie ici, `flex:1` ne peut résoudre à rien (observé :
        `ResponsiveContainer` mesuré 0×0). `aspectRatio` contourne le
        problème plutôt que d'essayer de le forcer : la largeur, elle, EST
        définie (colonne de grille) — la hauteur se calcule depuis elle.
      */}
      <div style={{ width: '100%', aspectRatio: aspectRatio ?? DEFAULT_ASPECT[type] }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === 'donut' ? (
            <PieChart>
              <Pie data={data} dataKey="y" nameKey="x" innerRadius="60%" outerRadius="90%" stroke="none" isAnimationActive={false}>
                {data.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? color : `rgba(${theme.paper}, ${0.08 + i * 0.05})`} />
                ))}
              </Pie>
            </PieChart>
          ) : type === 'bar' ? (
            <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <Bar dataKey="y" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          ) : type === 'area' ? (
            <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.32} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="y" stroke={color} strokeWidth={1.75} fill={`url(#${gradId})`} dot={false} isAnimationActive={false} />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <Line type="monotone" dataKey="y" stroke={color} strokeWidth={1.75} dot={false} isAnimationActive={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}

export default ChartCard;
