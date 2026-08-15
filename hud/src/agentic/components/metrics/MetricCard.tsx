/**
 * MetricCard — base de toute la famille Metrics (et des presets System :
 * CPUCard/MemoryCard/DiskCard/NetworkCard). Généralise
 * `agentic/layout/MetricTile.tsx` (zéro appelant aujourd'hui — superseded,
 * pas supprimé, voir le plan) : même contenu (label/valeur/unité/hint/
 * champs), mais ne se positionne plus lui-même (pas de `layoutId`/span de
 * grille — c'est le rôle de `Workspace`/`SectionFrame` désormais). Remplit
 * simplement le rectangle qu'on lui donne.
 */
import { AnimatePresence, motion } from 'motion/react';
import { GlassCard } from '../../../visual/glass';
import { Icon, type IconName } from '../../../visual/Icon';
import { useSpatialTheme } from '../../../spatial/theme/SpatialTheme';
import type { InfoDensity } from '../../layout/tokens';

const SF = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';

export type MetricTone = 'cyan' | 'violet' | 'amber' | 'green';
export interface MetricField {
  label: string;
  value: string;
}
export interface MetricTrend {
  direction: 'up' | 'down' | 'flat';
  label: string;
}

const TONE: Record<MetricTone, string> = {
  cyan: '10, 132, 255',
  violet: '94, 92, 230',
  amber: '255, 159, 10',
  green: '52, 199, 89',
};

const TREND_ICON: Record<MetricTrend['direction'], IconName> = {
  up: 'trend-up',
  down: 'trend-down',
  flat: 'trend-flat',
};

export interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  icon?: IconName;
  tone?: MetricTone;
  density?: InfoDensity;
  fields?: MetricField[];
  trend?: MetricTrend;
}

export function MetricCard({
  label,
  value,
  unit,
  hint,
  icon,
  tone = 'cyan',
  density = 'standard',
  fields = [],
  trend,
}: MetricCardProps) {
  const theme = useSpatialTheme();
  const rgb = TONE[tone];
  const showHint = density !== 'compact' && Boolean(hint);
  const showTrend = density !== 'compact' && Boolean(trend);
  const showFields =
    density === 'detailed' || density === 'focus' ? fields : density === 'standard' ? fields.slice(0, 2) : [];

  return (
    <GlassCard
      material="thin"
      elevation="elevated"
      radius="lg"
      padding="md"
      style={{
        height: '100%',
        boxSizing: 'border-box',
        background: `linear-gradient(145deg, rgba(${rgb}, 0.18), rgba(${theme.paper}, 0.04))`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon ? <Icon name={icon} size={12} color={`rgb(${rgb})`} /> : null}
        <p
          style={{
            margin: 0,
            fontFamily: SF,
            fontSize: 11,
            letterSpacing: '0.04em',
            color: theme.textMuted,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <p
          style={{
            margin: '8px 0 0',
            fontFamily: SF,
            fontSize: density === 'focus' ? 36 : density === 'detailed' ? 30 : 26,
            fontWeight: 650,
            letterSpacing: '-0.03em',
            color: `rgba(${rgb}, 1)`,
            lineHeight: 1.05,
          }}
        >
          {value}
          {unit ? <span style={{ fontSize: 13, opacity: 0.7, marginLeft: 4, fontWeight: 500 }}>{unit}</span> : null}
        </p>
        {showTrend && trend ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontFamily: SF,
              fontSize: 11,
              color:
                trend.direction === 'up' ? theme.text : trend.direction === 'down' ? theme.textMuted : theme.textMuted,
            }}
          >
            <Icon name={TREND_ICON[trend.direction]} size={11} />
            {trend.label}
          </span>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {showHint ? (
          <motion.p
            key="hint"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ margin: '6px 0 0', fontFamily: SF, fontSize: 11, color: theme.textMuted, overflow: 'hidden' }}
          >
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showFields.length > 0 ? (
          <motion.div
            key="fields"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              marginTop: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              borderTop: `1px solid rgba(${theme.paper}, 0.1)`,
              paddingTop: 8,
              overflow: 'hidden',
            }}
          >
            {showFields.map((f) => (
              <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: SF, fontSize: 12 }}>
                <span style={{ color: theme.textMuted }}>{f.label}</span>
                <span style={{ color: theme.text, fontWeight: 500 }}>{f.value}</span>
              </div>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GlassCard>
  );
}

export default MetricCard;
