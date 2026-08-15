/**
 * LayoutCapabilities — le contrat qu'un composant Agentic expose (jamais ce
 * qu'il décide). Adapté en `LayoutNode` par `capabilitiesToNode()`, consommé
 * par `sim/adapters.ts::secToNode` — même schéma que `PRIORITY_BY_ID`/
 * `SIZE_CONSTRAINTS` déjà établi pour le V1 générique. Zéro changement à
 * `layout/node.ts`/`layout/solver.ts` au-delà de ce qui existe déjà.
 *
 * `resizable`/`collapsible`/`expandable`/`compactMode`/`collapsedMode` sont de
 * la métadonnée pour le rendu (via `LayoutNode.meta`) — le solveur ne les lit
 * jamais.
 */
import type { ExpandBehavior, LayoutNode } from '../layout/node';
import type { SectionChromeState } from '../layout/tokens';

export type ContentType =
  | 'metric'
  | 'chart'
  | 'table'
  | 'text'
  | 'terminal'
  | 'media'
  | 'action'
  | 'status'
  | 'timeline'
  | 'navigation';

export interface LayoutCapabilities {
  minWidth: number;
  preferredWidth: number;
  maxWidth?: number;
  minHeight: number;
  preferredHeight: number;
  maxHeight?: number;
  aspectRatio?: number;
  priority: number;
  resizable?: boolean;
  collapsible?: boolean;
  expandable?: boolean;
  compactMode?: boolean;
  collapsedMode?: boolean;
  expandBehavior?: ExpandBehavior;
  contentType: ContentType;
}

/**
 * Une ligne par "kind" réel monté par une scène. Valeurs de départ (mêmes
 * unités que `SIZE_CONSTRAINTS` du V1 générique) — à ajuster à l'œil une fois
 * rendu, pas des mesures exactes.
 */
export const CAPABILITIES_BY_KIND: Record<string, LayoutCapabilities> = {
  // ── Metrics ─────────────────────────────────────────────────────────────
  'metric-card': { minWidth: 160, preferredWidth: 220, minHeight: 90, preferredHeight: 130, priority: 70, compactMode: true, collapsedMode: true, contentType: 'metric' },
  'metric-grid': { minWidth: 240, preferredWidth: 360, minHeight: 100, preferredHeight: 160, priority: 65, contentType: 'metric' },
  kpi: { minWidth: 160, preferredWidth: 220, minHeight: 90, preferredHeight: 130, priority: 60, compactMode: true, contentType: 'metric' },
  progress: { minWidth: 140, preferredWidth: 220, minHeight: 40, preferredHeight: 64, priority: 55, contentType: 'status' },
  gauge: { minWidth: 100, preferredWidth: 140, minHeight: 100, preferredHeight: 140, aspectRatio: 1, priority: 55, contentType: 'status' },
  'gauge-chart': { minWidth: 100, preferredWidth: 140, minHeight: 100, preferredHeight: 140, aspectRatio: 1, priority: 55, contentType: 'chart' },
  'status-indicator': { minWidth: 80, preferredWidth: 120, minHeight: 28, preferredHeight: 32, priority: 50, contentType: 'status' },
  'stat-list': { minWidth: 200, preferredWidth: 280, minHeight: 120, preferredHeight: 200, priority: 55, contentType: 'status' },

  // ── Charts ──────────────────────────────────────────────────────────────
  'line-chart': { minWidth: 280, preferredWidth: 420, minHeight: 140, preferredHeight: 220, aspectRatio: 1.8, priority: 65, expandBehavior: 'preserveAspect', contentType: 'chart' },
  'area-chart': { minWidth: 280, preferredWidth: 420, minHeight: 140, preferredHeight: 220, aspectRatio: 1.8, priority: 65, expandBehavior: 'preserveAspect', contentType: 'chart' },
  'bar-chart': { minWidth: 280, preferredWidth: 420, minHeight: 140, preferredHeight: 220, aspectRatio: 1.6, priority: 65, expandBehavior: 'preserveAspect', contentType: 'chart' },
  'donut-chart': { minWidth: 140, preferredWidth: 200, minHeight: 140, preferredHeight: 200, aspectRatio: 1, priority: 60, contentType: 'chart' },
  sparkline: { minWidth: 80, preferredWidth: 160, minHeight: 24, preferredHeight: 48, priority: 45, contentType: 'chart' },
  'timeline-chart': { minWidth: 320, preferredWidth: 560, minHeight: 100, preferredHeight: 160, priority: 55, contentType: 'timeline' },

  // ── Structured Data ─────────────────────────────────────────────────────
  'data-table': { minWidth: 360, preferredWidth: 520, minHeight: 180, preferredHeight: 280, priority: 60, contentType: 'table' },
  'data-list': { minWidth: 240, preferredWidth: 340, minHeight: 140, preferredHeight: 220, priority: 55, contentType: 'table' },
  'key-value-list': { minWidth: 220, preferredWidth: 320, minHeight: 120, preferredHeight: 200, priority: 55, contentType: 'table' },
  'tree-view': { minWidth: 240, preferredWidth: 340, minHeight: 160, preferredHeight: 260, priority: 55, contentType: 'table' },
  'log-viewer': { minWidth: 280, preferredWidth: 420, minHeight: 140, preferredHeight: 240, priority: 55, contentType: 'terminal' },
  'event-list': { minWidth: 260, preferredWidth: 380, minHeight: 140, preferredHeight: 240, priority: 55, contentType: 'timeline' },

  // ── System ──────────────────────────────────────────────────────────────
  'system-monitor': { minWidth: 320, preferredWidth: 420, minHeight: 280, preferredHeight: 420, priority: 65, contentType: 'metric' },
  'device-card': { minWidth: 160, preferredWidth: 220, minHeight: 100, preferredHeight: 140, priority: 55, contentType: 'status' },
  'device-grid': { minWidth: 260, preferredWidth: 400, minHeight: 160, preferredHeight: 280, priority: 55, contentType: 'status' },
  'process-list': { minWidth: 240, preferredWidth: 340, minHeight: 160, preferredHeight: 260, priority: 55, contentType: 'table' },
  'service-list': { minWidth: 260, preferredWidth: 380, minHeight: 160, preferredHeight: 260, priority: 60, contentType: 'status' },
  terminal: { minWidth: 320, preferredWidth: 480, minHeight: 180, preferredHeight: 280, priority: 60, contentType: 'terminal' },

  // ── Agent/Execution ─────────────────────────────────────────────────────
  'tool-call': { minWidth: 260, preferredWidth: 360, minHeight: 120, preferredHeight: 180, priority: 70, contentType: 'action' },
  'tool-result': { minWidth: 280, preferredWidth: 380, minHeight: 140, preferredHeight: 220, priority: 68, contentType: 'action' },
  'execution-status': { minWidth: 200, preferredWidth: 300, minHeight: 60, preferredHeight: 100, priority: 60, contentType: 'status' },
  'action-request': { minWidth: 220, preferredWidth: 320, minHeight: 100, preferredHeight: 160, priority: 72, contentType: 'action' },
  'approval-card': { minWidth: 280, preferredWidth: 380, minHeight: 160, preferredHeight: 220, priority: 100, expandable: true, contentType: 'action' },
  'confirmation-card': { minWidth: 260, preferredWidth: 360, minHeight: 140, preferredHeight: 200, priority: 75, contentType: 'action' },
  'verification-card': { minWidth: 320, preferredWidth: 440, minHeight: 200, preferredHeight: 320, priority: 80, contentType: 'action' },
  'status-card': { minWidth: 220, preferredWidth: 320, minHeight: 80, preferredHeight: 140, priority: 62, contentType: 'status' },

  // ── Text ────────────────────────────────────────────────────────────────
  'text-block': { minWidth: 160, preferredWidth: 280, minHeight: 40, preferredHeight: 100, priority: 45, contentType: 'text' },
  'markdown-block': { minWidth: 240, preferredWidth: 380, minHeight: 100, preferredHeight: 220, priority: 50, contentType: 'text' },
  'code-block': { minWidth: 240, preferredWidth: 380, minHeight: 80, preferredHeight: 160, priority: 50, contentType: 'text' },
  'quote-block': { minWidth: 160, preferredWidth: 280, minHeight: 60, preferredHeight: 100, priority: 45, contentType: 'text' },
  'message-card': { minWidth: 220, preferredWidth: 340, minHeight: 80, preferredHeight: 140, priority: 50, contentType: 'text' },
  'summary-card': { minWidth: 260, preferredWidth: 380, minHeight: 140, preferredHeight: 220, priority: 60, contentType: 'text' },

  // ── Media ───────────────────────────────────────────────────────────────
  'camera-preview': { minWidth: 320, preferredWidth: 420, minHeight: 180, preferredHeight: 236, aspectRatio: 16 / 9, priority: 55, expandBehavior: 'preserveAspect', contentType: 'media' },
  'image-viewer': { minWidth: 200, preferredWidth: 320, minHeight: 150, preferredHeight: 240, aspectRatio: 4 / 3, priority: 50, expandBehavior: 'preserveAspect', contentType: 'media' },
  'video-preview': { minWidth: 280, preferredWidth: 420, minHeight: 158, preferredHeight: 236, aspectRatio: 16 / 9, priority: 50, expandBehavior: 'preserveAspect', contentType: 'media' },
  screenshot: { minWidth: 280, preferredWidth: 420, minHeight: 158, preferredHeight: 236, aspectRatio: 16 / 9, priority: 50, expandBehavior: 'preserveAspect', contentType: 'media' },
  'media-gallery': { minWidth: 280, preferredWidth: 440, minHeight: 200, preferredHeight: 320, priority: 50, contentType: 'media' },

  // ── Navigation ──────────────────────────────────────────────────────────
  'section-header': { minWidth: 120, preferredWidth: 240, minHeight: 28, preferredHeight: 44, priority: 90, contentType: 'navigation' },
  'tab-bar': { minWidth: 200, preferredWidth: 320, minHeight: 36, preferredHeight: 44, priority: 65, contentType: 'navigation' },
  'segmented-control': { minWidth: 160, preferredWidth: 240, minHeight: 32, preferredHeight: 36, priority: 65, contentType: 'navigation' },
  breadcrumb: { minWidth: 120, preferredWidth: 240, minHeight: 24, preferredHeight: 28, priority: 60, contentType: 'navigation' },
  'filter-bar': { minWidth: 240, preferredWidth: 360, minHeight: 40, preferredHeight: 52, priority: 60, contentType: 'navigation' },
  'search-bar': { minWidth: 200, preferredWidth: 320, minHeight: 40, preferredHeight: 44, priority: 65, contentType: 'navigation' },
  'command-bar': { minWidth: 240, preferredWidth: 380, minHeight: 40, preferredHeight: 48, priority: 65, contentType: 'navigation' },

  // ── Spatial ─────────────────────────────────────────────────────────────
  'graph-3d': {
    minWidth: 480,
    preferredWidth: 900,
    minHeight: 360,
    preferredHeight: 560,
    priority: 95,
    expandable: true,
    expandBehavior: 'fill',
    contentType: 'media',
  },
};

export function capabilitiesToNode(
  id: string,
  kind: string,
  caps: LayoutCapabilities,
  chromeState: SectionChromeState,
  meta?: Record<string, unknown>,
): LayoutNode {
  return {
    id,
    kind,
    chromeState,
    priority: caps.priority,
    constraint: {
      minWidth: caps.minWidth,
      preferredWidth: caps.preferredWidth,
      maxWidth: caps.maxWidth,
      minHeight: caps.minHeight,
      preferredHeight: caps.preferredHeight,
      maxHeight: caps.maxHeight,
      aspectRatio: caps.aspectRatio,
    },
    expandBehavior: caps.expandBehavior,
    meta: {
      contentType: caps.contentType,
      resizable: caps.resizable,
      collapsible: caps.collapsible,
      expandable: caps.expandable,
      compactMode: caps.compactMode,
      collapsedMode: caps.collapsedMode,
      ...meta,
    },
  };
}
