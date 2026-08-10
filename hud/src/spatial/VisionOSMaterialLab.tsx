/**
 * VisionOS Material Lab — `?lab=vision`
 * Fond dégradé (sans icônes bureau) + Clair/Nuit + transformation Vision
 * de l’agentic + planche HUD (auth / boot / check / shell / orbe…).
 */
import React, { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { GlassButton } from './GlassButton/GlassButton';
import { GlassCard } from './GlassCard/GlassCard';
import { GlassPanel } from './GlassPanel/GlassPanel';
import { GlassSurface } from './GlassSurface/GlassSurface';
import { SpatialWindow } from './SpatialWindow/SpatialWindow';
import { SpatialBackdrop } from './SpatialBackdrop/SpatialBackdrop';
import { SpatialThemeProvider, type SpatialMode, useSpatialTheme } from './theme/SpatialTheme';
import {
  definitions,
  getRenderer,
  normalizeState,
  validateProps,
  type AgenticProps,
} from '../agentic/registry';
import {
  SystemBootOverlay,
  INITIAL_BOOT_CHECKS,
  type BootCheck,
} from '../app/components/auth/SystemBootGate';
import { AuthVoiceWave } from '../app/components/auth/AuthVoiceWave';
import { HoloFace } from '../app/components/auth/HoloFace';
import { FaceCamView } from '../app/components/auth/FaceCamView';
import {
  GlassPanel as ProductGlassPanel,
  GlassCard as ProductGlassCard,
  GlassButton as ProductGlassButton,
  GlassPill,
  GlassDock,
} from '../components/glass';
import { AppProvider } from '../app/context/AppContext';
import { TopBar } from '../app/components/TopBar';
import { AppDock } from '../app/components/AppDock';
import { SystemMonitor } from '../app/components/SystemMonitor';
import { VoiceBar } from '../app/components/VoiceBar';
import { MiniOrb } from '../app/components/MiniOrb';
import { NotificationSystem } from '../app/components/NotificationSystem';
import { Orb } from '../app/components/orb';

const SAMPLE_PROPS: Record<string, Record<string, unknown>> = {
  ActionRequest: {
    label: 'Rafraîchir le système',
    action: 'system.refresh',
    detail: 'Démo lab — intention seulement.',
  },
  ApprovalCard: {
    approvalId: 'lab-demo',
    action: 'service.restart',
    gravity: 'admin',
    reason: 'Démo lab — aucune autorisation réelle.',
  },
  ResultPanel: {
    title: 'Résultat',
    body: 'Opération simulée OK.',
    source: 'lab',
    items: ['item A', 'item B'],
  },
  SectionHeader: { title: 'SECTION LAB', subtitle: 'Catalogue agentic' },
  StatCard: { label: 'CPU', value: '42', unit: '%', tone: 'cyan', hint: 'demo' },
  InfoCard: { title: 'Info', body: 'Brique InfoCard du registre agentic.' },
  StatusBadge: { label: 'ONLINE', status: 'ok' },
  AvatarChip: { name: 'JARVIS', role: 'Core', initials: 'JV' },
  LinkList: {
    title: 'Liens',
    items: ['https://jarvis.local/docs', 'https://jarvis.local/hud'],
  },
  KeyValueList: {
    title: 'Détails',
    rows: [
      { key: 'Host', value: 'NUC' },
      { key: 'Mode', value: 'lab' },
    ],
  },
  DataTable: {
    title: 'Services',
    columns: ['Service', 'Status'],
    rows: [
      ['jarvis-core', 'up'],
      ['jarvis-hud', 'up'],
    ],
  },
  MetricChart: {
    label: 'Load',
    series: [12, 28, 22, 40, 35, 48, 42],
    tone: 'cyan',
  },
  DialogCard: {
    dialogId: 'lab-dialog',
    title: 'Confirmer',
    body: 'Dialogue agentic de démo.',
    confirmLabel: 'OK',
    cancelLabel: 'Annuler',
  },
  ToastStack: {
    items: [
      { text: 'Toast lab', tone: 'cyan' },
      { text: 'Attention démo', tone: 'amber' },
    ],
  },
  ServiceHub: {
    title: 'Services',
    services: [
      { id: 'core', name: 'Core', status: 'up' },
      { id: 'hud', name: 'HUD', status: 'up' },
      { id: 'voice', name: 'Voice', status: 'degraded' },
    ],
  },
  CameraPreview: { mirrored: true, opacity: 1 },
};

function noopEmit(_action: string, _payload?: Record<string, unknown>) {}

class TileErrorBoundary extends Component<
  { name: string; children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err.message || 'render error' };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 12, fontSize: 12, color: 'rgba(255,80,80,0.9)' }}>
          {this.props.name}: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

function SectionLabel({ children }: { children: ReactNode }) {
  const theme = useSpatialTheme();
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: theme.textMuted,
        marginBottom: 14,
        marginTop: 8,
      }}
    >
      {children}
    </div>
  );
}

function PreviewFrame({
  title,
  subtitle,
  height = 320,
  children,
}: {
  title: string;
  subtitle?: string;
  height?: number;
  children: ReactNode;
}) {
  const theme = useSpatialTheme();
  return (
    <GlassSurface material="ultraThin" elevation="elevated" padding="md" radius="xl" dynamicLight>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{title}</div>
        {subtitle ? (
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{subtitle}</div>
        ) : null}
      </div>
      <div
        style={{
          position: 'relative',
          height,
          borderRadius: 20,
          overflow: 'hidden',
          border: `1px solid rgba(${theme.mode === 'light' ? '0,0,0' : '255,255,255'}, 0.08)`,
          background: theme.mode === 'light' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
        }}
      >
        <TileErrorBoundary name={title}>{children}</TileErrorBoundary>
      </div>
    </GlassSurface>
  );
}

function AgenticTile({ name }: { name: string }) {
  const theme = useSpatialTheme();
  const def = definitions[name as keyof typeof definitions];
  const Renderer = getRenderer(name);

  const agentic = useMemo((): AgenticProps | null => {
    if (!Renderer || !def) return null;
    const raw = SAMPLE_PROPS[name] ?? {};
    const { props } = validateProps(name, raw);
    return {
      id: `lab-${name}`,
      props,
      state: normalizeState(name, def.states[0]),
      emit: noopEmit,
      children: null,
    };
  }, [Renderer, def, name]);

  if (!Renderer || !def || !agentic) {
    return (
      <GlassSurface material="thin" padding="md">
        <span style={{ color: theme.textMuted, fontSize: 12 }}>Missing: {name}</span>
      </GlassSurface>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
          alignItems: 'baseline',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: theme.textMuted,
            }}
          >
            {def.category}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{name}</div>
        </div>
        <div style={{ fontSize: 10, color: theme.textMuted }}>{def.preferredSize}</div>
      </div>
      <div style={{ minHeight: 72, maxHeight: 300, overflow: 'auto', borderRadius: 16 }}>
        <TileErrorBoundary name={name}>
          <Renderer {...agentic} />
        </TileErrorBoundary>
      </div>
    </div>
  );
}

const MOCK_BOOT_CHECKS: BootCheck[] = INITIAL_BOOT_CHECKS.map((c, i) => ({
  ...c,
  status: i < 3 ? 'ok' : i === 3 ? 'loading' : 'pending',
}));

function LabBody() {
  const theme = useSpatialTheme();
  const names = useMemo(() => Object.keys(definitions).sort(), []);
  const libraryNames = names.filter((n) =>
    [
      'ActionRequest',
      'ApprovalCard',
      'ResultPanel',
      'SectionHeader',
      'StatCard',
      'InfoCard',
      'StatusBadge',
      'AvatarChip',
      'LinkList',
      'KeyValueList',
      'DataTable',
      'MetricChart',
      'DialogCard',
      'ToastStack',
      'ServiceHub',
    ].includes(n),
  );
  const productAgentic = names.filter((n) => !libraryNames.includes(n));

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        padding: '28px 24px 80px',
        maxWidth: 1220,
        margin: '0 auto',
        color: theme.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 28,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              letterSpacing: '0.08em',
              color: `rgba(${theme.accent},0.95)`,
              marginBottom: 8,
            }}
          >
            JARVIS · VISION LAB
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 650, letterSpacing: '-0.03em', margin: 0 }}>
            Material + HUD showcase
          </h1>
          <p style={{ marginTop: 8, color: theme.textMuted, maxWidth: 620, lineHeight: 1.5, fontSize: 13 }}>
            Fond dégradé (sans icônes bureau). Clair / nuit. Agentic en Vision. Planche auth / boot /
            check / shell pour valider la transformation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <GlassButton
            tone={theme.mode === 'light' ? 'accent' : 'neutral'}
            onClick={() => window.dispatchEvent(new CustomEvent('spatial-lab-set-mode', { detail: 'light' }))}
          >
            Clair
          </GlassButton>
          <GlassButton
            tone={theme.mode === 'night' ? 'accent' : 'neutral'}
            onClick={() => window.dispatchEvent(new CustomEvent('spatial-lab-set-mode', { detail: 'night' }))}
          >
            Nuit
          </GlassButton>
          <GlassButton onClick={() => { window.location.search = '?boot=lab'; }}>Boot cinématique</GlassButton>
          <GlassButton onClick={() => { window.location.search = ''; }}>HUD produit</GlassButton>
        </div>
      </header>

      {/* —— Spatial —— */}
      <SectionLabel>1 · Spatial primitives</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
          marginBottom: 36,
        }}
      >
        <SpatialWindow title="Glass Window" subtitle="Parallax léger" material="regular" elevation="elevated" parallax>
          <p style={{ margin: 0, fontSize: 13, color: theme.textMuted }}>Fenêtre spatiale.</p>
        </SpatialWindow>
        <GlassCard eyebrow="Material" title="Glass Card" subtitle="ultraThin → thick" material="thin" interactive>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(['ultraThin', 'thin', 'regular', 'thick'] as const).map((m) => (
              <GlassSurface key={m} material={m} elevation="surface" padding="sm" radius="md">
                <span style={{ fontSize: 12 }}>{m}</span>
              </GlassSurface>
            ))}
          </div>
        </GlassCard>
        <GlassPanel material="thin" dynamicLight>
          <SectionLabel>Buttons</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <GlassButton>Neutral</GlassButton>
            <GlassButton tone="accent">Accent</GlassButton>
            <GlassButton tone="danger">Danger</GlassButton>
          </div>
        </GlassPanel>
      </div>

      {/* —— Auth / Boot / Check —— */}
      <SectionLabel>2 · Auth · Boot check · Identity</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 16,
          marginBottom: 36,
        }}
      >
        <PreviewFrame title="SystemBootOverlay" subtitle="Checklist services (mock)" height={380}>
          <SystemBootOverlay
            checks={MOCK_BOOT_CHECKS}
            msg="VÉRIFICATION SYSTÈME"
            subtext="Lab — états simulés"
            blocked={false}
          />
        </PreviewFrame>

        <PreviewFrame title="HoloFace" subtitle="phases scanning / ok" height={280}>
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 16 }}>
            <div style={{ width: 200, height: 220 }}>
              <HoloFace phase="scanning" progress={0.62} />
            </div>
          </div>
        </PreviewFrame>

        <PreviewFrame title="AuthVoiceWave" subtitle="listening" height={160}>
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <AuthVoiceWave mode="listening" level={0.55} />
          </div>
        </PreviewFrame>

        <PreviewFrame title="FaceCamView" subtitle="cam inactive (pas d’open)" height={280}>
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 16 }}>
            <FaceCamView active={false} progress={35} label="VISAGE" />
          </div>
        </PreviewFrame>

        <PreviewFrame title="Orb" subtitle="thinking" height={200}>
          <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
            <div style={{ width: 120, height: 120 }}>
              <Orb state="thinking" volume={0.35} playbackVolume={0} />
            </div>
          </div>
        </PreviewFrame>

        <GlassSurface material="thin" elevation="elevated" padding="lg" radius="xl">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Flux complets</div>
          <p style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5, margin: '0 0 12px' }}>
            AuthScene / FirstSetup / LockScene / InstallWelcome sont full-screen + Core WS — hors
            montage isolé. Ouvre le HUD produit ou <code>?boot=lab</code> pour la cinématique.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <GlassButton tone="accent" onClick={() => { window.location.search = ''; }}>
              Ouvrir Auth / HUD
            </GlassButton>
            <GlassButton onClick={() => { window.location.search = '?boot=lab'; }}>
              BootScene lab
            </GlassButton>
          </div>
        </GlassSurface>
      </div>

      {/* —— Product glass (ancien) vs spatial —— */}
      <SectionLabel>3 · Glass produit (legacy) — à migrer</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 36,
        }}
      >
        <ProductGlassPanel level="regular" padding="md">
          <div style={{ fontSize: 13, marginBottom: 8 }}>Product GlassPanel</div>
          <ProductGlassButton tone="accent">GlassButton</ProductGlassButton>
          <div style={{ marginTop: 10 }}>
            <GlassPill tone="success">OK</GlassPill>
          </div>
        </ProductGlassPanel>
        <ProductGlassCard eyebrow="Legacy" title="GlassCard" subtitle="components/glass">
          Encore utilisé dans auth InstallWelcome / dock.
        </ProductGlassCard>
        <GlassDock style={{ minHeight: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <GlassPill>Dock</GlassPill>
          <GlassPill tone="accent">Apps</GlassPill>
        </GlassDock>
      </div>

      {/* —— Shell HUD (AppProvider) —— */}
      <SectionLabel>4 · Shell HUD (TopBar / Dock / Voice / Monitor)</SectionLabel>
      <AppProvider>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 36 }}>
          <PreviewFrame title="TopBar" subtitle="AppProvider" height={72}>
            <div style={{ position: 'relative', height: '100%' }}>
              <TileErrorBoundary name="TopBar">
                <TopBar />
              </TileErrorBoundary>
            </div>
          </PreviewFrame>
          <PreviewFrame title="AppDock" height={88}>
            <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <TileErrorBoundary name="AppDock">
                <AppDock />
              </TileErrorBoundary>
            </div>
          </PreviewFrame>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            <PreviewFrame title="SystemMonitor" height={260}>
              <TileErrorBoundary name="SystemMonitor">
                <SystemMonitor />
              </TileErrorBoundary>
            </PreviewFrame>
            <PreviewFrame title="VoiceBar" height={120}>
              <TileErrorBoundary name="VoiceBar">
                <VoiceBar />
              </TileErrorBoundary>
            </PreviewFrame>
            <PreviewFrame title="MiniOrb + Notifications" height={160}>
              <TileErrorBoundary name="MiniOrb">
                <div style={{ position: 'relative', height: '100%', padding: 12 }}>
                  <MiniOrb />
                  <NotificationSystem />
                </div>
              </TileErrorBoundary>
            </PreviewFrame>
          </div>
        </div>
      </AppProvider>

      {/* —— Agentic Vision —— */}
      <SectionLabel>5 · Agentic library (Vision)</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          marginBottom: 36,
          alignItems: 'start',
        }}
      >
        {libraryNames.map((name) => (
          <AgenticTile key={name} name={name} />
        ))}
      </div>

      <SectionLabel>6 · Agentic → panneaux produit (registre)</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 16,
          marginBottom: 24,
          alignItems: 'start',
        }}
      >
        <AppProvider>
          {productAgentic.map((name) => (
            <AgenticTile key={name} name={name} />
          ))}
        </AppProvider>
      </div>

      <footer style={{ marginTop: 28, fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>
        Lab test · <code>?lab=vision&theme=light|night</code> · Boot cinématique <code>?boot=lab</code> ·
        Quitter : retire <code>lab=vision</code>.
      </footer>
    </div>
  );
}

export function VisionOSMaterialLab() {
  const [mode, setMode] = useState<SpatialMode>(() => {
    const q = new URLSearchParams(window.location.search).get('theme');
    return q === 'light' ? 'light' : 'night';
  });

  useEffect(() => {
    document.documentElement.classList.add('spatial-lab');
    document.documentElement.dataset.spatialMode = mode;
    const onSet = (e: Event) => {
      const m = (e as CustomEvent<SpatialMode>).detail;
      if (m !== 'light' && m !== 'night') return;
      setMode(m);
      const url = new URL(window.location.href);
      url.searchParams.set('theme', m);
      window.history.replaceState({}, '', url);
    };
    window.addEventListener('spatial-lab-set-mode', onSet as EventListener);
    return () => {
      document.documentElement.classList.remove('spatial-lab');
      delete document.documentElement.dataset.spatialMode;
      window.removeEventListener('spatial-lab-set-mode', onSet as EventListener);
    };
  }, [mode]);

  return (
    <SpatialThemeProvider mode={mode}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 500, overflow: 'auto' }}>
        <SpatialBackdrop mode={mode} />
        <TileErrorBoundary name="VisionOSMaterialLab">
          <LabBody />
        </TileErrorBoundary>
      </div>
    </SpatialThemeProvider>
  );
}

export default VisionOSMaterialLab;
