import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Layers, ShieldAlert } from 'lucide-react';
import { useApp, OpenApp } from '../context/AppContext';
import { MiniOrb } from './MiniOrb';
import { NeuralMap } from './hermes/NeuralMap';
import { NodeDetailPanel } from './hermes/NodeDetailPanel';
import { HERMES_NODES, type NodeId } from './hermes/hermesNodes';
import { getAppById, VPS_ALLOWLIST, riskLabel } from '../apps/catalog';
import { MissionControlDev, CursorSurface } from './missionDev';
import { SystemMonitor } from './SystemMonitor';

const orbFont = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };
const raj = { fontFamily: 'Rajdhani, sans-serif' };

function isHermesNodeId(id: string): id is Exclude<NodeId, 'hermes'> {
  return id !== 'hermes' && id in HERMES_NODES;
}

/** Surface Hermes / VPS — pas de faux shell root */
function HermesSurface({ app }: { app: OpenApp }) {
  const meta = getAppById(app.id);
  const vps = Boolean(meta?.vpsLimited);
  const tool = meta?.hermesTool;

  return (
    <div className="h-full flex flex-col p-5 gap-4 overflow-auto">
      <div className="flex items-start gap-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: `radial-gradient(circle, ${app.color}25 0%, rgba(0,0,0,0.55) 100%)`, border: `1px solid ${app.color}40` }}
        >
          <app.icon className="w-8 h-8" style={{ color: app.color }} />
        </div>
        <div className="min-w-0">
          <p style={{ ...raj, color: 'rgba(255,255,255,0.9)', fontSize: 18, margin: 0 }}>{app.name}</p>
          <p style={{ ...mono, color: `${app.color}cc`, fontSize: 10, marginTop: 4 }}>
            {meta?.blurb || 'Piloté par Hermes'}
            {meta?.risk ? ` · ${riskLabel(meta.risk)}` : ''}
          </p>
          {tool && (
            <p style={{ ...mono, color: 'rgba(255,255,255,0.35)', fontSize: 9, marginTop: 6 }}>
              outil Hermes · {tool}
            </p>
          )}
        </div>
      </div>

      {vps && (
        <div
          className="rounded-xl p-3 flex gap-2"
          style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.35)' }}
        >
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#f43f5e' }} />
          <div>
            <p style={{ ...mono, color: '#f43f5e', fontSize: 10 }}>ACCÈS VPS LIMITÉ</p>
            <p style={{ ...mono, color: 'rgba(255,255,255,0.45)', fontSize: 9, lineHeight: 1.5, marginTop: 4 }}>
              Allowlist uniquement (status / logs / restart services jarvis-*). Pas de root, pas de rm -rf, pas de reboot libre.
              Toute action : Proposition → Policy → confirmation ADMIN.
            </p>
            <p style={{ ...mono, color: 'rgba(255,255,255,0.3)', fontSize: 8, marginTop: 8 }}>
              shell OK : {VPS_ALLOWLIST.shell.slice(0, 3).join(' · ')}…
            </p>
          </div>
        </div>
      )}

      <div
        className="flex-1 rounded-xl p-4"
        style={{ background: 'rgba(0,8,22,0.55)', border: `1px solid ${app.color}22` }}
      >
        {app.id === 'reach' ? (
          <>
            <p style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: 10, lineHeight: 1.65 }}>
              Agent-Reach = fetch Internet pour Hermes (pas un LLM). Dis « Jarvis cherche … »,
              « résume cette vidéo YouTube », « repo GitHub … ».
            </p>
            <p style={{ ...mono, color: `${app.color}99`, fontSize: 9, marginTop: 12, lineHeight: 1.5 }}>
              Paramétrage admin : Dashboard → Agent-Reach (doctor, cookies ~/.agent-reach).
              Install : pip install -e vendor/Agent-Reach-main && agent-reach install --env=auto --safe
            </p>
          </>
        ) : (
          <>
            <p style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: 10, lineHeight: 1.65 }}>
              Surface HUD prête. Le contenu live (stdout, fichiers, HA, média…) sera poussé par Hermes
              via l’outil déclaré — pas de simulation trompeuse ici.
            </p>
            <p style={{ ...mono, color: 'rgba(255,255,255,0.28)', fontSize: 9, marginTop: 12 }}>
              « Jarvis ouvre {app.name.toLowerCase()} » · skill hud-apps · tool_manager pour ajouter des outils.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function MockAppContent({ app }: { app: OpenApp }) {
  const { launchApp, missionControlDev } = useApp();

  if (app.id === 'jarvis') {
    return <NeuralMap />;
  }

  if (app.id === 'monitor') {
    return (
      <div className="h-full overflow-auto p-2">
        <SystemMonitor />
      </div>
    );
  }

  if (app.id === 'mission-control-dev') {
    return <MissionControlDev />;
  }

  if (app.id === 'cursor') {
    return <CursorSurface projectName={missionControlDev.projectName} />;
  }

  if (isHermesNodeId(app.id)) {
    return (
      <NodeDetailPanel
        id={app.id}
        variant="window"
        onSelectNode={id => {
          const n = HERMES_NODES[id];
          launchApp({ id: n.id, name: n.name, color: n.color, icon: n.icon });
        }}
      />
    );
  }

  // hub n’ouvre plus DashboardStage ici — openHudApp → requestDashboard
  return <HermesSurface app={app} />;
}

/* ------------------------------------------------------------------ */
/* Points de contrôle colorés (à la place des icônes classiques)       */
/* rouge = fermer · jaune = réduire · vert = agrandir                  */
/* ------------------------------------------------------------------ */

export function ControlDot({ color, label, onClick }: { color: string; label: string; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.35 }}
      whileTap={{ scale: 0.85 }}
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={label}
      aria-label={label}
      className="rounded-full cursor-pointer flex-shrink-0"
      style={{
        width: 11,
        height: 11,
        background: color,
        border: `1px solid ${color}`,
        boxShadow: `0 0 6px ${color}90`,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Fenêtre habillée (chrome holographique)                             */
/* ------------------------------------------------------------------ */

function AppWindow({ app, depth, maximized, onFocus, onClose, onMinimize, onToggleMaximize }: {
  app: OpenApp;
  depth: number;        // 0 = premier plan, 1..n = fond « time capsule »
  maximized: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
}) {
  const isFront = depth === 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96, y: 24 }}
      animate={{
        opacity: isFront ? 1 : Math.max(0.3, 0.65 - depth * 0.15),
        scale: isFront ? 1 : 1 - depth * 0.06,
        y: isFront ? 0 : -depth * 36,
        z: isFront ? 0 : -depth * 120,
        filter: isFront ? 'blur(0px)' : `blur(${Math.min(3, depth * 1.1)}px)`,
      }}
      exit={{ opacity: 0, scale: 0.96, y: 24 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      onClick={!isFront ? onFocus : undefined}
      className={`absolute rounded-2xl overflow-hidden flex flex-col max-w-full max-h-full ${
        maximized && isFront ? 'inset-0' : 'inset-1.5 sm:inset-2'
      }`}
      style={{
        zIndex: 50 - depth,
        cursor: isFront ? 'default' : 'pointer',
        transformStyle: 'preserve-3d',
        background: 'rgba(0, 10, 26, 0.88)',
        backdropFilter: 'blur(18px)',
        border: `1px solid ${app.color}${isFront ? '45' : '20'}`,
        boxShadow: isFront
          ? `0 0 40px ${app.color}22, inset 0 0 30px rgba(0,0,0,0.45)`
          : '0 0 20px rgba(0,0,0,0.5)',
      }}
    >
      {/* Barre de titre */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: `1px solid ${app.color}20`, background: 'rgba(0,6,18,0.6)' }}
      >
        {/* Points de contrôle en code couleur */}
        <div className="flex items-center gap-2 mr-1">
          <ControlDot color="#ef4444" label="Fermer" onClick={onClose} />
          <ControlDot color="#f59e0b" label="Réduire" onClick={onMinimize} />
          <ControlDot color="#22c55e" label={maximized ? 'Restaurer' : 'Agrandir'} onClick={onToggleMaximize} />
        </div>

        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: `${app.color}15`, border: `1px solid ${app.color}35` }}
        >
          <app.icon className="w-3.5 h-3.5" style={{ color: app.color }} />
        </div>
        <span style={{ ...orbFont, color: app.color, fontSize: 11, letterSpacing: '0.15em' }}>
          {app.name.toUpperCase()}
        </span>
        <div className="flex items-center gap-1.5 ml-3">
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: '#f59e0b' }}
          />
          <span style={{ ...mono, color: 'rgba(245,158,11,0.7)', fontSize: 8, letterSpacing: '0.1em' }}>
            FLUX AGENT — EN ATTENTE
          </span>
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 min-h-0">
        <MockAppContent app={app} />
      </div>

      {/* Voile de mise au fond : les fenêtres arrière ne captent que le clic focus */}
      {!isFront && <div className="absolute inset-0" style={{ background: 'rgba(0,4,12,0.25)' }} />}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Scène « time capsule » — état « apps » du HUD                        */
/* ------------------------------------------------------------------ */

export function AppStage() {
  const { openApps, activeAppId, focusApp, closeApp, minimizeApp } = useApp();
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const lastWheel = useRef(0);

  const visible = openApps.filter(a => !a.minimized);

  // Cursor post-mission → plein cadre
  useEffect(() => {
    if (activeAppId === 'cursor') setMaximizedId('cursor');
  }, [activeAppId]);

  // Ordre de profondeur : active au premier plan, les autres reculent
  const ordered = [
    ...visible.filter(a => a.id === activeAppId),
    ...visible.filter(a => a.id !== activeAppId).reverse(),
  ];

  // « Effet cahier » : molette (ou geste Holomat haut/bas) pour feuilleter la pile
  const handleWheel = (e: React.WheelEvent) => {
    if (ordered.length < 2) return;
    const now = Date.now();
    if (now - lastWheel.current < 450) return;
    lastWheel.current = now;
    if (e.deltaY > 0) {
      focusApp(ordered[1].id);                    // fenêtre suivante (derrière)
    } else if (e.deltaY < 0) {
      focusApp(ordered[ordered.length - 1].id);   // fenêtre du fond
    }
  };

  return (
    <div className="relative w-full h-full min-h-0 min-w-0 overflow-hidden" style={{ perspective: 1400 }} onWheel={handleWheel}>
      {/* Indicateur de pile */}
      {ordered.length > 1 && (
        <div
          className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full pointer-events-none"
          style={{ zIndex: 95, background: 'rgba(0,8,22,0.8)', border: '1px solid rgba(0,245,255,0.2)' }}
        >
          <Layers className="w-2.5 h-2.5" style={{ color: '#00f5ff' }} />
          <span style={{ ...mono, color: 'rgba(0,245,255,0.7)', fontSize: 8, letterSpacing: '0.1em' }}>
            {ordered.length} FENÊTRES — MOLETTE / GESTE POUR FEUILLETER
          </span>
        </div>
      )}

      <div className="absolute inset-0 overflow-hidden" style={{ transformStyle: 'preserve-3d' }}>
        <AnimatePresence>
          {ordered.map((app, i) => (
            <AppWindow
              key={app.id}
              app={app}
              depth={i}
              maximized={maximizedId === app.id}
              onFocus={() => focusApp(app.id)}
              onClose={() => closeApp(app.id)}
              onMinimize={() => minimizeApp(app.id)}
              onToggleMaximize={() => setMaximizedId(m => (m === app.id ? null : app.id))}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Orbe bas-droite de la colonne centre (panneau chat reste à droite du HUD) */}
      <MiniOrb corner="right" />
    </div>
  );
}
