import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Layers, ShieldAlert } from 'lucide-react';
import { useApp, type OpenApp } from '../context/AppContext';
import { MiniOrb } from './MiniOrb';
import { NeuralMap } from './hermes/NeuralMap';
import { NodeDetailPanel } from './hermes/NodeDetailPanel';
import { HERMES_NODES, type NodeId } from './hermes/hermesNodes';
import { getAppById, VPS_ALLOWLIST, riskLabel } from '../apps/catalog';
import { MissionControlDev, CursorSurface } from './missionDev';
import { SystemMonitor } from './SystemMonitor';
import { AgentSurface } from '../../agentic/AgentSurface';
import { VisionLiveSurface } from './VisionLiveSurface';
import { glassLevel, tokens } from '../../ui/tokens';
import { bodyFont, monoFont, orbFont, DANGER, MUTED, SUCCESS, TEXT, WARNING } from './hudTheme';
import { visionBody, visionCaption } from './visionChrome';

function isHermesNodeId(id: string): id is Exclude<NodeId, 'hermes'> {
  return id !== 'hermes' && id in HERMES_NODES;
}

/** Fenêtre d'attente d'une surface — pas de faux shell root */
function HermesSurface({ app }: { app: OpenApp }) {
  const meta = getAppById(app.id);
  const vps = Boolean(meta?.vpsLimited);
  // L'intention, pas l'outil : le nom de l'exécutant n'a jamais sa place à l'écran.
  const tool = meta?.intent;
  const soon = meta?.status === 'soon';

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
          <p style={{ ...bodyFont, color: TEXT, fontSize: 18, margin: 0 }}>{app.name}</p>
          <p style={{ ...monoFont, color: `${app.color}cc`, fontSize: 10, marginTop: 4 }}>
            {soon
              ? 'Intention déclarée — exécutant pas encore câblé'
              : (meta?.blurb || 'En attente du Core')}
            {meta?.risk ? ` · ${riskLabel(meta.risk)}` : ''}
          </p>
          {tool && (
            <p style={{ ...monoFont, color: MUTED, fontSize: 9, marginTop: 6, letterSpacing: '0.02em' }}>
              intention · {tool}{soon ? ' · Bientôt' : ''}
            </p>
          )}
        </div>
      </div>

      {soon && (
        <div
          className="rounded-xl p-3"
          style={{ background: tokens.color.accentSoft, border: `1px solid ${WARNING}55` }}
        >
          <p style={{ ...monoFont, color: WARNING, fontSize: 10, letterSpacing: '0.02em' }}>Capacité non exécutable</p>
          <p style={{ ...visionBody, fontSize: 11, marginTop: 4 }}>
            Tuile visible exprès. Le Core refuse avec une raison plutôt que de
            faire semblant. Dashboard → Applications pour Prêt / Surface / Bientôt.
          </p>
        </div>
      )}

      {vps && (
        <div
          className="rounded-xl p-3 flex gap-2"
          style={{ background: `color-mix(in srgb, ${DANGER} 8%, transparent)`, border: `1px solid ${DANGER}55` }}
        >
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: DANGER }} />
          <div>
            <p style={{ ...monoFont, color: DANGER, fontSize: 10, letterSpacing: '0.02em' }}>Accès VPS limité</p>
            <p style={{ ...visionBody, fontSize: 11, marginTop: 4 }}>
              Allowlist uniquement (status / logs / restart services jarvis-*). Pas de root, pas de rm -rf, pas de reboot libre.
              Toute action : Proposition → Policy → confirmation Admin.
            </p>
            <p style={{ ...monoFont, color: MUTED, fontSize: 8, marginTop: 8, letterSpacing: '0.02em' }}>
              shell OK : {VPS_ALLOWLIST.shell.slice(0, 3).join(' · ')}…
            </p>
          </div>
        </div>
      )}

      <div
        className="flex-1 rounded-xl p-4"
        style={{ background: tokens.color.surface, border: `1px solid ${tokens.color.border}` }}
      >
        {app.id === 'reach' ? (
          <>
            <p style={{ ...visionBody, fontSize: 11 }}>
              En attente du résultat de recherche…
            </p>
            <p style={{ ...monoFont, color: `${app.color}99`, fontSize: 9, marginTop: 12, lineHeight: 1.5, letterSpacing: '0.02em' }}>
              Dites « Jarvis cherche … ». Le Core pousse un ResultPanel ici
              (pas une page d’aide). Si ça reste vide : Hermes timeout — Google
              s’ouvre en secours.
            </p>
          </>
        ) : soon ? (
          <p style={{ ...visionBody, fontSize: 11 }}>
            Surface agentic non générée pour cette intention. Les capacités câblées
            (maison, médias, sécurité…) composent une vraie surface.
          </p>
        ) : (
          <>
            <p style={{ ...visionBody, fontSize: 11 }}>
              Surface HUD prête. Le contenu live (stdout, fichiers, HA, média…) sera poussé par Hermes
              via l’outil déclaré — pas de simulation trompeuse ici.
            </p>
            <p style={{ ...visionCaption, fontSize: 10, marginTop: 12 }}>
              « Jarvis ouvre {app.name.toLowerCase()} » · skill hud-apps · tool_manager pour ajouter des outils.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Résout le contenu d'une « app »/surface ouverte — exporté pour être
 * réutilisé tel quel par le canevas agentic plein écran (App.tsx, G1a),
 * qui n'est pas une fenêtre AppStage mais doit résoudre le même contenu.
 */
export function MockAppContent({ app }: { app: OpenApp }) {
  const { launchApp, missionControlDev } = useApp();

  if (app.id === 'jarvis') {
    return <NeuralMap />;
  }

  if (app.id === 'monitor') {
    return (
      <AgentSurface
        surfaceId="monitor"
        fallback={
          <div className="h-full overflow-auto p-2">
            <SystemMonitor />
          </div>
        }
      />
    );
  }

  if (app.id === 'vision') {
    return (
      <AgentSurface
        surfaceId="vision"
        composeQuestion="Compose l'interface Holomat / vision."
        fallback={<VisionLiveSurface />}
      />
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
  //
  // Si JARVIS a composé une surface pour cette app, elle en devient le contenu
  // de la fenêtre. Sinon : exactement ce qui s'affichait avant. Le repli rend
  // le branchement non destructif — cf. docs/architecture/JARVIS-Agentic-UI.md
  //
  // `composeQuestion` est la question posée au composeur si l'utilisateur
  // demande une composition. Elle vient du nom de l'app — celui que
  // l'utilisateur a lui-même cliqué — et non d'un gabarit générique : le
  // composeur choisit sur les descriptions du catalogue, il lui faut donc un
  // sujet, pas un identifiant.
  return (
    <AgentSurface
      surfaceId={app.id}
      composeQuestion={`Compose l'interface de « ${app.name} ».`}
      fallback={<HermesSurface app={app} />}
    />
  );
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
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Fenêtre habillée (chrome Vision)                                    */
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
        background: glassLevel.regular.background,
        backdropFilter: glassLevel.regular.backdropFilter,
        WebkitBackdropFilter: glassLevel.regular.backdropFilter,
        border: glassLevel.regular.border,
        boxShadow: isFront
          ? glassLevel.regular.boxShadow
          : '0 12px 32px -14px rgba(0,0,0,0.52)',
      }}
    >
      {/* Barre de titre */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: `1px solid ${tokens.color.border}`, background: tokens.color.surface }}
      >
        {/* Points de contrôle en code couleur */}
        <div className="flex items-center gap-2 mr-1">
          <ControlDot color={DANGER} label="Fermer" onClick={onClose} />
          <ControlDot color={WARNING} label="Réduire" onClick={onMinimize} />
          <ControlDot color={SUCCESS} label={maximized ? 'Restaurer' : 'Agrandir'} onClick={onToggleMaximize} />
        </div>

        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: `${app.color}15`, border: `1px solid ${app.color}35` }}
        >
          <app.icon className="w-3.5 h-3.5" style={{ color: app.color }} />
        </div>
        <span style={{ ...orbFont, color: TEXT, fontSize: 13 }}>
          {app.name}
        </span>
        <div className="flex items-center gap-1.5 ml-3">
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: WARNING }}
          />
          <span style={{ ...monoFont, color: MUTED, fontSize: 9, letterSpacing: '0.02em' }}>
            Flux agent en attente
          </span>
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 min-h-0">
        <MockAppContent app={app} />
      </div>

      {/* Voile de mise au fond : les fenêtres arrière ne captent que le clic focus */}
      {!isFront && <div className="absolute inset-0" style={{ background: 'rgba(8,8,10,0.25)' }} />}
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
    <div className="relative w-full h-full min-h-0 min-w-0 overflow-visible" style={{ perspective: 1400 }} onWheel={handleWheel}>
      {/* Indicateur de pile */}
      {ordered.length > 1 && (
        <div
          className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full pointer-events-none"
          style={{ zIndex: 95, background: tokens.color.surfaceRaised, border: `1px solid ${tokens.color.border}`, backdropFilter: tokens.glass }}
        >
          <Layers className="w-2.5 h-2.5" style={{ color: tokens.color.accent }} />
          <span style={{ ...monoFont, color: MUTED, fontSize: 9, letterSpacing: '0.02em' }}>
            {ordered.length} fenêtres · molette ou geste pour feuilleter
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

      {/* Hors du clip des fenêtres — sinon orbe coupée (3/4 visibles). */}
      <MiniOrb position="right" />
    </div>
  );
}
