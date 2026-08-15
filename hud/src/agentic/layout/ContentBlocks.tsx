/**
 * Blocs de contenu pour scénarios multi-sections (terminal, app, grille…).
 */
import type { CSSProperties, ReactNode } from 'react';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';
import { LAYOUT_SPACING } from './tokens';

const SF = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export function BodyText({ children, mono }: { children: ReactNode; mono?: boolean }) {
  const theme = useSpatialTheme();
  return (
    <p
      style={{
        margin: 0,
        fontFamily: mono ? MONO : SF,
        fontSize: mono ? 11 : 12,
        lineHeight: 1.45,
        color: theme.textMuted,
        whiteSpace: 'pre-wrap',
      }}
    >
      {children}
    </p>
  );
}

export function KpiRow({
  items,
}: {
  items: { label: string; value: string; tone?: string }[];
}) {
  const theme = useSpatialTheme();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: LAYOUT_SPACING.sm }}>
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            flex: '1 1 72px',
            minWidth: 64,
            padding: '8px 10px',
            borderRadius: 12,
            background: `rgba(${it.tone || theme.accent}, 0.12)`,
          }}
        >
          <div style={{ fontFamily: SF, fontSize: 10, color: theme.textMuted }}>{it.label}</div>
          <div
            style={{
              fontFamily: SF,
              fontSize: 18,
              fontWeight: 650,
              color: `rgba(${it.tone || theme.accent}, 1)`,
              letterSpacing: '-0.02em',
            }}
          >
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TerminalPane({ lines }: { lines: string[] }) {
  const theme = useSpatialTheme();
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 10,
        lineHeight: 1.5,
        color: theme.mode === 'light' ? 'rgba(20,30,40,0.85)' : 'rgba(180, 255, 200, 0.85)',
        background: theme.mode === 'light' ? 'rgba(15,20,30,0.06)' : 'rgba(0,0,0,0.35)',
        borderRadius: 10,
        padding: 10,
        maxHeight: 140,
        overflow: 'hidden',
      }}
    >
      {lines.map((l, i) => (
        <div key={`${i}-${l.slice(0, 12)}`}>{l}</div>
      ))}
    </div>
  );
}

export function AppScreen({
  title,
  tiles = 4,
}: {
  title: string;
  tiles?: 4 | 6 | 9;
}) {
  const theme = useSpatialTheme();
  const cols = tiles === 4 ? 2 : tiles === 6 ? 3 : 3;
  const count = tiles;
  return (
    <div>
      <p style={{ margin: '0 0 8px', fontFamily: SF, fontSize: 11, color: theme.textMuted }}>{title}</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: 6,
        }}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            style={{
              aspectRatio: '1.4',
              borderRadius: 10,
              background: `linear-gradient(145deg, rgba(${theme.accent}, ${0.1 + (i % 3) * 0.06}), rgba(${theme.paper}, 0.05))`,
              border: `1px solid rgba(${theme.paper}, 0.1)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: SF,
              fontSize: 10,
              color: theme.textMuted,
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MiniList({ rows }: { rows: string[] }) {
  const theme = useSpatialTheme();
  const item: CSSProperties = {
    fontFamily: SF,
    fontSize: 11,
    color: theme.text,
    padding: '4px 0',
    borderBottom: `1px solid rgba(${theme.paper}, 0.06)`,
  };
  return (
    <div>
      {rows.map((r) => (
        <div key={r} style={item}>
          {r}
        </div>
      ))}
    </div>
  );
}

export function Spark({ values }: { values: number[] }) {
  const theme = useSpatialTheme();
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(12, (v / max) * 100)}%`,
            borderRadius: 3,
            background: `rgba(${theme.accent}, 0.55)`,
          }}
        />
      ))}
    </div>
  );
}
