/**
 * ResultPanel — brique agentique pour un résultat textuel (recherche web,
 * liste d'outils, réponse structurée). Sans elle le catalogue ne contenait
 * que des panneaux produit (SystemMonitor, Camera…) : une question « nouvelles
 * Macron » ne pouvait rien afficher → fenêtre vide.
 */
import type { AgenticProps } from '../registry/renderers';

const mono: React.CSSProperties = {
  fontFamily: 'Share Tech Mono, monospace',
};
const raj: React.CSSProperties = {
  fontFamily: 'Rajdhani, sans-serif',
};

export function ResultPanel({ props }: AgenticProps) {
  const title = String(props.title || 'Résultat');
  const body = String(props.body || '').trim();
  const source = props.source ? String(props.source) : '';
  const items = Array.isArray(props.items)
    ? (props.items as unknown[]).map(String).filter(Boolean)
    : [];

  return (
    <div
      className="h-full flex flex-col gap-3 p-4 overflow-auto"
      style={{
        background: 'rgba(0, 12, 28, 0.55)',
        border: '1px solid rgba(0, 245, 255, 0.18)',
        borderRadius: 12,
      }}
    >
      <div>
        <p style={{ ...raj, color: 'rgba(255,255,255,0.92)', fontSize: 18, margin: 0 }}>
          {title}
        </p>
        {source ? (
          <p style={{ ...mono, color: 'rgba(0,245,255,0.55)', fontSize: 9, marginTop: 4 }}>
            {source}
          </p>
        ) : null}
      </div>

      {body ? (
        <p
          style={{
            ...raj,
            color: 'rgba(220,235,255,0.88)',
            fontSize: 14,
            lineHeight: 1.55,
            margin: 0,
            whiteSpace: 'pre-wrap',
          }}
        >
          {body}
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it, i) => {
            const isUrl = /^https?:\/\//i.test(it);
            return (
              <li
                key={`${i}-${it.slice(0, 24)}`}
                style={{ ...mono, color: 'rgba(200,220,255,0.8)', fontSize: 11, lineHeight: 1.4 }}
              >
                {isUrl ? (
                  <a
                    href={it}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'rgba(0,245,255,0.85)', textDecoration: 'underline' }}
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

      {!body && items.length === 0 ? (
        <p style={{ ...mono, color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>
          Aucun contenu — en attente du Core.
        </p>
      ) : null}
    </div>
  );
}
