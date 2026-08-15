/**
 * AgenticDemoStage — récit de composition :
 * idle (orbe centre) → +1 → +2 → +N (orbe descend) → fermeture progressive → idle.
 * Fermer toutes les sections (rouge) = retour idle immédiat.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Workspace } from '../components/containers/Workspace';
import { Stack } from '../components/containers/Flex';
import { SplitView } from '../components/containers/SplitView';
import { MetricCard } from '../components/metrics/MetricCard';
import { MetricGrid } from '../components/metrics/MetricGrid';
import { StatusIndicator } from '../components/metrics/StatusIndicator';
import { LineChart } from '../components/charts/LineChart';
import { DataTable } from '../components/data/DataTable';
import { EventList } from '../components/data/EventList';
import type { EventItem } from '../components/shared/dataShapes';
import { ProcessList } from '../components/system/ProcessList';
import { ServiceList } from '../components/system/ServiceList';
import { DeviceCard } from '../components/system/DeviceCard';
import { SystemMonitor } from '../components/system/SystemMonitor';
import { ToolCall } from '../components/agent/ToolCall';
import { ToolResult } from '../components/agent/ToolResult';
import { VerificationCard } from '../components/agent/VerificationCard';
import { ApprovalCard } from '../components/agent/ApprovalCard';
import { RecoveryCard, RecoveryActions } from '../components/agent/diagnosticsPresets';
import { CameraPreview } from '../components/media/CameraPreview';
import { Graph3DLab } from './Graph3DLab';
import { NeuralCellLab } from './NeuralCellLab';
import { PresentationDemoStage } from '../components/graph3d/presentation/PresentationDemoStage';
import { GlassOverlay } from '../../visual/glass';
import {
  AppScreen,
  BodyText,
  KpiRow,
  MiniList,
  Spark,
  TerminalPane,
} from '../layout/ContentBlocks';
import { type InfoDensity, type SectionChromeState } from '../layout/tokens';
import { hudSpatialTransition } from '../layout/motion';
import { profileForWidth, type SizeClass } from '../layout/responsivePack';
import { secToNode } from './adapters';
import { tierToDensity } from '../components/shared/density';
import { Orb } from '../../app/components/orb';
import { OrbLite } from '../../app/components/orb/OrbLite';
import { useOrbHud } from '../../app/components/orb/useOrbHud';
import { VoiceBar } from '../../app/components/VoiceBar';
import { useSpatialTheme } from '../../spatial/theme/SpatialTheme';
import { getDevicePolicy } from '../../ui/core/devicePolicy';
import { tokens } from '../../ui/tokens';

export type Sec = {
  id: string;
  title: string;
  subtitle?: string;
  state: SectionChromeState;
  size: SizeClass;
  kind:
    // décoratifs — labo générique ("scène 0"), inchangés
    | 'kpi' | 'terminal' | 'app4' | 'app6' | 'list' | 'spark' | 'text' | 'mix'
    // réels — scènes nommées, via agentic/components/*
    | 'metric-card' | 'line-chart' | 'data-table' | 'process-list' | 'service-list'
    | 'tool-call' | 'tool-result' | 'verification-card' | 'system-monitor'
    | 'vision-split' | 'approval-card' | 'event-list' | 'device-card' | 'recovery'
    | 'graph-3d'
    | 'neural-cell'
    | 'presentation-demo';
  tone?: string;
  entering?: boolean;
};

function catalog(): Sec[] {
  return [
    { id: 'metrics', title: 'System Metrics', subtitle: 'NUC', state: 'normal', size: 'lg', kind: 'kpi', tone: '10, 132, 255' },
    { id: 'term', title: 'Terminal', subtitle: 'core', state: 'normal', size: 'md', kind: 'terminal', tone: '52, 199, 89' },
    { id: 'app', title: 'Mission App', subtitle: '2×2', state: 'normal', size: 'md', kind: 'app4', tone: '94, 92, 230' },
    { id: 'fleet', title: 'Services', state: 'normal', size: 'sm', kind: 'list', tone: '255, 159, 10' },
    { id: 'cpu', title: 'CPU', state: 'normal', size: 'sm', kind: 'spark', tone: '10, 132, 255' },
    { id: 'ram', title: 'RAM', state: 'normal', size: 'sm', kind: 'text', tone: '94, 92, 230' },
    { id: 'net', title: 'Network', state: 'normal', size: 'sm', kind: 'mix', tone: '255, 159, 10' },
    { id: 'ha', title: 'Maison', state: 'normal', size: 'sm', kind: 'list', tone: '52, 199, 89' },
    { id: 'voice', title: 'Voix', state: 'normal', size: 'sm', kind: 'spark', tone: '255, 69, 58' },
    { id: 'cam', title: 'Caméra', state: 'normal', size: 'md', kind: 'app6', tone: '10, 132, 255' },
    { id: 'gpu', title: 'GPU', state: 'normal', size: 'sm', kind: 'kpi', tone: '90, 200, 250' },
    { id: 'disk', title: 'Disk', state: 'normal', size: 'sm', kind: 'text', tone: '142, 142, 147' },
  ];
}

/**
 * Scènes nommées — compositions statiques via `agentic/components/*` (pas la
 * démo générique "scène 0"). Sélectionnées via la barre de chrome, pas le
 * moteur de beats. Jamais de pipeline Core touché ici (labo local uniquement).
 */
export type Scene = { id: string; label: string; build: () => Sec[] };

const SCENES: Scene[] = [
  {
    id: 'monitoring',
    label: 'Monitoring',
    build: () => [
      { id: 'mon-cpu', title: 'CPU', state: 'normal', size: 'sm', kind: 'metric-card', tone: '10, 132, 255' },
      { id: 'mon-ram', title: 'RAM', state: 'normal', size: 'sm', kind: 'metric-card', tone: '94, 92, 230' },
      { id: 'mon-net', title: 'Réseau', state: 'normal', size: 'sm', kind: 'metric-card', tone: '255, 159, 10' },
      { id: 'mon-chart', title: 'Charge · 24h', state: 'normal', size: 'lg', kind: 'line-chart', tone: '10, 132, 255' },
      { id: 'mon-proc', title: 'Processus', state: 'normal', size: 'md', kind: 'process-list', tone: '52, 199, 89' },
      { id: 'mon-svc', title: 'Services', state: 'normal', size: 'md', kind: 'service-list', tone: '52, 199, 89' },
    ],
  },
  {
    id: 'agent-execution',
    label: 'Agent execution',
    build: () => [
      { id: 'age-call', title: 'Outil', state: 'normal', size: 'md', kind: 'tool-call', tone: '10, 132, 255' },
      { id: 'age-result', title: 'Résultat', state: 'normal', size: 'md', kind: 'tool-result', tone: '52, 199, 89' },
      { id: 'age-verify', title: 'Vérification', state: 'normal', size: 'lg', kind: 'verification-card', tone: '94, 92, 230' },
      { id: 'age-monitor', title: 'Système', state: 'normal', size: 'md', kind: 'system-monitor', tone: '142, 142, 147' },
    ],
  },
  {
    id: 'vision',
    label: 'Vision',
    build: () => [
      { id: 'vis-main', title: 'Vision', subtitle: 'Salon', state: 'normal', size: 'xl', kind: 'vision-split', tone: '10, 132, 255' },
    ],
  },
  {
    id: 'critical-action',
    label: 'Action critique',
    build: () => [
      { id: 'crit-approval', title: 'Autorisation', state: 'expanded', size: 'xl', kind: 'approval-card', tone: '255, 59, 48' },
    ],
  },
  {
    id: 'dense',
    label: 'Dense',
    build: () => [
      { id: 'dense-cpu', title: 'CPU', state: 'normal', size: 'lg', kind: 'metric-card', tone: '10, 132, 255' },
      { id: 'dense-ram', title: 'RAM', state: 'normal', size: 'lg', kind: 'metric-card', tone: '94, 92, 230' },
      { id: 'dense-net', title: 'Réseau', state: 'normal', size: 'lg', kind: 'metric-card', tone: '255, 159, 10' },
      { id: 'dense-chart', title: 'Charge', state: 'normal', size: 'lg', kind: 'line-chart', tone: '10, 132, 255' },
      { id: 'dense-table', title: 'Services (table)', state: 'normal', size: 'lg', kind: 'data-table', tone: '52, 199, 89' },
      { id: 'dense-term', title: 'Terminal', subtitle: 'core', state: 'normal', size: 'lg', kind: 'terminal', tone: '52, 199, 89' },
      { id: 'dense-events', title: 'Événements', state: 'normal', size: 'lg', kind: 'event-list', tone: '255, 159, 10' },
      { id: 'dense-svc', title: 'Services', state: 'normal', size: 'lg', kind: 'service-list', tone: '52, 199, 89' },
    ],
  },
  {
    id: 'system-health',
    label: 'System Health',
    build: () => [
      { id: 'health-uptime', title: 'Uptime', state: 'normal', size: 'sm', kind: 'metric-card', tone: '52, 199, 89' },
      { id: 'health-dev1', title: 'NUC', subtitle: 'nuc-main', state: 'normal', size: 'sm', kind: 'device-card', tone: '10, 132, 255' },
      { id: 'health-dev2', title: 'Portable', subtitle: 'lenovo (Windows)', state: 'normal', size: 'sm', kind: 'device-card', tone: '94, 92, 230' },
      { id: 'health-svc', title: 'Services', state: 'normal', size: 'md', kind: 'service-list', tone: '52, 199, 89' },
      { id: 'health-events', title: 'Événements', state: 'normal', size: 'md', kind: 'event-list', tone: '255, 159, 10' },
      // Dégradé volontaire : rendu sans dépendance Core (voir renderBody · 'recovery').
      { id: 'health-recovery', title: 'Recovery', state: 'normal', size: 'md', kind: 'recovery', tone: '255, 59, 48' },
    ],
  },
  {
    id: 'presentation-demo',
    label: 'Presentation Controller · DEBUG',
    build: () => [
      {
        id: 'presdemo',
        title: 'Presentation Controller',
        subtitle: 'debug — pas de Core/voix branché',
        state: 'expanded',
        size: 'xl',
        kind: 'presentation-demo',
        tone: '10, 132, 255',
      },
    ],
  },
  {
    id: 'graph-3d',
    label: '3D / Orb Graph',
    build: () => [
      {
        id: 'g3d',
        title: 'Architecture',
        subtitle: 'lab',
        state: 'expanded',
        size: 'xl',
        kind: 'graph-3d',
        tone: '10, 132, 255',
      },
    ],
  },
  {
    id: 'neural-cell',
    label: 'Architecture · Concept',
    build: () => [
      {
        id: 'ncell',
        title: 'Architecture holographique',
        subtitle: '9 systèmes · concept',
        state: 'expanded',
        size: 'xl',
        kind: 'neural-cell',
        tone: '0, 174, 239',
      },
    ],
  },
];

/** Récit : idle → montée → plateau → descente → idle */
type Beat = {
  label: string;
  /** Combien de sections du catalogue (0 = idle). */
  count: number;
  /** Optionnel : forcer états sur les ids ouverts. */
  tweak?: (secs: Sec[]) => Sec[];
  dwellMs: number;
};

function buildBeats(maxForViewport: number): Beat[] {
  const up = [0, 1, 2, 3, Math.min(6, maxForViewport), Math.min(9, maxForViewport), Math.min(12, maxForViewport)];
  const uniq = [...new Set(up)].filter((n) => n <= maxForViewport || n === 0);
  const beats: Beat[] = [];

  // Montée
  for (const n of uniq) {
    beats.push({
      label: n === 0 ? 'Idle · orbe centre' : `Compose · ${n} section${n > 1 ? 's' : ''}`,
      count: n,
      dwellMs: n === 0 ? 2200 : 3200,
      tweak:
        n >= 6
          ? (secs) =>
              secs.map((s, i) =>
                i === 0 && n >= 6 ? { ...s, state: 'expanded' as const, size: 'xl' as const } : s,
              )
          : undefined,
    });
  }

  // Variante formes (collapse / expand) sur le plateau max
  const plateau = uniq[uniq.length - 1];
  if (plateau >= 3) {
    beats.push({
      label: `Reflow · collapse alterné (${plateau})`,
      count: plateau,
      dwellMs: 3000,
      tweak: (secs) =>
        secs.map((s, i) => ({
          ...s,
          state: (i % 2 === 0 ? 'collapsed' : 'normal') as SectionChromeState,
          size: i % 3 === 0 ? 'md' : 'sm',
        })),
    });
    beats.push({
      label: `Reflow · terminal focus`,
      count: plateau,
      dwellMs: 3000,
      tweak: (secs) =>
        secs.map((s) =>
          s.id === 'term'
            ? { ...s, state: 'expanded' as const, size: 'xl' as const }
            : { ...s, state: 'collapsed' as const },
        ),
    });
    // Dégradation par priorité : demande le catalogue complet à 'lg' — le total
    // dépasse presque toujours availableHeight, quel que soit le viewport.
    // Le solveur doit compresser/collapse/cacher par priorité, pas le beat-builder.
    beats.push({
      label: 'Reflow · surcharge (dégradation prioritaire)',
      count: 12,
      dwellMs: 3400,
      tweak: (secs) => secs.map((s) => ({ ...s, size: 'lg' as const, state: 'normal' as const })),
    });
  }

  // Descente progressive
  const down = [...uniq].reverse().filter((n) => n < plateau);
  for (const n of down) {
    beats.push({
      label: n === 0 ? 'Retour idle' : `Ferme · reste ${n}`,
      count: n,
      dwellMs: n === 0 ? 2800 : 2600,
    });
  }
  if (beats[beats.length - 1]?.count !== 0) {
    beats.push({ label: 'Retour idle', count: 0, dwellMs: 2800 });
  }

  return beats;
}

const DEMO_LOAD_SERIES = [12, 18, 15, 22, 30, 28, 35, 40, 38, 44, 41, 48].map((y, i) => ({ x: i, y }));

const DEMO_EVENTS: EventItem[] = [
  { id: 'e1', label: 'Reconnexion agent Windows', timestamp: '10:42', tone: 'success' },
  { id: 'e2', label: 'Scan inventaire complet', timestamp: '10:38', tone: 'neutral' },
  { id: 'e3', label: 'Latence Hermes élevée', timestamp: '10:21', tone: 'warning' },
];

/** Scène 0 (décoratif) : `density` ignoré — la richesse vient des vraies scènes nommées. */
function renderBody(s: Sec, density: InfoDensity = 'standard') {
  switch (s.kind) {
    case 'metric-card':
      return (
        <MetricCard
          label={s.title}
          value={s.id === 'mon-cpu' ? '34' : s.id === 'mon-ram' ? '6.2' : s.id === 'mon-net' ? '1.2' : '42'}
          unit={s.id === 'mon-net' ? 'G' : s.id === 'mon-ram' ? 'Go' : '%'}
          icon={s.id === 'mon-cpu' ? 'cpu' : s.id === 'mon-ram' ? 'memory' : 'server'}
          density={density}
        />
      );
    case 'line-chart':
      return <LineChart label={s.title} data={DEMO_LOAD_SERIES} tone="cyan" />;
    case 'data-table':
      return (
        <DataTable
          title={s.title}
          columns={['Service', 'État', 'Depuis']}
          rows={[
            ['jarvis-core', 'active', '5j'],
            ['jarvis-hermes', 'active', '5j'],
            ['nginx', 'active', '12j'],
          ]}
        />
      );
    case 'process-list':
      return (
        <ProcessList
          title={s.title}
          rows={[
            { name: 'python (core)', cpu: '4.2%', memory: '253 Mo' },
            { name: 'hermes', cpu: '2.1%', memory: '198 Mo' },
            { name: 'dockerd', cpu: '0.4%', memory: '87 Mo' },
          ]}
        />
      );
    case 'service-list':
      return (
        <ServiceList
          title={s.title}
          services={[
            { name: 'Core', status: 'ok' },
            { name: 'Hermes', status: 'ok' },
            { name: 'Voice', status: 'warn' },
          ]}
        />
      );
    case 'tool-call':
      return <ToolCall intent="core.cursor" owner="device" status="completed" duration_ms={2061} summary="Cursor lancé" />;
    case 'tool-result':
      return <ToolResult tool="app.launch" status="success" output="pid=1996 · Cursor.exe" />;
    case 'verification-card':
      return (
        <VerificationCard
          proposition="Lancer Cursor sur le poste de Samir"
          action_requested="device.app_launch(cursor)"
          action_executed="app.launch → pc-33a88e343339"
          result_observed="pid=1996"
          result_validated="processus vivant"
          outcome="verified"
        />
      );
    case 'system-monitor':
      return <SystemMonitor />;
    case 'vision-split':
      return (
        <SplitView
          left={<CameraPreview caption="Salon" />}
          right={
            <Stack gap={8}>
              <StatusIndicator status="ok" label="Détection active" />
              <MetricGrid
                items={[
                  { label: 'Objets', value: '3' },
                  { label: 'Confiance', value: '92', unit: '%' },
                ]}
                columns={2}
              />
              <EventList title="Événements" items={DEMO_EVENTS} />
            </Stack>
          }
        />
      );
    case 'approval-card':
      return (
        <GlassOverlay>
          <ApprovalCard
            approvalId="demo-1"
            action="device.app_launch(cursor)"
            gravity="media"
            reason="Confirmation requise avant exécution sur le poste."
          />
        </GlassOverlay>
      );
    case 'event-list':
      return <EventList title={s.title} items={DEMO_EVENTS} />;
    case 'device-card':
      return <DeviceCard name={s.title} status="online" detail={s.subtitle} icon="server" />;
    case 'graph-3d':
      return <Graph3DLab />;
    case 'neural-cell':
      return <NeuralCellLab />;
    case 'presentation-demo':
      return <PresentationDemoStage />;
    case 'recovery':
      return (
        <RecoveryCard
          title="Core injoignable"
          lastHeartbeat="il y a 4 min"
          actions={
            <RecoveryActions
              actions={[
                { label: 'Relancer jarvis-core', action: 'recovery.restart_core', tone: 'accent' },
                { label: 'Voir les logs', action: 'recovery.view_logs' },
              ]}
            />
          }
        />
      );
    case 'kpi':
      return (
        <KpiRow
          items={[
            { label: 'CPU', value: '34%', tone: '10, 132, 255' },
            { label: 'RAM', value: '6.2', tone: '94, 92, 230' },
            { label: 'NET', value: '1.2G', tone: '255, 159, 10' },
          ]}
        />
      );
    case 'terminal':
      return (
        <TerminalPane
          lines={[
            '$ systemctl status jarvis-core',
            '● active (running)',
            '$ journalctl -u nginx -n 2',
            '… GET / 200',
          ]}
        />
      );
    case 'app4':
      return <AppScreen title="App · 2×2" tiles={4} />;
    case 'app6':
      return <AppScreen title="App · 6" tiles={6} />;
    case 'list':
      return <MiniList rows={['Core · ok', 'Hermes · ok', 'Voice · warn']} />;
    case 'spark':
      return <Spark values={[12, 22, 18, 30, 28, 40, 36, 42]} />;
    case 'mix':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <KpiRow items={[{ label: 'Latence', value: '42ms', tone: '255, 159, 10' }]} />
          <Spark values={[8, 14, 12, 20, 18]} />
        </div>
      );
    default:
      return <BodyText>Contenu section.</BodyText>;
  }
}

export function AgenticDemoStage({ onExit }: { onExit?: () => void }) {
  const initialScene = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const id = new URLSearchParams(window.location.search).get('scene');
    if (!id || !SCENES.some((sc) => sc.id === id)) return null;
    return id;
  }, []);
  const [beatIdx, setBeatIdx] = useState(0);
  const [sections, setSections] = useState<Sec[]>(() => {
    const scene = SCENES.find((sc) => sc.id === initialScene);
    return scene ? scene.build() : [];
  });
  const [auto, setAuto] = useState(!initialScene);
  const [activeScene, setActiveScene] = useState<string | null>(initialScene);
  const [canvasW, setCanvasW] = useState(1200);
  const [canvasH, setCanvasH] = useState(700);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const { orbState, meta, volume, playbackVolume } = useOrbHud();
  const { mode } = useSpatialTheme();
  const lite = getDevicePolicy().persona === 'kiosk';

  const profile = useMemo(() => profileForWidth(canvasW, 100), [canvasW]);
  const maxSecs = profile.cols >= 24 ? 12 : profile.cols >= 16 ? 9 : profile.cols >= 12 ? 6 : profile.cols >= 6 ? 4 : 2;
  const beats = useMemo(() => buildBeats(maxSecs), [maxSecs]);
  const beat = beats[beatIdx] ?? beats[0];
  const idle = sections.length === 0;

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setCanvasW(Math.max(280, Math.round(entries[0]?.contentRect.width ?? 1200)));
      setCanvasH(Math.max(200, Math.round(entries[0]?.contentRect.height ?? 700)));
    });
    ro.observe(el);
    setCanvasW(Math.max(280, Math.round(el.clientWidth)));
    setCanvasH(Math.max(200, Math.round(el.clientHeight)));
    return () => ro.disconnect();
  }, []);

  const applyBeat = useCallback(
    (idx: number) => {
      const b = beats[idx] ?? beats[0];
      const cat = catalog();
      let next: Sec[] = cat.slice(0, b.count).map((s) => ({ ...s, entering: true }));
      if (b.tweak) next = b.tweak(next);
      setSections(next);
      window.setTimeout(() => {
        setSections((prev) => prev.map((s) => ({ ...s, entering: false })));
      }, 420);
    },
    [beats],
  );

  // Scène nommée active → le moteur de beats générique ("scène 0") se met en
  // pause : les deux moteurs ne tournent jamais en même temps.
  useEffect(() => {
    if (activeScene) return;
    applyBeat(beatIdx);
  }, [beatIdx, applyBeat, activeScene]);

  useEffect(() => {
    if (!auto || activeScene) return;
    const t = window.setTimeout(() => {
      setBeatIdx((i) => (i + 1) % beats.length);
    }, beat?.dwellMs ?? 3000);
    return () => window.clearTimeout(t);
  }, [auto, beatIdx, beat?.dwellMs, beats.length, activeScene]);

  const selectScene = useCallback((sceneId: string | null) => {
    setAuto(false);
    setActiveScene(sceneId);
    if (sceneId === null) {
      setBeatIdx(0);
      setAuto(true);
      return;
    }
    const scene = SCENES.find((sc) => sc.id === sceneId);
    if (!scene) return;
    const next = scene.build().map((s) => ({ ...s, entering: true }));
    setSections(next);
    window.setTimeout(() => {
      setSections((prev) => prev.map((s) => ({ ...s, entering: false })));
    }, 420);
  }, []);

  // Layout Engine — géométrie calculée indépendamment de React (voir layout/solver.ts).
  // `nodes` mémoïsé sur `sections` : passé tel quel à `Workspace`, qui fait
  // tourner `useLayoutSnapshot` + le rendu grid en interne.
  const nodes = useMemo(() => sections.map(secToNode), [sections]);
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);

  const goIdle = useCallback(() => {
    setSections([]);
    setBeatIdx(0);
    setActiveScene(null);
  }, []);

  const closeSection = useCallback(
    (id: string) => {
      setSections((prev) => {
        const next = prev.filter((x) => x.id !== id);
        if (next.length === 0) {
          // Tout fermé d’un coup → idle. En scène nommée, on n'y reprend pas
          // le moteur de beats générique — juste idle, comme "Idle" au clic.
          setBeatIdx(0);
          setActiveScene(null);
          setAuto(true);
        }
        return next;
      });
    },
    [],
  );

  const toggleCollapse = useCallback((id: string) => {
    setSections((prev) =>
      prev.map((x) => (x.id === id ? { ...x, state: x.state === 'collapsed' ? 'normal' : 'collapsed' } : x)),
    );
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setSections((prev) =>
      prev.map((x) => {
        if (x.id !== id) {
          return { ...x, state: x.state === 'expanded' ? 'normal' : x.state };
        }
        return {
          ...x,
          state: x.state === 'expanded' ? 'normal' : 'expanded',
          size: x.state === 'expanded' ? 'md' : 'xl',
        };
      }),
    );
  }, []);

  return (
    <div
      className="absolute inset-0 flex flex-col min-h-0"
      data-agentic-demo
      style={{ overflow: 'hidden' }}
    >
      <div
        className="flex items-center gap-2 flex-shrink-0 px-3"
        style={{ height: 26, fontFamily: tokens.font.body, fontSize: 11, color: tokens.color.textMuted }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeScene
            ? (SCENES.find((sc) => sc.id === activeScene)?.label ?? activeScene)
            : (beat?.label ?? '…')}
          {' · '}
          {activeScene ? 'scène' : `${beatIdx + 1}/${beats.length}`} · {profile.bp}/{profile.cols}c
        </span>
        <select
          value={activeScene ?? ''}
          onChange={(e) => selectScene(e.target.value || null)}
          style={{ ...chip, background: 'transparent', border: `1px solid ${tokens.color.border}` }}
        >
          <option value="">Scène 0 · générique</option>
          {SCENES.map((sc) => (
            <option key={sc.id} value={sc.id}>{sc.label}</option>
          ))}
        </select>
        <button type="button" style={chip} onClick={() => setAuto((a) => !a)} disabled={!!activeScene}>
          {auto ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          style={chip}
          disabled={!!activeScene}
          onClick={() => {
            setAuto(false);
            setBeatIdx((i) => (i + 1) % beats.length);
          }}
        >
          Step
        </button>
        <button type="button" style={chip} onClick={goIdle}>
          Idle
        </button>
        {onExit ? (
          <button type="button" style={{ ...chip, color: tokens.color.accent }} onClick={onExit}>
            Esc
          </button>
        ) : null}
      </div>

      <div ref={surfaceRef} className="relative flex-1 min-h-0" style={{ overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {activeScene === 'graph-3d' ? (
            <motion.div
              key="graph3d"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              <Graph3DLab />
            </motion.div>
          ) : activeScene === 'neural-cell' ? (
            <motion.div
              key="neuralcell"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              <NeuralCellLab />
            </motion.div>
          ) : idle ? (
            <motion.div
              key="idle"
              className="absolute inset-0 flex flex-col items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.96, y: 40 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                layoutId="jarvis-orb-slot"
                style={{
                  width: 'min(100%, 340px)',
                  height: 'min(100%, 340px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                transition={hudSpatialTransition}
              >
                {lite ? (
                  <OrbLite state={orbState} size={280} />
                ) : (
                  <Orb
                    state={orbState}
                    volume={volume}
                    playbackVolume={playbackVolume}
                    lightMode={mode === 'light'}
                    simVoice
                  />
                )}
              </motion.div>
              <div className="mt-2 flex flex-col items-center gap-0.5">
                <span style={{ fontFamily: tokens.font.display, color: meta.color, fontSize: 15, fontWeight: 600 }}>
                  Veille
                </span>
                <span style={{ fontFamily: tokens.font.body, color: tokens.color.textMuted, fontSize: 11 }}>
                  Dis « jarvis… » pour commander
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="compose"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              style={{ overflow: 'hidden' }}
            >
              <Workspace
                nodes={nodes}
                space={{ availableWidth: canvasW, availableHeight: canvasH, gap: profile.gap }}
                renderContent={(node, entry) => renderBody(sectionById.get(node.id)!, tierToDensity(entry))}
                onClose={closeSection}
                onCollapse={toggleCollapse}
                onExpand={toggleExpand}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* VoiceBar : micro en idle · orbe en composition. Masquée sur Graphe 3D
          pour n'avoir qu'un contexte WebGL (l'orbe produit n'est pas le sujet). */}
      {activeScene === 'graph-3d' || activeScene === 'neural-cell' ? null : (
      <div className="relative z-20 w-full flex justify-center flex-shrink-0 pb-2 pt-1 px-3">
        <AnimatePresence mode="wait" initial={false}>
          {idle ? (
            <motion.div
              key="vb-mic"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.35 }}
              style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
            >
              <VoiceBar centerSlot="mic" />
            </motion.div>
          ) : (
            <motion.div
              key="vb-orb"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
            >
              <motion.div layoutId="jarvis-orb-slot" transition={hudSpatialTransition}>
                <VoiceBar centerSlot="orb" simVoice />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}
    </div>
  );
}

const chip: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: tokens.color.textMuted,
  fontFamily: tokens.font.body,
  fontSize: 11,
  cursor: 'pointer',
  padding: '2px 6px',
};
