/**
 * MarkdownBlock — sous-ensemble minimal fait main (titres, gras/italique,
 * code inline/fenced, listes, liens). Décision délibérée : pas de dépendance
 * npm nouvelle (`react-markdown`) pour un seul composant sur ~70 — voir le
 * plan. À reconsidérer si la fidélité CommonMark complète devient nécessaire.
 */
import type { ReactNode } from 'react';
import { GlassPanel } from '../../../visual/glass';
import { useSpatialTheme, type SpatialMode } from '../../../spatial/theme/SpatialTheme';
import { CodeBlock } from './CodeBlock';

export interface MarkdownBlockProps {
  source: string;
}

type Theme = { text: string; textMuted: string; paper: string; accent: string; mode: SpatialMode };

const INLINE_RE = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;

function renderInline(text: string, theme: Theme, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      parts.push(<strong key={`${keyPrefix}-${i}`} style={{ color: theme.text }}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      parts.push(<em key={`${keyPrefix}-${i}`}>{m[3]}</em>);
    } else if (m[4] !== undefined) {
      parts.push(
        <code key={`${keyPrefix}-${i}`} style={{ fontFamily: 'ui-monospace, monospace', background: `rgba(${theme.paper}, 0.1)`, padding: '1px 4px', borderRadius: 4 }}>
          {m[4]}
        </code>,
      );
    } else if (m[5] !== undefined) {
      parts.push(
        <a key={`${keyPrefix}-${i}`} href={m[6]} target="_blank" rel="noopener noreferrer" style={{ color: `rgba(${theme.accent}, 1)` }}>
          {m[5]}
        </a>,
      );
    }
    last = INLINE_RE.lastIndex;
    i += 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function MarkdownBlock({ source }: MarkdownBlockProps) {
  const theme = useSpatialTheme();
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let codeBuffer: string[] | null = null;
  let codeLang = '';

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={key} style={{ margin: '4px 0', paddingLeft: 18 }}>
        {listBuffer.map((item, i) => (
          <li key={i} style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>
            {renderInline(item, theme, `${key}-${i}`)}
          </li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  lines.forEach((line, idx) => {
    const fence = line.match(/^```(.*)$/);
    if (fence) {
      if (codeBuffer === null) {
        codeBuffer = [];
        codeLang = fence[1].trim();
      } else {
        const snapshot = codeBuffer.join('\n');
        blocks.push(
          <div key={`code-${idx}`} style={{ height: 120, margin: '6px 0' }}>
            <CodeBlock code={snapshot} language={codeLang || undefined} />
          </div>,
        );
        codeBuffer = null;
      }
      return;
    }
    if (codeBuffer !== null) {
      codeBuffer.push(line);
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const listItem = line.match(/^[-*]\s+(.*)$/);
    if (listItem) {
      listBuffer.push(listItem[1]);
      return;
    }
    flushList(`list-${idx}`);

    if (heading) {
      const level = heading[1].length;
      const size = level === 1 ? 16 : level === 2 ? 14 : 13;
      blocks.push(
        <p key={idx} style={{ margin: '8px 0 4px', fontSize: size, fontWeight: 650, color: theme.text }}>
          {renderInline(heading[2], theme, `h-${idx}`)}
        </p>,
      );
    } else if (line.trim() !== '') {
      blocks.push(
        <p key={idx} style={{ margin: '4px 0', fontSize: 13, lineHeight: 1.5, color: theme.textMuted }}>
          {renderInline(line, theme, `p-${idx}`)}
        </p>,
      );
    }
  });
  flushList('list-end');

  return (
    <GlassPanel material="ultraThin" elevation="surface" radius="lg" padding="md" style={{ height: '100%', boxSizing: 'border-box', overflow: 'auto' }}>
      {blocks}
    </GlassPanel>
  );
}

export default MarkdownBlock;
