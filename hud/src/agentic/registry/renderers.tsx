/**
 * Registre agentique — RENDERERS.
 *
 * L'autre moitié du registre : nom → composant React réel.
 *
 * ⚠ **Règle P6 : une brique qui existe en produit est IMPORTÉE, jamais
 * réécrite.** Le 2026-08-03, une bibliothèque parallèle a réimplémenté l'orbe
 * au lieu d'importer `JarvisOrb` — on s'est retrouvé avec trois orbes.
 * Ici, `SystemMonitor` est le composant produit, celui que le HUD affiche
 * déjà dans son panneau de gauche. Pas une copie, pas une variante.
 */

import { CameraPreview } from '../../app/components/CameraPreview';
import { CommandConsole } from '../../app/components/CommandConsole';
import { GesturePanel } from '../../app/components/GesturePanel';
import { ImageViewer as ImageViewerComponent } from '../components/media/ImageViewer';
import { LiveStream as LiveStreamComponent } from '../components/media/LiveStream';
import { MemoryPanel } from '../../app/components/MemoryPanel';
import { ScanningPanel } from '../../app/components/ScanningPanel';
import { SettingsPanel } from '../../app/components/SettingsPanel';
import { SystemMonitor } from '../../app/components/SystemMonitor';
import { VoiceBar } from '../../app/components/VoiceBar';
import { ActionRequest } from '../library/ActionRequest';
import { ApprovalCard } from '../library/ApprovalCard';
import {
  AvatarChip,
  DataTable,
  DialogCard,
  InfoCard,
  KeyValueList,
  LinkList,
  MetricChart,
  SectionHeader,
  ServiceHub,
  StatCard,
  StatusBadge,
  ToastStack,
} from '../library/Primitives';
import { ResultPanel } from '../library/ResultPanel';
import { ToolCall } from '../library/ToolCall';
import { VerificationCard } from '../library/VerificationCard';

// —— Catalogue Agentic UI production (agentic/components/*) ————————————
import { ExecutionStatus, StatusCard, ToolResult } from '../components/agent';
import { DevIssueBoard } from '../components/agent/DevIssueBoard';
import { ChartCard, TimelineChart } from '../components/charts';
import { DataList, EventList, LogViewer, TreeView } from '../components/data';
import { Screenshot } from '../components/media';
import { Gauge, MetricCard, MetricGrid, Progress, StatList } from '../components/metrics';
import { Breadcrumb, CommandBar, FilterBar, SearchBar, TabBar } from '../components/navigation';
import {
  DeviceCard,
  DeviceGrid,
  HealthOverview,
  ProcessList,
  Terminal,
} from '../components/system';
import { CodeBlock, MarkdownBlock, MessageCard, QuoteBlock, TextBlock } from '../components/text';
import { Graph3D, type Graph3DModel } from '../components/graph3d';

import type { RegisteredName } from './definitions';

/**
 * Ce que reçoit un composant rendu par une surface.
 *
 * `props` est déjà validé contre le schéma du catalogue, `state` garanti
 * présent dans les états déclarés. `emit` est le SEUL canal remontant : un
 * composant ne fait jamais d'effet de bord, il déclare une intention et le
 * Core décide (§7).
 */
export interface AgenticProps {
  id: string;
  props: Record<string, unknown>;
  state: string;
  emit: (action: string, payload?: Record<string, unknown>) => void;
  children: React.ReactNode;
}

/**
 * `Record<RegisteredName, ...>` et non `Record<string, ...>` : TypeScript
 * refuse alors de compiler si une définition n'a pas son renderer, ou
 * l'inverse. La correspondance est vérifiée à la compilation, pas découverte
 * à l'écran.
 */
export const renderers: Record<RegisteredName, React.FC<AgenticProps>> = {
  // Aucune prop transmise : ces panneaux lisent leur propre passerelle ou leur
  // contexte. L'agent a décidé de les AFFICHER, pas de ce qu'ils contiennent.
  // C'est la règle : l'agent compose le placement, jamais les internes.
  SystemMonitor: () => <SystemMonitor />,
  MemoryPanel: () => <MemoryPanel />,
  CommandConsole: () => <CommandConsole />,
  GesturePanel: () => <GesturePanel />,
  ScanningPanel: () => <ScanningPanel />,
  SettingsPanel: () => <SettingsPanel />,
  VoiceBar: () => <VoiceBar />,
  // Seule exception à la règle « aucune prop transmise » : `CameraPreview` en
  // accepte deux, déclarées au catalogue et donc validées avant d'arriver ici.
  // L'agent choisit un miroir ou une opacité, jamais une source vidéo — le flux
  // reste celui que le composant ouvre lui-même.
  CameraPreview: ({ props }) => (
    <CameraPreview
      mirrored={props.mirrored as boolean}
      opacity={props.opacity as number}
    />
  ),
  // Ces deux-là reçoivent leurs props : ce sont des briques agentiques, pas
  // des panneaux produit. Elles n'existent que pour la surface.
  ActionRequest,
  ApprovalCard,
  ResultPanel,
  // Source explicitement fournie par le Core (snapshot / flux salon) — pas de
  // getUserMedia ici, à la différence de CameraPreview ci-dessus (règle P6 :
  // la brique existante `media/ImageViewer` est importée, pas réécrite).
  ImageViewer: ({ props }) => (
    <ImageViewerComponent
      src={props.src as string}
      alt={props.alt as string}
      caption={props.caption as string}
    />
  ),
  LiveStream: ({ props }) => (
    <LiveStreamComponent
      src={props.src as string}
      caption={props.caption as string}
      muted={props.muted as boolean}
    />
  ),
  SectionHeader,
  StatCard,
  InfoCard,
  StatusBadge,
  AvatarChip,
  LinkList,
  KeyValueList,
  DataTable,
  MetricChart,
  DialogCard,
  ToastStack,
  ServiceHub,
  ToolCall,
  VerificationCard,

  // —— Catalogue Agentic UI production (agentic/components/*) ——————————
  Gauge: ({ props }) => (
    <Gauge label={props.label as string | undefined} value={props.value as number} tone={props.tone as never} />
  ),
  MetricCard: ({ props }) => (
    <MetricCard
      label={props.label as string}
      value={props.value as string}
      unit={props.unit as string | undefined}
      hint={props.hint as string | undefined}
      icon={props.icon as never}
      tone={props.tone as never}
      trend={props.trend as never}
      fields={props.fields as never}
    />
  ),
  MetricGrid: ({ props }) => (
    <MetricGrid items={props.items as never} columns={props.columns as number} />
  ),
  Progress: ({ props }) => (
    <Progress label={props.label as string | undefined} value={props.value as number} tone={props.tone as never} />
  ),
  StatList: ({ props }) => (
    <StatList title={props.title as string | undefined} items={props.items as never} />
  ),
  ChartCard: ({ props }) => (
    <ChartCard
      type={props.type as never}
      label={props.label as string | undefined}
      data={props.data as never}
      tone={props.tone as never}
      aspectRatio={props.aspectRatio as number | undefined}
    />
  ),
  TimelineChart: ({ props }) => (
    <TimelineChart label={props.label as string | undefined} items={props.items as never} />
  ),
  DataList: ({ props }) => (
    <DataList title={props.title as string | undefined} items={props.items as never} />
  ),
  EventList: ({ props }) => (
    <EventList title={props.title as string | undefined} items={props.items as never} />
  ),
  LogViewer: ({ props }) => (
    <LogViewer title={props.title as string | undefined} lines={props.lines as never} />
  ),
  TreeView: ({ props }) => (
    <TreeView title={props.title as string | undefined} nodes={props.nodes as never} />
  ),
  DeviceCard: ({ props }) => (
    <DeviceCard
      icon={props.icon as never}
      name={props.name as string}
      status={props.status as string}
      detail={props.detail as string | undefined}
    />
  ),
  DeviceGrid: ({ props }) => (
    <DeviceGrid items={props.items as never} columns={props.columns as number} />
  ),
  ProcessList: ({ props }) => (
    <ProcessList title={props.title as string | undefined} rows={props.rows as never} />
  ),
  Terminal: ({ props }) => (
    <Terminal
      title={props.title as string | undefined}
      lines={props.lines as string[]}
      cursor={props.cursor as boolean}
    />
  ),
  HealthOverview: ({ props }) => (
    <HealthOverview
      services={props.services as never}
      uptime={props.uptime as string | undefined}
      cpu={props.cpu as number | undefined}
      memory={props.memory as number | undefined}
    />
  ),
  Breadcrumb: ({ props }) => <Breadcrumb items={props.items as string[]} />,
  CommandBar: ({ props }) => <CommandBar items={props.items as never} />,
  // Décoratifs mais branchés : la bascule/frappe émet une intention réelle,
  // le Core choisit d'y répondre ou non (même règle que ActionRequest).
  FilterBar: ({ props, emit }) => (
    <FilterBar
      chips={props.chips as never}
      activeIds={props.activeIds as string[]}
      onToggle={(id) => emit('filter.toggle', { id })}
    />
  ),
  SearchBar: ({ props, emit }) => (
    <SearchBar
      placeholder={props.placeholder as string}
      value={props.value as string}
      onChange={(value) => emit('search.change', { value })}
    />
  ),
  TabBar: ({ props, emit }) => (
    <TabBar
      tabs={props.tabs as never}
      activeId={props.activeId as string}
      variant={props.variant as never}
      onSelect={(id) => emit('tab.select', { id })}
    />
  ),
  CodeBlock: ({ props }) => (
    <CodeBlock code={props.code as string} language={props.language as string | undefined} />
  ),
  MarkdownBlock: ({ props }) => <MarkdownBlock source={props.source as string} />,
  MessageCard: ({ props }) => (
    <MessageCard
      author={props.author as string}
      identity={props.identity as string | undefined}
      text={props.text as string}
      timestamp={props.timestamp as string | undefined}
    />
  ),
  QuoteBlock: ({ props }) => (
    <QuoteBlock text={props.text as string} cite={props.cite as string | undefined} />
  ),
  TextBlock: ({ props }) => (
    <TextBlock title={props.title as string | undefined} text={props.text as string} />
  ),
  Screenshot: ({ props }) => (
    <Screenshot
      src={props.src as string}
      alt={props.alt as string}
      caption={props.caption as string}
      windowTitle={props.windowTitle as string}
    />
  ),
  ExecutionStatus: ({ props }) => (
    <ExecutionStatus label={props.label as string} stage={props.stage as never} />
  ),
  StatusCard: ({ props }) => (
    <StatusCard
      title={props.title as string}
      body={props.body as string | undefined}
      tone={props.tone as never}
      icon={props.icon as never}
    />
  ),
  ToolResult: ({ props }) => (
    <ToolResult
      tool={props.tool as string}
      status={props.status as string}
      output={props.output as string | undefined}
    />
  ),
  Graph3D: ({ props, emit }) => (
    <Graph3D
      model={(props.model as Graph3DModel | undefined) ?? { nodes: [], edges: [] }}
      layout={props.layout as never}
      level={props.level as never}
      focus={(props.focus as string | null | undefined) ?? null}
      particleCount={props.particleCount as number | undefined}
      showEdges={props.showEdges as boolean}
      showDecorativeLinks={props.showDecorativeLinks as boolean}
      showLabels={props.showLabels as boolean}
      projectionBase={props.projectionBase as boolean}
      onFocusChange={(id) => emit('focus', { nodeId: id })}
    />
  ),
  DevIssueBoard: ({ props }) => (
    <DevIssueBoard
      title={props.title as string | undefined}
      columns={props.columns as string[] | undefined}
      issues={props.issues as never}
      inbox_count={props.inbox_count as number | undefined}
      inbox_blocked={props.inbox_blocked as never}
      inbox_review={props.inbox_review as never}
      voice_hint={props.voice_hint as string | undefined}
    />
  ),
};
