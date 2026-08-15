/**
 * Séquence DEV — simulation agentic UI (fixtures, pas des données Core live).
 * Composition « humaine » : chaque brique = une info utile, taille au contenu.
 * Pas de bannière titre glass vide (le chrome démo porte déjà le libellé de scène).
 */
import type { SurfaceComponent, SurfaceDocument } from '../protocol/surface';

export type DemoStep = {
  afterMs: number;
  label: string;
  mode: 'merge' | 'replace';
  components: Record<string, SurfaceComponent>;
  root?: string[];
};

function c(
  name: string,
  props: Record<string, unknown>,
  region: SurfaceComponent['region'],
  size: SurfaceComponent['size'],
  state = 'idle',
): SurfaceComponent {
  return { name, props, state, region, size, children: [] };
}

export const AGENTIC_DEMO_STEPS: DemoStep[] = [
  {
    afterMs: 900,
    label: 'Recherche web',
    mode: 'replace',
    root: ['tool_search'],
    components: {
      tool_search: c(
        'ToolCall',
        {
          intent: 'web.search',
          owner: 'hermes',
          status: 'started',
          summary: '« JARVIS OS agentic UI composition »…',
        },
        'left',
        'normal',
        'started',
      ),
    },
  },
  {
    afterMs: 3800,
    label: 'Résultats web',
    mode: 'merge',
    components: {
      tool_search: c(
        'ToolCall',
        {
          intent: 'web.search',
          owner: 'hermes',
          status: 'completed',
          duration_ms: 840,
          summary: '12 sources · top 4 retenues',
        },
        'left',
        'compact',
        'completed',
      ),
      result_web: c(
        'ResultPanel',
        {
          title: 'Synthèse',
          source: 'web.search',
          body: 'Surface = JSON de composants enregistrés. L’agent compose ; le HUD pixelise.',
          items: [
            'Catalogue : ResultPanel · StatCard · ToolCall',
            'Policy : intention → Core → exécution',
          ],
        },
        'center',
        'normal',
      ),
      links: c(
        'LinkList',
        {
          title: 'Sources',
          items: [
            'https://docs.local/jarvis-agentic',
            'https://docs.local/surface-protocol',
          ],
        },
        'right',
        'compact',
      ),
    },
  },
  {
    afterMs: 4800,
    label: 'Stats système',
    mode: 'replace',
    // Rangée de KPI + courbe + contexte — zéro bandeau titre
    root: ['cpu', 'mem', 'lat', 'chart', 'kv'],
    components: {
      cpu: c(
        'StatCard',
        { label: 'CPU', value: 34, unit: '%', tone: 'cyan', hint: 'NUC' },
        'left',
        'compact',
      ),
      mem: c(
        'StatCard',
        { label: 'RAM', value: 6.2, unit: 'Go', tone: 'violet', hint: '/ 16' },
        'left',
        'compact',
      ),
      lat: c(
        'StatCard',
        { label: 'Latence', value: 42, unit: 'ms', tone: 'amber', hint: 'WS' },
        'left',
        'compact',
      ),
      chart: c(
        'MetricChart',
        {
          label: 'Charge 60s',
          series: [12, 18, 22, 19, 28, 35, 31, 40, 36, 34, 38, 42],
          tone: 'cyan',
        },
        'right',
        'normal',
      ),
      kv: c(
        'KeyValueList',
        {
          title: 'Contexte',
          rows: [
            { key: 'Hôte', value: 'nuc-jarvis' },
            { key: 'Core', value: ':8765' },
            { key: 'Mode', value: 'demo' },
          ],
        },
        'center',
        'compact',
      ),
    },
  },
  {
    afterMs: 4600,
    label: 'Analyse terminal',
    mode: 'replace',
    root: ['tool_sh', 'badge', 'table'],
    components: {
      tool_sh: c(
        'ToolCall',
        {
          intent: 'shell.status',
          owner: 'core',
          status: 'completed',
          duration_ms: 118,
          summary: 'systemctl is-active jarvis-core nginx',
        },
        'left',
        'compact',
        'completed',
      ),
      badge: c('StatusBadge', { label: 'voicebox', status: 'warn' }, 'top', 'compact'),
      table: c(
        'DataTable',
        {
          title: 'Services',
          columns: ['Service', 'État', 'Depuis'],
          rows: [
            ['jarvis-core', 'active', '2h 14m'],
            ['nginx', 'active', '2h 14m'],
            ['hermes', 'active', '47m'],
            ['voicebox', 'degraded', '—'],
          ],
        },
        'center',
        'normal',
      ),
    },
  },
  {
    afterMs: 4800,
    label: 'Vision',
    mode: 'replace',
    root: ['info', 'avatar', 'tool_vision', 'cam'],
    components: {
      info: c(
        'InfoCard',
        {
          title: 'Pipeline vision',
          body: 'Aperçu caméra produit — composition, pas un faux diagnostic.',
        },
        'left',
        'compact',
      ),
      avatar: c(
        'AvatarChip',
        { name: 'Samir', initials: 'SA', role: 'admin', tone: 'cyan' },
        'left',
        'compact',
      ),
      tool_vision: c(
        'ToolCall',
        {
          intent: 'vision.analyze',
          owner: 'core',
          status: 'started',
          summary: 'Face / gestes',
        },
        'center',
        'compact',
        'started',
      ),
      cam: c('CameraPreview', { mirrored: true, opacity: 1 }, 'right', 'normal'),
    },
  },
  {
    afterMs: 5200,
    label: 'Preuve & hub',
    mode: 'replace',
    root: ['verify', 'hub', 'action', 'approval'],
    components: {
      verify: c(
        'VerificationCard',
        {
          proposition: 'Redémarrer nginx après sync fronts',
          action_requested: 'service.restart nginx',
          action_executed: 'systemctl restart nginx',
          result_observed: 'active (running)',
          result_validated: 'health :8080 → 200',
          outcome: 'verified',
        },
        'center',
        'normal',
        'verified',
      ),
      hub: c(
        'ServiceHub',
        {
          title: 'Services',
          subtitle: '',
          services: [
            { id: 'core', name: 'Core', status: 'ok', host: 'nuc' },
            { id: 'hermes', name: 'Hermes', status: 'ok', host: 'nuc' },
            { id: 'voice', name: 'Voicebox', status: 'warn', host: 'vps' },
          ],
        },
        'left',
        'normal',
      ),
      action: c(
        'ActionRequest',
        {
          label: 'Relancer voicebox',
          action: 'service.restart',
          detail: 'Intention seule',
        },
        'right',
        'compact',
      ),
      approval: c(
        'ApprovalCard',
        {
          approvalId: 'demo-appr-1',
          action: 'service.restart voicebox',
          gravity: 'admin',
          reason: 'Confirmation Policy',
        },
        'top',
        'normal',
        'pending',
      ),
    },
  },
  {
    afterMs: 5600,
    label: 'Mix',
    mode: 'replace',
    root: ['result2', 'sys', 'console'],
    components: {
      result2: c(
        'ResultPanel',
        {
          title: 'Fin de cycle',
          source: 'demo',
          body: 'Reprise recherche. Esc pour sortir.',
          items: ['Recherche', 'Stats', 'Terminal', 'Vision', 'Preuve'],
        },
        'center',
        'compact',
      ),
      sys: c('SystemMonitor', {}, 'left', 'normal'),
      console: c('CommandConsole', {}, 'right', 'normal'),
    },
  },
];

export function emptyDemoDoc(surfaceId: string): SurfaceDocument {
  return {
    surfaces: { [surfaceId]: { root: [], components: {} } },
    data: {},
    pending: { approvals: {} },
  };
}

export function applyDemoStep(
  doc: SurfaceDocument,
  surfaceId: string,
  step: DemoStep,
): SurfaceDocument {
  const prev = doc.surfaces[surfaceId] ?? { root: [], components: {} };

  if (step.mode === 'replace') {
    const root = step.root ?? Object.keys(step.components);
    return {
      ...doc,
      surfaces: {
        ...doc.surfaces,
        [surfaceId]: { root, components: { ...step.components } },
      },
    };
  }

  const components = { ...prev.components, ...step.components };
  const added = Object.keys(step.components).filter((id) => !prev.root.includes(id));
  const root = [...prev.root, ...added];
  return {
    ...doc,
    surfaces: {
      ...doc.surfaces,
      [surfaceId]: { root, components },
    },
  };
}
