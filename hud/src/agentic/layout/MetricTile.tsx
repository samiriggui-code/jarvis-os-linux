/**
 * MetricTile — identité stable (layoutId) + géométrie interpolée.
 * Contenu secondaire en fade progressif (pas de coupe brutale).
 */
import { AnimatePresence, motion } from 'motion/react';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';
import { GlassSurface } from '../../visual/glass';
import { LAYOUT_SPACING, type InfoDensity } from './tokens';
import { hudSpatialTransition } from './motion';

const SF = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';

export type MetricField = { label: string; value: string };

export type MetricTileProps = {
  /** Identité visuelle stable à travers les reflows (layoutId). */
  layoutId: string;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: 'cyan' | 'violet' | 'amber' | 'green';
  density: InfoDensity;
  fields?: MetricField[];
  span?: number;
  onFocus?: () => void;
};

const TONE: Record<string, string> = {
  cyan: '10, 132, 255',
  violet: '94, 92, 230',
  amber: '255, 159, 10',
  green: '52, 199, 89',
};

export function MetricTile({
  layoutId,
  label,
  value,
  unit,
  hint,
  tone = 'cyan',
  density,
  fields = [],
  span = 4,
  onFocus,
}: MetricTileProps) {
  const theme = useSpatialTheme();
  const rgb = TONE[tone] || TONE.cyan;
  const showHint = density !== 'compact' && Boolean(hint);
  const showFields =
    density === 'detailed' || density === 'focus'
      ? fields
      : density === 'standard'
        ? fields.slice(0, 2)
        : [];

  return (
    <motion.div
      layout
      layoutId={layoutId}
      onClick={onFocus}
      transition={hudSpatialTransition}
      style={{
        gridColumn: `span ${Math.max(2, span)}`,
        minWidth: 0,
        height: 'auto',
        cursor: onFocus ? 'pointer' : 'default',
      }}
    >
      <motion.div layout transition={hudSpatialTransition} style={{ height: '100%' }}>
        <GlassSurface
          material="thin"
          elevation="elevated"
          radius="lg"
          padding="md"
          style={{
            height: 'auto',
            boxSizing: 'border-box',
            background: `linear-gradient(145deg, rgba(${rgb}, 0.18), rgba(${theme.paper}, 0.04))`,
          }}
        >
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
          <motion.p
            layout
            style={{
              margin: `${LAYOUT_SPACING.sm}px 0 0`,
              fontFamily: SF,
              fontSize: density === 'focus' ? 36 : density === 'detailed' ? 30 : 26,
              fontWeight: 650,
              letterSpacing: '-0.03em',
              color: `rgba(${rgb}, 1)`,
              lineHeight: 1.05,
            }}
          >
            {value}
            {unit ? (
              <span style={{ fontSize: 13, opacity: 0.7, marginLeft: 4, fontWeight: 500 }}>{unit}</span>
            ) : null}
          </motion.p>

          <AnimatePresence initial={false}>
            {showHint ? (
              <motion.p
                key="hint"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={hudSpatialTransition}
                style={{
                  margin: '6px 0 0',
                  fontFamily: SF,
                  fontSize: 11,
                  color: theme.textMuted,
                  overflow: 'hidden',
                }}
              >
                {hint}
              </motion.p>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {showFields.length > 0 ? (
              <motion.div
                key="fields"
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={hudSpatialTransition}
                style={{
                  marginTop: LAYOUT_SPACING.md,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  borderTop: `1px solid rgba(${theme.paper}, 0.1)`,
                  paddingTop: LAYOUT_SPACING.sm,
                  overflow: 'hidden',
                }}
              >
                {showFields.map((f, i) => (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...HUD_FADE_DELAY(i), layout: hudSpatialTransition.layout }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontFamily: SF,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: theme.textMuted }}>{f.label}</span>
                    <span style={{ color: theme.text, fontWeight: 500 }}>{f.value}</span>
                  </motion.div>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </GlassSurface>
      </motion.div>
    </motion.div>
  );
}

function HUD_FADE_DELAY(i: number) {
  return { duration: 0.32, delay: 0.05 + i * 0.06, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] };
}
