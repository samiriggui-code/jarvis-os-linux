/**
 * Briques agentiques génériques — vague « catalogue riche ».
 *
 * Pas de design system tiers (ReUI/shadcn) importé en runtime : le pixel reste
 * JARVIS (P3/P6). On s'inspire des patterns AG-UI / CopilotKit / ReUI
 * (table, card, status, avatar) mais les props passent par le catalogue Zod.
 */
import type { CSSProperties } from 'react';
import type { AgenticProps } from '../registry/renderers';

const mono: CSSProperties = { fontFamily: 'Share Tech Mono, monospace' };
const raj: CSSProperties = { fontFamily: 'Rajdhani, sans-serif' };
const orb: CSSProperties = { fontFamily: 'Orbitron, sans-serif' };

const panel: CSSProperties = {
  background: 'rgba(0, 12, 28, 0.55)',
  border: '1px solid rgba(0, 245, 255, 0.18)',
  borderRadius: 12,
  padding: 12,
  height: '100%',
  boxSizing: 'border-box',
};

const TONE: Record<string, string> = {
  cyan: '#00f5ff',
  green: '#22c55e',
  amber: '#f59e0b',
  rose: '#f43f5e',
  violet: '#a855f7',
  slate: '#94a3b8',
};

function tone(t: unknown): string {
  return TONE[String(t || 'cyan')] || TONE.cyan;
}

export function SectionHeader({ props }: AgenticProps) {
  return (
    <div style={{ ...panel, borderStyle: 'dashed' }}>
      <p style={{ ...orb, color: 'rgba(0,245,255,0.85)', fontSize: 11, letterSpacing: '0.1em', margin: 0 }}>
        {String(props.title || 'SECTION')}
      </p>
      {props.subtitle ? (
        <p style={{ ...mono, color: 'rgba(200,220,255,0.5)', fontSize: 10, margin: '6px 0 0' }}>
          {String(props.subtitle)}
        </p>
      ) : null}
    </div>
  );
}

export function StatCard({ props }: AgenticProps) {
  const c = tone(props.tone);
  return (
    <div style={panel}>
      <p style={{ ...mono, color: 'rgba(255,255,255,0.45)', fontSize: 9, margin: 0 }}>
        {String(props.label || 'STAT')}
      </p>
      <p style={{ ...orb, color: c, fontSize: 22, margin: '8px 0 0', textShadow: `0 0 10px ${c}66` }}>
        {String(props.value ?? '—')}
        {props.unit ? (
          <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>{String(props.unit)}</span>
        ) : null}
      </p>
      {props.hint ? (
        <p style={{ ...mono, color: 'rgba(180,200,220,0.45)', fontSize: 9, marginTop: 8 }}>
          {String(props.hint)}
        </p>
      ) : null}
    </div>
  );
}

export function InfoCard({ props }: AgenticProps) {
  return (
    <div style={panel}>
      <p style={{ ...raj, color: 'rgba(255,255,255,0.92)', fontSize: 15, margin: 0 }}>
        {String(props.title || 'Info')}
      </p>
      <p style={{ ...raj, color: 'rgba(210,225,245,0.8)', fontSize: 13, lineHeight: 1.45, margin: '8px 0 0' }}>
        {String(props.body || '')}
      </p>
    </div>
  );
}

export function StatusBadge({ props }: AgenticProps) {
  const st = String(props.status || 'unknown');
  const map: Record<string, string> = {
    ok: TONE.green,
    up: TONE.green,
    ready: TONE.green,
    warn: TONE.amber,
    degraded: TONE.amber,
    down: TONE.rose,
    error: TONE.rose,
    unknown: TONE.slate,
  };
  const c = map[st] || TONE.slate;
  return (
    <span
      style={{
        ...mono,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10,
        padding: '4px 10px',
        borderRadius: 999,
        border: `1px solid ${c}55`,
        color: c,
        background: `${c}14`,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}` }} />
      {String(props.label || st)}
    </span>
  );
}

export function AvatarChip({ props }: AgenticProps) {
  const name = String(props.name || '?');
  const initials = String(props.initials || name.slice(0, 2)).toUpperCase();
  const c = tone(props.tone);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, ...panel, padding: 10 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: `${c}22`,
          border: `1px solid ${c}55`,
          display: 'grid',
          placeItems: 'center',
          ...orb,
          fontSize: 11,
          color: c,
        }}
      >
        {initials}
      </div>
      <div>
        <p style={{ ...raj, margin: 0, fontSize: 14 }}>{name}</p>
        {props.role ? (
          <p style={{ ...mono, margin: '2px 0 0', fontSize: 9, color: 'rgba(180,200,220,0.5)' }}>
            {String(props.role)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function LinkList({ props, emit }: AgenticProps) {
  const items = Array.isArray(props.items) ? (props.items as unknown[]).map(String) : [];
  return (
    <div style={panel}>
        <p style={{ ...raj, margin: '0 0 8px', fontSize: 14 }}>{String(props.title || 'Liens')}</p>
      <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it, i) => {
          const isUrl = /^https?:\/\//i.test(it);
          return (
            <li key={`${i}-${it.slice(0, 20)}`} style={{ ...mono, fontSize: 11, color: 'rgba(200,220,255,0.8)' }}>
              {isUrl ? (
                <a
                  href={it}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#00f5ff' }}
                  onClick={() => emit('link.open', { url: it })}
                >
                  {it}
                </a>
              ) : (
                it
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function KeyValueList({ props }: AgenticProps) {
  const rows = Array.isArray(props.rows) ? (props.rows as unknown[]) : [];
  return (
    <div style={panel}>
      <p style={{ ...raj, margin: '0 0 8px', fontSize: 14 }}>{String(props.title || 'Détails')}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', ...mono, fontSize: 10 }}>
        <tbody>
          {rows.map((row, i) => {
            const r = row as { key?: string; value?: string } | string[];
            const k = Array.isArray(r) ? String(r[0] ?? '') : String(r.key ?? '');
            const v = Array.isArray(r) ? String(r[1] ?? '') : String(r.value ?? '');
            return (
              <tr key={i}>
                <td style={{ padding: '4px 0', color: 'rgba(180,200,220,0.5)', width: '40%' }}>{k}</td>
                <td style={{ padding: '4px 0', color: 'rgba(230,240,255,0.9)' }}>{v}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DataTable({ props }: AgenticProps) {
  const columns = Array.isArray(props.columns)
    ? (props.columns as unknown[]).map(String)
    : [];
  const rows = Array.isArray(props.rows) ? (props.rows as unknown[]) : [];
  return (
    <div style={{ ...panel, overflow: 'auto' }}>
      <p style={{ ...raj, margin: '0 0 8px', fontSize: 14 }}>{String(props.title || 'Table')}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', ...mono, fontSize: 10 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                style={{
                  textAlign: 'left',
                  padding: '6px 4px',
                  color: 'rgba(0,245,255,0.65)',
                  borderBottom: '1px solid rgba(0,245,255,0.2)',
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const cells = Array.isArray(row)
              ? (row as unknown[]).map(String)
              : columns.map((c) => String((row as Record<string, unknown>)?.[c] ?? ''));
            return (
              <tr key={i}>
                {cells.map((cell, j) => (
                  <td
                    key={j}
                    style={{
                      padding: '6px 4px',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      color: 'rgba(220,235,255,0.85)',
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Mini sparkline SVG — pas de Recharts ici (léger, props-driven). */
export function MetricChart({ props }: AgenticProps) {
  const series = Array.isArray(props.series)
    ? (props.series as unknown[]).map((n) => Number(n) || 0)
    : [10, 20, 15, 30, 25, 40];
  const c = tone(props.tone);
  const w = 280;
  const h = 72;
  const max = Math.max(...series, 1);
  const pts = series
    .map((v, i) => {
      const x = (i / Math.max(series.length - 1, 1)) * (w - 8) + 4;
      const y = h - 6 - (v / max) * (h - 14);
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <div style={panel}>
      <p style={{ ...mono, margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>
        {String(props.label || 'MÉTRIQUE')}
      </p>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ marginTop: 8, display: 'block' }}>
        <polyline fill="none" stroke={c} strokeWidth="2" points={pts} />
      </svg>
    </div>
  );
}

export function DialogCard({ props, emit, state }: AgenticProps) {
  return (
    <div
      style={{
        ...panel,
        borderColor: 'rgba(244,63,94,0.35)',
        background: 'rgba(20, 6, 12, 0.75)',
      }}
    >
      <p style={{ ...orb, margin: 0, fontSize: 11, color: '#f43f5e', letterSpacing: '0.08em' }}>
        DIALOGUE
      </p>
      <p style={{ ...raj, margin: '8px 0 0', fontSize: 16 }}>{String(props.title || 'Confirmer')}</p>
      <p style={{ ...raj, margin: '6px 0 12px', fontSize: 13, color: 'rgba(220,230,245,0.8)' }}>
        {String(props.body || '')}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={state === 'resolved'}
          onClick={() => emit('dialog.confirm', { id: props.dialogId })}
          style={{
            ...mono,
            fontSize: 10,
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid rgba(34,197,94,0.5)',
            background: 'rgba(34,197,94,0.12)',
            color: '#22c55e',
            cursor: 'pointer',
          }}
        >
          {String(props.confirmLabel || 'Confirmer')}
        </button>
        <button
          type="button"
          disabled={state === 'resolved'}
          onClick={() => emit('dialog.cancel', { id: props.dialogId })}
          style={{
            ...mono,
            fontSize: 10,
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'transparent',
            color: 'rgba(220,230,245,0.7)',
            cursor: 'pointer',
          }}
        >
          {String(props.cancelLabel || 'Annuler')}
        </button>
      </div>
    </div>
  );
}

export function ToastStack({ props }: AgenticProps) {
  const items = Array.isArray(props.items) ? (props.items as unknown[]) : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, i) => {
        const t = typeof it === 'string' ? { text: it, tone: 'cyan' } : (it as { text?: string; tone?: string });
        const c = tone(t.tone);
        return (
          <div
            key={i}
            style={{
              ...mono,
              fontSize: 10,
              padding: '8px 10px',
              borderRadius: 10,
              border: `1px solid ${c}40`,
              background: 'rgba(0,8,20,0.85)',
              color: 'rgba(230,240,255,0.9)',
              boxShadow: `0 0 12px ${c}22`,
            }}
          >
            {String(t.text || '')}
          </div>
        );
      })}
      {items.length === 0 ? (
        <p style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Aucune notification</p>
      ) : null}
    </div>
  );
}

/**
 * ServiceHub — la notion de hub : une carte domaine, pas 40 widgets.
 * Statut NUC / VPS / services en une brique composable.
 */
export function ServiceHub({ props }: AgenticProps) {
  const services = Array.isArray(props.services) ? (props.services as unknown[]) : [];
  return (
    <div style={panel}>
      <p style={{ ...orb, margin: 0, fontSize: 11, color: 'rgba(0,245,255,0.8)', letterSpacing: '0.1em' }}>
        {String(props.title || 'HUB SERVICES')}
      </p>
      <p style={{ ...mono, margin: '4px 0 12px', fontSize: 9, color: 'rgba(180,200,220,0.45)' }}>
        {String(props.subtitle || 'État des briques — une surface, un domaine')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {services.map((s, i) => {
          const row = s as { id?: string; name?: string; status?: string; host?: string };
          const st = String(row.status || 'unknown');
          const map: Record<string, string> = {
            ok: TONE.green,
            up: TONE.green,
            ready: TONE.green,
            warn: TONE.amber,
            degraded: TONE.amber,
            down: TONE.rose,
            error: TONE.rose,
          };
          const c = map[st] || TONE.slate;
          return (
            <div
              key={row.id || i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: 8,
                background: 'rgba(0,8,20,0.5)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div>
                <p style={{ ...raj, margin: 0, fontSize: 13 }}>{String(row.name || row.id || 'service')}</p>
                {row.host ? (
                  <p style={{ ...mono, margin: '2px 0 0', fontSize: 9, color: 'rgba(180,200,220,0.45)' }}>
                    {String(row.host)}
                  </p>
                ) : null}
              </div>
              <span style={{ ...mono, fontSize: 10, color: c }}>{st.toUpperCase()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
