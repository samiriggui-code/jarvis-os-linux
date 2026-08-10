/**
 * ResultPanel — Vision glass.
 */
import type { AgenticProps } from '../registry/renderers';
import { VisionPane, useVisionText } from './vision';

export function ResultPanel({ props }: AgenticProps) {
  const title = String(props.title || 'Résultat');
  const bodyText = String(props.body || '').trim();
  const source = props.source ? String(props.source) : '';
  const items = Array.isArray(props.items)
    ? (props.items as unknown[]).map(String).filter(Boolean)
    : [];
  const { title: titleStyle, body, caption, theme } = useVisionText();

  return (
    <VisionPane material="thin" style={{ overflow: 'auto' }}>
      <p style={titleStyle}>{title}</p>
      {source ? <p style={{ ...caption, marginTop: 4 }}>{source}</p> : null}

      {bodyText ? (
        <p style={{ ...body, marginTop: 12, color: theme.text, whiteSpace: 'pre-wrap' }}>{bodyText}</p>
      ) : null}

      {items.length > 0 ? (
        <ul style={{ margin: '12px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it, i) => {
            const isUrl = /^https?:\/\//i.test(it);
            return (
              <li key={`${i}-${it.slice(0, 24)}`} style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.4 }}>
                {isUrl ? (
                  <a
                    href={it}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: `rgba(${theme.accent}, 1)` }}
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
      ) : null}

      {!bodyText && items.length === 0 ? (
        <p style={{ ...body, marginTop: 12 }}>Aucun contenu — en attente du Core.</p>
      ) : null}
    </VisionPane>
  );
}
