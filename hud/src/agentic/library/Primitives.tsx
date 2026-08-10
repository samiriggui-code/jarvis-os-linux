/**
 * Briques agentiques — langage Vision / spatial glass.
 */
import type { AgenticProps } from '../registry/renderers';
import { VisionButton, VisionPane, useVisionText } from './vision';

const TONE: Record<string, string> = {
  cyan: '10, 132, 255',
  green: '52, 199, 89',
  amber: '255, 159, 10',
  rose: '255, 59, 48',
  violet: '94, 92, 230',
  slate: '142, 142, 147',
};

function toneRgb(t: unknown): string {
  return TONE[String(t || 'cyan')] || TONE.cyan;
}

function formatStatusLabel(status: string): string {
  const s = status.trim();
  if (!s) return 'Unknown';
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function SectionHeader({ props }: AgenticProps) {
  const { caption, body } = useVisionText();
  return (
    <VisionPane material="ultraThin">
      <p style={caption}>{String(props.title || 'Section')}</p>
      {props.subtitle ? (
        <p style={{ ...body, marginTop: 6 }}>{String(props.subtitle)}</p>
      ) : null}
    </VisionPane>
  );
}

export function StatCard({ props }: AgenticProps) {
  const { caption, theme } = useVisionText();
  const rgb = toneRgb(props.tone);
  return (
    <VisionPane material="thin">
      <p style={caption}>{String(props.label || 'Stat')}</p>
      <p
        style={{
          margin: '10px 0 0',
          fontSize: 28,
          fontWeight: 650,
          letterSpacing: '-0.03em',
          color: `rgba(${rgb}, 1)`,
        }}
      >
        {String(props.value ?? '—')}
        {props.unit ? (
          <span style={{ fontSize: 13, opacity: 0.65, marginLeft: 4, fontWeight: 500 }}>
            {String(props.unit)}
          </span>
        ) : null}
      </p>
      {props.hint ? (
        <p style={{ marginTop: 8, fontSize: 12, color: theme.textMuted }}>{String(props.hint)}</p>
      ) : null}
    </VisionPane>
  );
}

export function InfoCard({ props }: AgenticProps) {
  const { title, body } = useVisionText();
  return (
    <VisionPane material="regular">
      <p style={title}>{String(props.title || 'Info')}</p>
      <p style={{ ...body, marginTop: 8 }}>{String(props.body || '')}</p>
    </VisionPane>
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
  const rgb = map[st] || TONE.slate;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 12,
        fontWeight: 560,
        padding: '6px 12px',
        borderRadius: 999,
        border: `1px solid rgba(${rgb}, 0.35)`,
        color: `rgba(${rgb}, 1)`,
        background: `rgba(${rgb}, 0.12)`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: `rgba(${rgb}, 1)`,
        }}
      />
      {String(props.label || st)}
    </span>
  );
}

export function AvatarChip({ props }: AgenticProps) {
  const { title, body, theme } = useVisionText();
  const name = String(props.name || '?');
  const initials = String(props.initials || name.slice(0, 2)).toUpperCase();
  const rgb = toneRgb(props.tone);
  return (
    <VisionPane material="thin" padding="sm">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: `rgba(${rgb}, 0.18)`,
            border: `1px solid rgba(${rgb}, 0.35)`,
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            fontWeight: 650,
            color: `rgba(${rgb}, 1)`,
          }}
        >
          {initials}
        </div>
        <div>
          <p style={{ ...title, fontSize: 14 }}>{name}</p>
          {props.role ? (
            <p style={{ ...body, marginTop: 2, fontSize: 12 }}>{String(props.role)}</p>
          ) : null}
        </div>
      </div>
    </VisionPane>
  );
}

export function LinkList({ props, emit }: AgenticProps) {
  const { title, theme } = useVisionText();
  const items = Array.isArray(props.items) ? (props.items as unknown[]).map(String) : [];
  return (
    <VisionPane>
      <p style={{ ...title, marginBottom: 10 }}>{String(props.title || 'Liens')}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it, i) => {
          const isUrl = /^https?:\/\//i.test(it);
          return (
            <li key={`${i}-${it.slice(0, 20)}`} style={{ fontSize: 13 }}>
              {isUrl ? (
                <a
                  href={it}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: `rgba(${theme.accent}, 1)`, textDecoration: 'none' }}
                  onClick={() => emit('link.open', { url: it })}
                >
                  {it}
                </a>
              ) : (
                <span style={{ color: theme.text }}>{it}</span>
              )}
            </li>
          );
        })}
      </ul>
    </VisionPane>
  );
}

export function KeyValueList({ props }: AgenticProps) {
  const { title, theme } = useVisionText();
  const rows = Array.isArray(props.rows) ? (props.rows as unknown[]) : [];
  return (
    <VisionPane>
      <p style={{ ...title, marginBottom: 10 }}>{String(props.title || 'Détails')}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <tbody>
          {rows.map((row, i) => {
            const r = row as { key?: string; value?: string } | string[];
            const k = Array.isArray(r) ? String(r[0] ?? '') : String(r.key ?? '');
            const v = Array.isArray(r) ? String(r[1] ?? '') : String(r.value ?? '');
            return (
              <tr key={i}>
                <td style={{ padding: '6px 0', color: theme.textMuted, width: '40%' }}>{k}</td>
                <td style={{ padding: '6px 0', color: theme.text }}>{v}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </VisionPane>
  );
}

export function DataTable({ props }: AgenticProps) {
  const { title, theme } = useVisionText();
  const columns = Array.isArray(props.columns) ? (props.columns as unknown[]).map(String) : [];
  const rows = Array.isArray(props.rows) ? (props.rows as unknown[]) : [];
  return (
    <VisionPane style={{ overflow: 'auto' }}>
      <p style={{ ...title, marginBottom: 10 }}>{String(props.title || 'Table')}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                style={{
                  textAlign: 'left',
                  padding: '8px 6px',
                  color: theme.textMuted,
                  fontWeight: 560,
                  borderBottom: `1px solid rgba(${theme.mode === 'light' ? '0,0,0' : '255,255,255'}, 0.12)`,
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
                      padding: '8px 6px',
                      borderBottom: `1px solid rgba(${theme.mode === 'light' ? '0,0,0' : '255,255,255'}, 0.06)`,
                      color: theme.text,
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
    </VisionPane>
  );
}

export function MetricChart({ props }: AgenticProps) {
  const { caption, theme } = useVisionText();
  const series = Array.isArray(props.series)
    ? (props.series as unknown[]).map((n) => Number(n) || 0)
    : [10, 20, 15, 30, 25, 40];
  const rgb = toneRgb(props.tone);
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
    <VisionPane>
      <p style={caption}>{String(props.label || 'Métrique')}</p>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ marginTop: 10, display: 'block' }}>
        <polyline
          fill="none"
          stroke={`rgba(${rgb}, 1)`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pts}
        />
      </svg>
      <p style={{ margin: '6px 0 0', fontSize: 11, color: theme.textMuted }}>série · {series.length} pts</p>
    </VisionPane>
  );
}

export function DialogCard({ props, emit, state }: AgenticProps) {
  const { title, body } = useVisionText();
  return (
    <VisionPane material="regular">
      <p style={{ ...title, fontSize: 11, letterSpacing: '0.02em', opacity: 0.7 }}>
        Dialogue
      </p>
      <p style={{ ...title, marginTop: 8 }}>{String(props.title || 'Confirmer')}</p>
      <p style={{ ...body, margin: '8px 0 14px' }}>{String(props.body || '')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <VisionButton
          tone="accent"
          disabled={state === 'resolved'}
          onClick={() => emit('dialog.confirm', { id: props.dialogId })}
        >
          {String(props.confirmLabel || 'Confirmer')}
        </VisionButton>
        <VisionButton
          disabled={state === 'resolved'}
          onClick={() => emit('dialog.cancel', { id: props.dialogId })}
        >
          {String(props.cancelLabel || 'Annuler')}
        </VisionButton>
      </div>
    </VisionPane>
  );
}

export function ToastStack({ props }: AgenticProps) {
  const { theme } = useVisionText();
  const items = Array.isArray(props.items) ? (props.items as unknown[]) : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, i) => {
        const t = typeof it === 'string' ? { text: it, tone: 'cyan' } : (it as { text?: string; tone?: string });
        const rgb = toneRgb(t.tone);
        return (
          <VisionPane key={i} material="ultraThin" padding="sm">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: `rgba(${rgb}, 1)` }} />
              <span style={{ fontSize: 13, color: theme.text }}>{String(t.text || '')}</span>
            </div>
          </VisionPane>
        );
      })}
      {items.length === 0 ? (
        <p style={{ fontSize: 12, color: theme.textMuted }}>Aucune notification</p>
      ) : null}
    </div>
  );
}

export function ServiceHub({ props }: AgenticProps) {
  const { title, body, theme } = useVisionText();
  const services = Array.isArray(props.services) ? (props.services as unknown[]) : [];
  return (
    <VisionPane material="regular">
      <p style={title}>{String(props.title || 'Hub services')}</p>
      <p style={{ ...body, margin: '4px 0 12px' }}>
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
          const rgb = map[st] || TONE.slate;
          return (
            <div
              key={row.id || i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: 14,
                background: theme.mode === 'light' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.06)',
                border: `1px solid rgba(${theme.mode === 'light' ? '0,0,0' : '255,255,255'}, 0.08)`,
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 560, color: theme.text }}>
                  {String(row.name || row.id || 'service')}
                </p>
                {row.host ? (
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: theme.textMuted }}>{String(row.host)}</p>
                ) : null}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: `rgba(${rgb}, 1)` }}>
                {formatStatusLabel(st)}
              </span>
            </div>
          );
        })}
      </div>
    </VisionPane>
  );
}
