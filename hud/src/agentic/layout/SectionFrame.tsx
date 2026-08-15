/**
 * SectionFrame — header titre + pastilles couleur (fermer / réduire / agrandir).
 * Style « pots » macOS : rouge · jaune · vert — PAS d’icônes Lucide, PAS de ⋯.
 */
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { GlassSurface } from '../../visual/glass';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';
import { LAYOUT_SPACING, type SectionChromeState } from './tokens';
import { hudSpatialTransition } from './motion';

const SF = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';

const DOTS = {
  close: '#FF5F57',
  collapse: '#FEBC2E',
  expand: '#28C840',
} as const;

export type SectionFrameProps = {
  id: string;
  title: string;
  subtitle?: string;
  state: SectionChromeState;
  onCollapse?: () => void;
  onExpand?: () => void;
  onClose?: () => void;
  children?: ReactNode;
  gridColumn?: string;
  entering?: boolean;
  tone?: string;
};

function TrafficDot({
  color,
  title,
  onClick,
}: {
  color: string;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        border: 'none',
        padding: 0,
        margin: 0,
        background: color,
        boxShadow: `inset 0 -1px 1px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.12)`,
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
      }}
    />
  );
}

export function SectionFrame({
  id,
  title,
  subtitle,
  state,
  onCollapse,
  onExpand,
  onClose,
  children,
  gridColumn = '1 / -1',
  entering = false,
  tone,
}: SectionFrameProps) {
  const theme = useSpatialTheme();
  const collapsed = state === 'collapsed';
  const expanded = state === 'expanded';
  const rgb = tone || theme.accent;

  return (
    <motion.div
      layout
      layoutId={`section-${id}`}
      data-section={id}
      data-section-state={state}
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: entering ? 0.6 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={hudSpatialTransition}
      style={{
        gridColumn,
        minWidth: 0,
        minHeight: 0,
        height: 'auto',
        maxHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignSelf: expanded ? 'stretch' : 'start',
        transformOrigin: 'top center',
      }}
    >
      <motion.div layout transition={hudSpatialTransition}>
        <GlassSurface
          material={expanded ? 'regular' : 'thin'}
          elevation="elevated"
          radius="lg"
          padding={0}
          style={{
            height: 'auto',
            overflow: 'hidden',
            boxSizing: 'border-box',
            border: `1px solid rgba(${rgb}, ${expanded ? 0.28 : 0.12})`,
          }}
        >
          <div
            style={{
              padding: `8px ${LAYOUT_SPACING.md}px`,
              borderBottom: collapsed ? 'none' : `1px solid rgba(${theme.paper}, 0.07)`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {/* Pots couleur — fermer · réduire · agrandir */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
              <TrafficDot color={DOTS.close} title="Fermer" onClick={onClose} />
              <TrafficDot
                color={DOTS.collapse}
                title={collapsed ? 'Déplier' : 'Réduire'}
                onClick={onCollapse}
              />
              <TrafficDot
                color={DOTS.expand}
                title={expanded ? 'Taille normale' : 'Agrandir'}
                onClick={onExpand}
              />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontFamily: SF,
                  fontSize: collapsed ? 12 : 13,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: theme.text,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {title}
              </p>
              {subtitle && !collapsed ? (
                <p
                  style={{
                    margin: '2px 0 0',
                    fontFamily: SF,
                    fontSize: 10,
                    color: theme.textMuted,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {!collapsed ? (
              <motion.div
                key="body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: entering ? 0.75 : 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={hudSpatialTransition}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ padding: LAYOUT_SPACING.md, minHeight: 0 }}>{children}</div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </GlassSurface>
      </motion.div>
    </motion.div>
  );
}
