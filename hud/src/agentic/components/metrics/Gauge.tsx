import { GlassCard } from '../../../visual/glass';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';

export type GaugeTone = 'cyan' | 'violet' | 'amber' | 'green' | 'danger';
const TONE_RGB: Record<GaugeTone, string> = {
  cyan: '10, 132, 255',
  violet: '94, 92, 230',
  amber: '255, 159, 10',
  green: '52, 199, 89',
  danger: '255, 59, 48',
};

export interface GaugeProps {
  label?: string;
  value: number;
  tone?: GaugeTone;
}

const R = 40;
const CIRC = 2 * Math.PI * R;

/** Jauge circulaire — inspirée de la jauge interne (non exportée) de app/components/SystemMonitor.tsx, pas copiée. */
export function Gauge({ label, value, tone = 'cyan' }: GaugeProps) {
  const theme = useSpatialTheme();
  const rgb = TONE_RGB[tone];
  const pct = Math.max(0, Math.min(100, value));
  const offset = CIRC * (1 - pct / 100);

  return (
    <GlassCard
      material="thin"
      elevation="elevated"
      radius="lg"
      padding="md"
      style={{
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={R} fill="none" stroke={`rgba(${theme.paper}, 0.12)`} strokeWidth={8} />
        <circle
          cx={50}
          cy={50}
          r={R}
          fill="none"
          stroke={`rgb(${rgb})`}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x={50} y={55} textAnchor="middle" fontSize={20} fontWeight={650} fill={theme.text}>
          {Math.round(pct)}%
        </text>
      </svg>
      {label ? (
        <span style={{ fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
      ) : null}
    </GlassCard>
  );
}

export default Gauge;
